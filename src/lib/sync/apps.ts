import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOsApps, osAppsReady, type OsApp } from "@/lib/apps/os";
import type { DayMetrics, RcDay } from "@/lib/apps/types";
import { daysAgo, parisDay, selectAll, upsertChunks } from "@/lib/sync/admin";
import { PartialSync, rcKey } from "@/lib/sync/revenuecat";

/**
 * app_metrics_daily : une ligne par app et par jour. Les chiffres RevenueCat viennent de rc_daily
 * (déjà synchronisé), l'état de l'OS est photographié le jour même. On ne réécrit jamais l'OS d'un
 * jour passé : c'est ce qui garde l'historique des comptes, du coût et des vues.
 */
export async function syncApps(db: SupabaseClient): Promise<number> {
  const { data: apps, error } = await db.from("apps").select("slug, name, os_application_id").eq("active", true);
  if (error) throw new Error(error.message);
  const rc = await selectAll<{ date: string; app: string } & RcDay>((a, b) => db.from("rc_daily").select("date, app, revenue, actives, trials, new_customers, new_subs, mrr").order("date").range(a, b));
  const existing = await selectAll<{ app: string; date: string; metrics: DayMetrics }>((a, b) => db.from("app_metrics_daily").select("app, date, metrics").order("date").range(a, b));
  const before = new Map(existing.map((r) => [`${r.app}|${r.date}`, r.metrics]));

  let os: OsApp[] | null = null;
  let osError: string | null = null;
  if (osAppsReady()) {
    try {
      os = await fetchOsApps();
    } catch (e) {
      osError = (e as Error).message;
    }
  }

  const today = parisDay(new Date());
  const recent = daysAgo(12);
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const app of apps ?? []) {
    const mine = rc.filter((r) => r.app === app.slug);
    for (const { date, app: _app, ...day } of mine) {
      void _app;
      // Les jours anciens déjà rangés ne bougent plus ; RevenueCat peut encore corriger les 12 derniers.
      if (date === today || (date < recent && before.has(`${app.slug}|${date}`))) continue;
      rows.push({ app: app.slug, date, metrics: { ...before.get(`${app.slug}|${date}`), rc: day }, updated_at: now });
    }
    const snapshot = os?.find((o) => (app.os_application_id && o.id === app.os_application_id) || o.slug === app.slug || o.name === app.name.toLowerCase())?.snapshot ?? null;
    const rcToday = mine.find((r) => r.date === today);
    const metrics: DayMetrics = {
      ...before.get(`${app.slug}|${today}`),
      ...(rcToday ? { rc: { revenue: rcToday.revenue, actives: rcToday.actives, trials: rcToday.trials, new_customers: rcToday.new_customers, new_subs: rcToday.new_subs, mrr: rcToday.mrr } } : {}),
      ...(snapshot ? { os: snapshot } : {}),
      sources: { revenuecat: Boolean(rcKey(app.slug)) && mine.some((r) => r.date >= daysAgo(3)), os: Boolean(snapshot) },
    };
    rows.push({ app: app.slug, date: today, metrics, updated_at: now });
  }
  await upsertChunks(db, "app_metrics_daily", rows, "app,date");
  if (osError) throw new PartialSync(rows.length, osError);
  return rows.length;
}
