import "server-only";

/**
 * RevenueCat, en LECTURE SEULE (uniquement des GET sur l'API v2).
 * Une clé secrète par projet, dans les variables d'environnement Vercel :
 *   REVENUECAT_KEY_SOPHIA, REVENUECAT_KEY_MICABO, REVENUECAT_KEY_UNSWIPE
 * Les identifiants de projet ne sont pas secrets ; on peut les changer avec
 *   REVENUECAT_PROJECT_SOPHIA, etc.
 */
export const RC_APPS = ["sophia", "micabo", "unswipe"] as const;
export type RcApp = (typeof RC_APPS)[number];

const DEFAULT_PROJECT: Record<RcApp, string> = {
  sophia: "proj3f496a80",
  micabo: "proj415c7a8d",
  unswipe: "proj5556884d",
};

export function rcConfig(app: RcApp): { project: string; key: string | undefined } {
  const up = app.toUpperCase();
  return { project: process.env[`REVENUECAT_PROJECT_${up}`] || DEFAULT_PROJECT[app], key: process.env[`REVENUECAT_KEY_${up}`] };
}
export const rcConfigured = (): Record<RcApp, boolean> =>
  Object.fromEntries(RC_APPS.map((a) => [a, Boolean(rcConfig(a).key)])) as Record<RcApp, boolean>;

type ChartValue = { cohort: number; measure: number; segment?: number; value: number; incomplete?: boolean };
export type ChartData = {
  values: ChartValue[];
  segments?: { display_name: string; is_total?: boolean; is_other?: boolean }[] | null;
  measures?: { display_name: string }[] | null;
};

async function chart(app: RcApp, params: Record<string, string>): Promise<ChartData> {
  const { project, key } = rcConfig(app);
  if (!key) throw new Error(`RevenueCat : clé absente pour ${app}`);
  const qs = new URLSearchParams({ currency: "EUR", realtime: "true", ...params });
  const res = await fetch(`https://api.revenuecat.com/v2/projects/${project}/charts/revenue?${qs}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RevenueCat ${app} : réponse ${res.status}`);
  return (await res.json()) as ChartData;
}

const isoDay = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

/** Lit une réponse « revenue » : revenus (mesure 0) par période, pour le segment Total. */
export function weeklyFromChart(data: ChartData): { lundi: string; revenue: number; incomplete: boolean }[] {
  const totalIdx = data.segments?.findIndex((s) => s.is_total) ?? -1;
  return data.values
    .filter((v) => v.measure === 0 && (v.segment === undefined || totalIdx < 0 || v.segment === totalIdx))
    .map((v) => ({ lundi: isoDay(v.cohort), revenue: v.value, incomplete: Boolean(v.incomplete) }))
    .sort((a, b) => a.lundi.localeCompare(b.lundi));
}

/** Lit une réponse « revenue » segmentée par pays : total des revenus par pays sur la période. */
export function countriesFromChart(data: ChartData): { country: string; revenue: number }[] {
  const segs = data.segments ?? [];
  const totals = new Map<number, number>();
  data.values.filter((v) => v.measure === 0 && v.segment !== undefined).forEach((v) => totals.set(v.segment!, (totals.get(v.segment!) ?? 0) + v.value));
  return [...totals.entries()]
    .filter(([i]) => segs[i] && !segs[i].is_total && !segs[i].is_other)
    .map(([i, revenue]) => ({ country: segs[i].display_name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Revenus par semaine (lundi → dimanche) d'une app. */
export async function weeklyRevenue(app: RcApp, start: string, end: string) {
  return weeklyFromChart(await chart(app, { start_date: start, end_date: end, resolution: "1" }));
}

/** Revenus par pays d'une app sur une période. */
export async function countryRevenue(app: RcApp, start: string, end: string) {
  return countriesFromChart(await chart(app, { start_date: start, end_date: end, resolution: "1", segment: "country", limit_num_segments: "80" }));
}
