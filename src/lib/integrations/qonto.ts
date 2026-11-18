import "server-only";

/**
 * Qonto, en LECTURE SEULE (uniquement des GET sur l'API v2 : soldes et transactions).
 * Variables d'environnement Vercel : QONTO_LOGIN (identifiant de l'organisation) et QONTO_SECRET_KEY.
 * Aucun virement, aucune écriture : ce fichier ne contient que des lectures.
 */
const BASE = "https://thirdparty.qonto.com/v2";

export const qontoConfigured = () => Boolean(process.env.QONTO_LOGIN && process.env.QONTO_SECRET_KEY);

async function get<T>(path: string): Promise<T> {
  const login = process.env.QONTO_LOGIN;
  const secret = process.env.QONTO_SECRET_KEY;
  if (!login || !secret) throw new Error("Qonto : identifiants absents");
  const res = await fetch(BASE + path, { method: "GET", headers: { Authorization: `${login}:${secret}`, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Qonto : réponse ${res.status}`);
  return (await res.json()) as T;
}

type BankAccount = { iban: string; balance: number; currency: string; name?: string; status?: string };
export async function qontoAccounts(): Promise<BankAccount[]> {
  const data = await get<{ organization: { bank_accounts: BankAccount[] } }>("/organization");
  return (data.organization?.bank_accounts ?? []).filter((a) => a.status !== "closed");
}

export type QontoDebit = { id: string; date: string; vendor: string; label: string | null; amount: number; currency: string };
type RawTx = {
  transaction_id?: string; id?: string; amount: number; side: string; currency: string; label: string;
  settled_at: string | null; emitted_at: string; reference?: string | null; operation_type?: string;
};

/** Toutes les sorties d'argent réglées depuis une date (tous les comptes ouverts). */
export async function qontoDebits(sinceIso: string): Promise<QontoDebit[]> {
  const out: QontoDebit[] = [];
  for (const account of await qontoAccounts()) {
    let page: number | null = 1;
    while (page && page <= 50) {
      const qs = new URLSearchParams({ iban: account.iban, side: "debit", settled_at_from: sinceIso, per_page: "100", page: String(page), sort_by: "settled_at:asc" });
      const data: { transactions: RawTx[]; meta?: { next_page?: number | null } } = await get(`/transactions?${qs}&status[]=completed`);
      for (const t of data.transactions ?? []) {
        if (t.side !== "debit") continue;
        out.push({
          id: t.transaction_id ?? t.id ?? `${account.iban}:${t.settled_at}:${t.amount}:${t.label}`,
          date: (t.settled_at ?? t.emitted_at).slice(0, 10),
          vendor: t.label,
          label: t.reference || null,
          amount: Math.abs(Number(t.amount)),
          currency: t.currency ?? "EUR",
        });
      }
      page = data.meta?.next_page ?? null;
    }
  }
  return out;
}
