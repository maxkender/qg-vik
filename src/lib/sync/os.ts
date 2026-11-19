import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_START, daysAgo, getJson, isoDay, upsertChunks } from "@/lib/sync/admin";

/**
 * OS → os_daily, os_posts_daily, os_accounts_daily, os_reserve_daily, os_cost_weekly. LECTURE SEULE : le QG appelle un point d'accès que l'OS expose pour lui
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
  type Raw = Record<string, unknown>;
  const data = await getJson<{ rows?: Raw[]; posts?: Raw[]; accounts?: Raw[]; reserve?: Raw[]; costs?: Raw[] } | Raw[]>(url.toString(), { Authorization: `Bearer ${process.env.OS_STATS_TOKEN}` }, "OS");
  const all = Array.isArray(data) ? { rows: data } : data;
  const now = new Date().toISOString();
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const num = (v: unknown) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
  const text = (v: unknown, lower = true) => (typeof v === "string" ? (lower ? v.trim().toLowerCase() : v.trim()) : "");
  const country = (v: unknown) => text(v).toUpperCase().slice(0, 2);
  const link = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);

  const rows = (all.rows ?? [])
    .filter((r) => day(r.date))
    .map((r) => {
      const row: Record<string, unknown> = { date: day(r.date), app: text(r.app) || "all", updated_at: now };
      COLS.forEach((c) => (row[c] = num(r[c])));
      return row;
    });
  await upsertChunks(db, "os_daily", rows, "date,app");

  // Le détail pour la page « Semaine » : posts par compte, comptes actifs, réserve, coût par pays.
  const posts = (all.posts ?? [])
    .filter((r) => day(r.date) && text(r.account, false) && text(r.app))
    .map((r) => {
      const views = (Array.isArray(r.post_views) ? r.post_views : []).map(Number).filter((v) => Number.isFinite(v) && v >= 0).map(Math.round);
      return {
        date: day(r.date), account: text(r.account, false), app: text(r.app), label: text(r.label), country: country(r.country), lang: text(r.lang) || null,
        posts_published: num(r.posts_published) ?? views.length, posts_planned: num(r.posts_planned) ?? 0, views: num(r.views) ?? views.reduce((a, v) => a + v, 0), post_views: views,
        best_post_views: num(r.best_post_views) ?? (views.length ? Math.max(...views) : null), best_post_url: link(r.best_post_url), best_post_thumb: link(r.best_post_thumb), updated_at: now,
      };
    });
  await upsertChunks(db, "os_posts_daily", posts, "date,account");
  const accounts = (all.accounts ?? [])
    .filter((r) => day(r.date) && text(r.app))
    .map((r) => ({ date: day(r.date), app: text(r.app), label: text(r.label), country: country(r.country), active_accounts: num(r.active_accounts) ?? 0, updated_at: now }));
  await upsertChunks(db, "os_accounts_daily", accounts, "date,app,label,country");
  const reserve = (all.reserve ?? [])
    .filter((r) => day(r.date) && text(r.label))
    .map((r) => ({ date: day(r.date), label: text(r.label), lang: text(r.lang), ready: num(r.ready) ?? 0, updated_at: now }));
  await upsertChunks(db, "os_reserve_daily", reserve, "date,label,lang");
  const costs = (all.costs ?? [])
    .filter((r) => day(r.week) && country(r.country))
    .map((r) => ({ week: day(r.week), country: country(r.country), cost_usd: num(r.cost_usd) ?? 0, updated_at: now }));
  await upsertChunks(db, "os_cost_weekly", costs, "week,country");
  return rows.length + posts.length + accounts.length + reserve.length + costs.length;
}