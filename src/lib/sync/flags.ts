import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchRule, norm, type VendorRule } from "@/lib/postes";
import { parisDay, selectAll } from "@/lib/sync/admin";

type Tx = { id: string; date: string; amount: number; counterparty: string; label: string | null; operation_type: string | null; poste: string };
type Flag = { id: string; kind: string; title: string; detail: string; vendor: string | null; amount: number | null; tx_id: string | null; month: string | null };

const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Repère ce qui mérite un coup d'œil dans les sorties d'argent. Une anomalie déjà connue
 * n'est jamais recréée ni décochée : on n'ajoute que les nouvelles.
 */
export async function refreshFlags(db: SupabaseClient): Promise<number> {
  const txs = (
    await selectAll<Tx>((a, b) => db.from("qonto_transactions").select("id, date, amount, counterparty, label, operation_type, poste").eq("side", "debit").order("date").range(a, b))
  ).map((t) => ({ ...t, amount: Number(t.amount) }));
  if (!txs.length) return 0;
  const { data: rules } = await db.from("vendor_rules").select("*").order("sort_order");
  const flags: Flag[] = [];
  const today = parisDay(new Date());
  const month = today.slice(0, 7);
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1));
  const prevMonth = prev.toISOString().slice(0, 7);
  const daysInPrev = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = Number(today.slice(8, 10));
  const firstDay = txs[0].date;

  // Par fournisseur : première apparition, totaux.
  const vendors = new Map<string, { name: string; first: string; total: number; n: number }>();
  txs.forEach((t) => {
    const k = norm(t.counterparty);
    const v = vendors.get(k) ?? { name: t.counterparty, first: t.date, total: 0, n: 0 };
    v.total += t.amount;
    v.n++;
    vendors.set(k, v);
  });

  for (const [k, v] of vendors) {
    // 1. Nouveau fournisseur : vu pour la première fois ces 30 derniers jours (et pas au tout début de l'historique).
    const age = (Date.parse(today) - Date.parse(v.first)) / 864e5;
    const history = (Date.parse(v.first) - Date.parse(firstDay)) / 864e5;
    if (age <= 30 && history >= 30) {
      flags.push({ id: `new:${k}`, kind: "new_vendor", title: `Nouveau fournisseur : ${v.name}`, detail: `Première dépense le ${dm(v.first)} · ${eur(v.total)} en ${v.n} opération${v.n > 1 ? "s" : ""}.`, vendor: v.name, amount: v.total, tx_id: null, month: v.first.slice(0, 7) });
    }
    // 2. Fournisseur inconnu : aucune règle ne le range dans un poste.
    if (!matchRule(v.name, (rules ?? []) as VendorRule[]) && !txs.some((t) => norm(t.counterparty) === k && t.poste !== "Autre")) {
      flags.push({ id: `unknown:${k}`, kind: "unknown_vendor", title: `Fournisseur inconnu : ${v.name}`, detail: `Aucune règle ne le range dans un poste · ${eur(v.total)} depuis le ${dm(v.first)}.`, vendor: v.name, amount: v.total, tx_id: null, month: null });
    }
  }

  // 3. Hausse de plus de 50 % vs le mois précédent, les deux ramenés à 30 jours.
  const spike = (label: string, key: string, pick: (t: Tx) => string) => {
    const cur = new Map<string, number>();
    const old = new Map<string, number>();
    txs.forEach((t) => {
      const m = t.date.slice(0, 7);
      if (m === month) cur.set(pick(t), (cur.get(pick(t)) ?? 0) + t.amount);
      if (m === prevMonth) old.set(pick(t), (old.get(pick(t)) ?? 0) + t.amount);
    });
    cur.forEach((sum, name) => {
      const before = ((old.get(name) ?? 0) / daysInPrev) * 30;
      const projected = (sum / elapsed) * 30;
      if (before > 0 && projected >= 100 && projected > before * 1.5) {
        flags.push({
          id: `spike:${month}:${key}:${norm(name)}`, kind: "spike", title: `${label} en hausse : ${name}`,
          detail: `+${Math.round((projected / before - 1) * 100)} % projeté sur 30 jours (${eur(projected)} contre ${eur(before)} le mois précédent).`,
          vendor: key === "v" ? name : null, amount: sum, tx_id: null, month,
        });
      }
    });
  };
  spike("Poste", "p", (t) => t.poste);
  spike("Fournisseur", "v", (t) => t.counterparty);

  // 4. Tout virement sortant de plus de 1 000 €.
  txs.filter((t) => t.operation_type === "transfer" && t.amount > 1000).forEach((t) =>
    flags.push({ id: `transfer:${t.id}`, kind: "big_transfer", title: `Virement de ${eur(t.amount)} à ${t.counterparty}`, detail: `Le ${dm(t.date)}${t.label ? ` · ${t.label}` : ""}.`, vendor: t.counterparty, amount: t.amount, tx_id: t.id, month: t.date.slice(0, 7) }),
  );

  for (let i = 0; i < flags.length; i += 500) {
    const { error } = await db.from("expense_flags").upsert(flags.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`expense_flags : ${error.message}`);
  }
  return flags.length;
}
