import "server-only";
import { osBase, osHeaders } from "@/lib/control/sync";
import { getJson } from "@/lib/sync/admin";
import type { OsSnapshot } from "@/lib/apps/types";

/**
 * OS → l'état de chaque app (comptes, coût des posteurs, vues, labels). LECTURE SEULE :
 * un GET sur /api/qg/apps avec l'en-tête x-qg-token. Variables Vercel : OS_API_URL et OS_QG_TOKEN.
 * Le QG ne se connecte jamais à la base de l'OS.
 */
// L'adresse complète si elle est donnée (OS_QG_URL), sinon /api/qg/apps sur le domaine de l'OS (OS_API_URL).
const appsUrl = () => process.env.OS_QG_URL || (osBase() ? `${osBase()}/api/qg/apps` : null);
export const osAppsReady = () => Boolean(appsUrl() && process.env.OS_QG_TOKEN);

type Raw = Record<string, unknown>;
const num = (...values: unknown[]) => {
  for (const v of values) if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const text = (...values: unknown[]) => {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  for (const v of values) if (typeof v === "number") return String(v);
  return "";
};
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]) : []);
// Un pourcentage peut arriver en 0,07 ou en 7 : on le ramène entre 0 et 1.
const share = (v: number | null) => (v === null ? null : v > 1 ? v / 100 : v);

export type OsApp = { id: string; slug: string; name: string; snapshot: OsSnapshot };

export function readOsApp(r: Raw): OsApp {
  return {
    id: text(r.application_id, r.id), slug: text(r.slug, r.key).toLowerCase(), name: text(r.name, r.app).toLowerCase(),
    snapshot: {
      accounts: num(r.accounts, r.active_accounts, r.comptes_actifs),
      cost_usd: num(r.cost_usd, r.poster_cost_usd, r.cost_week_usd, r.poster_cost),
      views: num(r.views_7d, r.views), posts: num(r.posts_7d, r.posts),
      median_views: num(r.median_views, r.views_median), viral_pct: share(num(r.viral_pct, r.viral_rate)),
      countries: list(r.countries).map((c) => ({ code: text(c.country, c.code).toUpperCase().slice(0, 2), accounts: num(c.accounts, c.active_accounts), cost_usd: num(c.cost_usd, c.cost) })).filter((c) => c.code),
      labels: list(r.labels).map((l) => ({ label: text(l.label, l.name), accounts: num(l.accounts, l.active_accounts), median_views: num(l.median_views, l.views_median), viral_pct: share(num(l.viral_pct, l.viral_rate)), virals: num(l.virals, l.viral_posts) })).filter((l) => l.label),
    },
  };
}

export async function fetchOsApps(): Promise<OsApp[]> {
  const data = await getJson<Raw[] | { apps?: Raw[]; data?: Raw[] }>(appsUrl()!, osHeaders(), "OS /api/qg/apps");
  return list(Array.isArray(data) ? data : (data.apps ?? data.data)).map(readOsApp);
}
