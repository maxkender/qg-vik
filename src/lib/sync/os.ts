import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_START, daysAgo, getJson, isoDay, upsertChunks } from "@/lib/sync/admin";

/**
 * OS → os_daily. LECTURE SEULE : le QG appelle un point d'accès que l'OS expose pour lui
 * (fonction protégée par un jeton, qui ne renvoie que des chiffres agrégés par jour).
 * Variables : OS_STATS_URL et OS_STATS_TOKEN. Le QG ne se connecte jamais à la base de l'OS.
 */
const COLS = [
  "comptes_actifs", "posts_faits", "posts_prevus", "posts_viraux", "vues_total", "vues_mediane", "nouveaux_posteurs",
  "kills", "doubles", "tickets_ouverts", "tickets_resolus", "paie_upwork", "paie_ruul",
] as const;

export const osReady = () => Boolean(process.env.OS_STATS_URL && process.env.OS_STATS_TOKEN);

export async function syncOs(db: SupabaseClient): Promise<number> {
  if (!osReady()) throw new Error("OS_STATS_URL ou OS_STATS_TOKEN manquante (accès à demander à Adrien)");
  const { count } = await db.from("os_daily").select("date", { count: "exact", head: true });
  const from = count ? daysAgo(10) : HISTORY_START;
  const url = new URL(process.env.OS_STATS_URL!);
  url.searchParams.set("from", from);
  url.searchParams.set("to", isoDay(new Date()));
  const data = await getJson<{ rows?: Record<string, unknown>[] } | Record<string, unknown>[]>(url.toString(), { Authorization: `Bearer ${process.env.OS_STATS_TOKEN}` }, "OS");
  const list = Array.isArray(data) ? data : (data.rows ?? []);
  const rows = list
    .filter((r) => typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.date as string))
    .map((r) => {
      const row: Record<string, unknown> = { date: (r.date as string).slice(0, 10), app: typeof r.app === "string" && r.app ? r.app.toLowerCase() : "all", updated_at: new Date().toISOString() };
      COLS.forEach((c) => (row[c] = r[c] === null || r[c] === undefined || Number.isNaN(Number(r[c])) ? null : Number(r[c])));
      return row;
    });
  await upsertChunks(db, "os_daily", rows, "date,app");
  return rows.length;
}
