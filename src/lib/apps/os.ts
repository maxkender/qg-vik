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

type Day = { jour: string | null; app: string; key: string; posts: number; views: number | null; median: number | null; viral: number | null; accounts: number | null; cost: number | null };
const dayOf = (r: Raw, key: string): Day => ({ jour: text(r.jour) || null, app: text(r.application_id), key: text(r[key]), posts: num(r.posts) ?? 0, views: num(r.vues_total), median: num(r.vues_mediane), viral: share(num(r.pct_10k)), accounts: num(r.comptes_actifs), cost: num(r.cout_posteurs_usd) });
const total = (rows: Day[], pick: (d: Day) => number | null) => { const v = rows.map(pick).filter((x): x is number => x !== null); return v.length ? v.reduce((a, x) => a + x, 0) : null; };
// Médiane et % à 10 k d'une période : moyenne des jours, pondérée par le nombre de posts.
const weighted = (rows: Day[], pick: (d: Day) => number | null) => { const v = rows.filter((d) => pick(d) !== null && d.posts > 0); const posts = v.reduce((a, d) => a + d.posts, 0); return posts ? v.reduce((a, d) => a + pick(d)! * d.posts, 0) / posts : null; };
// Comptes actifs : ceux du dernier jour de la période.
const lastAccounts = (rows: Day[]) => { const last = rows.map((d) => d.jour ?? "").sort().at(-1); return total(rows.filter((d) => d.jour === last), (d) => d.accounts); };

/**
 * La réponse de l'OS (« jours », « par_pays », « par_label », une ligne par jour) résumée par app sur la période demandée :
 * vues, posts et coût additionnés ; comptes du dernier jour.
 */
export function readOsApps(data: unknown): OsApp[] {
  const d = (data && typeof data === "object" ? data : {}) as Raw;
  const days = list(d.jours).map((r) => dayOf(r, "application_id"));
  const countries = list(d.par_pays).map((r) => dayOf(r, "pays"));
  const labels = list(d.par_label).map((r) => dayOf(r, "label"));
  const groups = (rows: Day[]) => [...new Set(rows.map((r) => r.key).filter(Boolean))].map((key) => ({ key, rows: rows.filter((r) => r.key === key) }));
  return list(d.applications).map((a) => {
    const id = text(a.application_id, a.id);
    const mine = (rows: Day[]) => rows.filter((r) => r.app === id);
    const own = mine(days);
    const median = weighted(own, (x) => x.median);
    return {
      id, slug: text(a.slug).toLowerCase(), name: text(a.nom, a.name).toLowerCase(),
      snapshot: {
        accounts: lastAccounts(own), cost_usd: total(own, (x) => x.cost), views: total(own, (x) => x.views), posts: own.length ? own.reduce((n, x) => n + x.posts, 0) : null,
        median_views: median === null ? null : Math.round(median), viral_pct: weighted(own, (x) => x.viral),
        countries: groups(mine(countries)).map((g) => ({ code: g.key.toUpperCase().slice(0, 2), accounts: lastAccounts(g.rows), cost_usd: total(g.rows, (x) => x.cost) })),
        labels: groups(mine(labels)).map((g) => { const m = weighted(g.rows, (x) => x.median), v = weighted(g.rows, (x) => x.viral), posts = g.rows.reduce((n, x) => n + x.posts, 0); return { label: g.key, accounts: lastAccounts(g.rows), median_views: m === null ? null : Math.round(m), viral_pct: v, virals: v === null ? null : Math.round(v * posts) }; }),
      },
    };
  });
}

/** La forme d'une réponse, sans ses valeurs : pour ajuster la lecture sans exposer de données. */
function shape(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `× ${v.length}`] : [];
  if (v && typeof v === "object") return depth > 3 ? "{…}" : Object.fromEntries(Object.entries(v as Raw).slice(0, 40).map(([k, x]) => [k, shape(x, depth + 1)]));
  return v === null ? "null" : typeof v;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const range = (from: string, to: string) => `${appsUrl()}${appsUrl()!.includes("?") ? "&" : "?"}from=${from}&to=${to}`;
/** Les 7 derniers jours pleins (jusqu'à hier). */
export const lastWeek = () => { const to = new Date(Date.now() - 864e5); return { from: iso(new Date(to.getTime() - 6 * 864e5)), to: iso(to) }; };
export async function osAppsShape(): Promise<unknown> {
  const w = lastWeek();
  return shape(await getJson<unknown>(range(w.from, w.to), osHeaders(), "OS /api/qg/apps"));
}

export async function fetchOsApps(from: string, to: string): Promise<OsApp[]> {
  return readOsApps(await getJson<unknown>(range(from, to), osHeaders(), "OS /api/qg/apps"));
}
