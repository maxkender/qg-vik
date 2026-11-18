import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchRule, type VendorRule } from "@/lib/postes";
import { HISTORY_START, daysAgo, getJson, isoDay, parisDay, selectAll, upsertChunks } from "@/lib/sync/admin";
import { refreshFlags } from "@/lib/sync/flags";

/**
 * Qonto → qonto_transactions et qonto_balance_daily. LECTURE SEULE (GET sur l'API v2).
 * Variables : QONTO_LOGIN (identifiant de l'organisation) et QONTO_SECRET_KEY. Aucun virement, aucune écriture chez Qonto.
 */
const BASE = "https://thirdparty.qonto.com/v2";
type Account = { iban: string; balance: number | string; status?: string };
type Tx = {
  id: string; transaction_id: string; amount: number; side: "debit" | "credit"; operation_type: string; currency: string;
  local_amount: number | null; local_currency: string | null; label: string; clean_counterparty_name?: string | null;
  reference: string | null; note: string | null; settled_at: string | null; emitted_at: string; status: string;
  settled_balance: number | null; cashflow_category?: { name?: string } | string | null; cashflow_subcategory?: { name?: string } | string | null;
};

// Les valeurs collées dans Vercel ont parfois un espace ou un retour à la ligne en trop.
const login = () => (process.env.QONTO_LOGIN ?? "").trim();
const secret = () => (process.env.QONTO_SECRET_KEY ?? "").trim();
export const qontoReady = () => Boolean(login() && secret());
const auth = () => ({ Authorization: `${login()}:${secret()}` });

/** Forme des deux valeurs, sans jamais les montrer : pour comprendre un refus de Qonto. */
export function qontoHint() {
  const raw = { l: process.env.QONTO_LOGIN ?? "", s: process.env.QONTO_SECRET_KEY ?? "" };
  return {
    login_longueur: login().length,
    login_ressemble_a_un_identifiant: /^[a-z0-9]+(-[a-z0-9]+)*-\d+$/.test(login()),
    login_contient_arobase: login().includes("@"),
    login_contient_deux_points: login().includes(":"),
    secret_longueur: secret().length,
    secret_hexadecimal: /^[0-9a-f]+$/i.test(secret()),
    espaces_en_trop: raw.l !== raw.l.trim() || raw.s !== raw.s.trim(),
    valeurs_identiques: login() !== "" && login() === secret(),
  };
}
const catName = (c: Tx["cashflow_category"]) => (typeof c === "string" ? c : (c?.name ?? null));

export async function syncQonto(db: SupabaseClient): Promise<number> {
  if (!qontoReady()) throw new Error("QONTO_LOGIN ou QONTO_SECRET_KEY manquante");
  const org = await getJson<{ organization: { bank_accounts: Account[] } }>(`${BASE}/organization`, auth(), "Qonto");
  const accounts = (org.organization?.bank_accounts ?? []).filter((a) => a.status !== "closed");

  const { count } = await db.from("qonto_transactions").select("id", { count: "exact", head: true });
  // Première fois : tout depuis le 1er septembre. Ensuite : les 10 derniers jours.
  const since = count ? daysAgo(10) : HISTORY_START;

  const txs: (Tx & { iban: string })[] = [];
  for (const account of accounts) {
    let page: number | null = 1;
    let firstId: string | null = null;
    while (page && page <= 200) {
      const qs = new URLSearchParams({ iban: account.iban, settled_at_from: `${since}T00:00:00.000Z`, per_page: "100", page: String(page), sort_by: "settled_at:asc" });
      const data: { transactions: Tx[]; meta?: { next_page?: number | null } } = await getJson(`${BASE}/transactions?${qs}&status[]=completed`, auth(), "Qonto");
      const list = data.transactions ?? [];
      // Garde-fou : si la pagination ne bouge pas, on s'arrête au lieu de tourner en rond.
      if (page > 1 && list[0]?.id === firstId) break;
      if (page === 1) firstId = list[0]?.id ?? null;
      list.forEach((t) => txs.push({ ...t, iban: account.iban }));
      page = data.meta?.next_page ?? null;
    }
  }

  const { data: rules } = await db.from("vendor_rules").select("*").order("sort_order");
  const locked = new Map(
    (await selectAll<{ id: string; poste: string; app: string | null }>((a, b) => db.from("qonto_transactions").select("id, poste, app").eq("poste_locked", true).range(a, b))).map((r) => [r.id, r]),
  );
  const rows = txs.map((t) => {
    const counterparty = (t.clean_counterparty_name || t.label || "Inconnu").trim();
    const rule = matchRule(`${counterparty} ${t.label ?? ""}`, (rules ?? []) as VendorRule[]);
    const keep = locked.get(t.id);
    return {
      id: t.id,
      transaction_id: t.transaction_id,
      date: parisDay(t.settled_at ?? t.emitted_at),
      settled_at: t.settled_at,
      emitted_at: t.emitted_at,
      amount: Math.abs(Number(t.amount)),
      side: t.side,
      operation_type: t.operation_type,
      currency: t.currency ?? "EUR",
      local_amount: t.local_amount,
      local_currency: t.local_currency,
      counterparty,
      label: t.label,
      reference: t.reference || null,
      note: t.note,
      qonto_category: [catName(t.cashflow_category), catName(t.cashflow_subcategory)].filter(Boolean).join(" › ") || null,
      status: t.status,
      settled_balance: t.settled_balance,
      // Un poste choisi à la main dans le QG n'est jamais écrasé.
      poste: keep ? keep.poste : (rule?.poste ?? "Autre"),
      app: keep ? keep.app : (rule?.app ?? null),
      poste_locked: Boolean(keep),
      updated_at: new Date().toISOString(),
    };
  });
  await upsertChunks(db, "qonto_transactions", rows, "id");

  // Solde de chaque jour : le solde après la dernière opération du jour (compte par compte), reporté les jours sans opération.
  const today = parisDay(new Date());
  const perAccount = accounts.map((account) => {
    const lastOfDay = new Map<string, { at: string; balance: number }>();
    txs.filter((t) => t.iban === account.iban && t.settled_at && t.settled_balance !== null).forEach((t) => {
      const day = parisDay(t.settled_at!);
      const cur = lastOfDay.get(day);
      if (!cur || t.settled_at! > cur.at) lastOfDay.set(day, { at: t.settled_at!, balance: Number(t.settled_balance) });
    });
    lastOfDay.set(today, { at: new Date().toISOString(), balance: Number(account.balance) });
    return lastOfDay;
  });
  const days = [...new Set(perAccount.flatMap((m) => [...m.keys()]))].sort();
  const balances: { date: string; balance: number }[] = [];
  if (days.length) {
    const carry = perAccount.map(() => null as number | null);
    for (let d = new Date(days[0] + "T12:00:00Z"); isoDay(d) <= today; d = new Date(d.getTime() + 864e5)) {
      const day = isoDay(d);
      perAccount.forEach((m, i) => {
        const v = m.get(day);
        if (v) carry[i] = v.balance;
      });
      // On n'écrit un jour que si tous les comptes ont déjà un solde connu.
      if (carry.every((c) => c !== null)) balances.push({ date: day, balance: Math.round(carry.reduce((a, c) => a! + c!, 0)! * 100) / 100 });
    }
  }
  await upsertChunks(db, "qonto_balance_daily", balances, "date");

  await refreshFlags(db);
  return rows.length;
}
