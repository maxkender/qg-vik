/** Ce qu'on range dans app_metrics_daily.metrics : un jour d'une app. Une source absente reste à null, jamais à zéro. */
export type RcDay = { revenue: number | null; actives: number | null; trials: number | null; new_customers: number | null; new_subs: number | null; mrr: number | null };
export type OsLabel = { label: string; accounts: number | null; median_views: number | null; viral_pct: number | null; virals: number | null };
export type OsCountry = { code: string; accounts: number | null; cost_usd: number | null };
/** L'état de l'app dans l'OS le jour de la synchro. Vues et posts : sur les 7 derniers jours. Coût : par semaine. */
export type OsSnapshot = {
  accounts: number | null; cost_usd: number | null; views: number | null; posts: number | null; median_views: number | null; viral_pct: number | null;
  countries: OsCountry[]; labels: OsLabel[];
};
export type DayMetrics = { rc?: RcDay | null; os?: OsSnapshot | null; sources?: { revenuecat: boolean; os: boolean } };
