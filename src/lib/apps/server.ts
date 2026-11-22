import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Context, Row } from "@/lib/apps/report";
import { parisDay, selectAll } from "@/lib/sync/admin";

const add = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);

/** Ce dont le calcul a besoin en plus des chiffres : la date du jour, les tarifs par zone, la zone de chaque pays. */
export async function loadContext(db: SupabaseClient): Promise<Context> {
  const [rates, verdicts] = await Promise.all([db.from("zone_rates").select("zone, usd_per_account_week"), db.from("country_verdicts").select("code, zone")]);
  if (rates.error || verdicts.error) throw new Error((rates.error ?? verdicts.error)!.message);
  return {
    today: parisDay(new Date()), usdToEur: Number(process.env.USD_TO_EUR) || 0.92,
    zoneRates: Object.fromEntries((rates.data ?? []).map((r) => [r.zone, Number(r.usd_per_account_week)])),
    zones: Object.fromEntries((verdicts.data ?? []).filter((v) => v.zone).map((v) => [v.code, v.zone as string])),
  };
}

/** Les jours d'une app (ou de toutes). `since` : par défaut 11 semaines, assez pour 8 semaines pleines et les variations. */
export function loadRows(db: SupabaseClient, app: string | null, today: string, since = add(today, -77)): Promise<(Row & { app: string })[]> {
  return selectAll<Row & { app: string }>((a, b) => {
    const q = db.from("app_metrics_daily").select("app, date, metrics, updated_at").gte("date", since).order("date").range(a, b);
    return app ? q.eq("app", app) : q;
  });
}
