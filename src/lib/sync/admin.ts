import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const OS_PROJECT_REF = "mbikecieskoobeizixig"; // projet de l'OS : jamais ici

/** Client serveur de la base DU QG (clé secrète, variables Vercel). Sert uniquement à ranger les données synchronisées. */
export function adminDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_SECRET_KEY manquante");
  if (url.includes(OS_PROJECT_REF)) throw new Error("Refusé : c'est la base de l'OS, pas celle du QG.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const HISTORY_START = "2026-09-01";
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 864e5));
const PARIS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
/** Date du jour à Paris (AAAA-MM-JJ) pour un instant donné. */
export const parisDay = (d: Date | string) => PARIS.format(typeof d === "string" ? new Date(d) : d);

/** Écrit par paquets pour rester sous les limites de l'API. */
export async function upsertChunks(db: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + size), { onConflict });
    if (error) throw new Error(`${table} : ${error.message}`);
  }
}

/** Lit toutes les lignes d'une requête, page par page (l'API en renvoie 1 000 au plus à la fois). */
export async function selectAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await run(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** GET uniquement : le QG ne fait que lire ses sources. Réessaie si la source demande de patienter. */
export async function getJson<T>(url: string, headers: Record<string, string>, label: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json", ...headers }, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = Math.min(Number(res.headers.get("retry-after")) || 2 ** attempt * 2, 65);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const body = (await res.text()).slice(0, 200);
    throw new Error(`${label} : réponse ${res.status}${body ? ` (${body})` : ""}`);
  }
}
