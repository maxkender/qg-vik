import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_START, daysAgo, getJson, isoDay, upsertChunks } from "@/lib/sync/admin";

/**
 * RevenueCat → rc_daily et rc_country_weekly. LECTURE SEULE (GET sur l'API v2 Charts).
 * Une clé secrète en lecture par projet : REVENUECAT_KEY_<APP> (ex. REVENUECAT_KEY_SOPHIA).
 */
type Chart = {
  values: { cohort: number; measure: number; segment?: number; value: number }[];
  measures?: { display_name: string }[] | null;
  segments?: { display_name: string; is_total?: boolean; is_other?: boolean }[] | null;
};
type App = { key: string; rc_project_id: string | null };

export const rcKey = (app: string) => process.env[`REVENUECAT_KEY_${app.toUpperCase()}`];

// Graphique → (mesure RevenueCat → colonne de rc_daily)
const DAILY: { chart: string; map: Record<string, string> }[] = [
  { chart: "revenue", map: { Revenue: "revenue" } },
  { chart: "actives_new", map: { "Total Paid Subscriptions": "new_subs", "Trial Conversions": "trial_conversions" } },
  { chart: "trials_new", map: { "New Trials": "trials" } },
  { chart: "refunds", map: { "Refunded Revenue": "refunds", "Refunded Transactions": "refund_count" } },
  { chart: "actives", map: { Actives: "actives" } },
  { chart: "mrr", map: { MRR: "mrr" } },
];
const INTEGER = new Set(["new_subs", "trial_conversions", "trials", "refund_count", "actives"]);

async function chart(app: App, key: string, name: string, params: Record<string, string>): Promise<Chart> {
  const qs = new URLSearchParams({ currency: "EUR", ...params });
  return getJson<Chart>(`https://api.revenuecat.com/v2/projects/${app.rc_project_id}/charts/${name}?${qs}`, { Authorization: `Bearer ${key}` }, `RevenueCat ${app.key}/${name}`);
}

// Nom anglais du pays → code ISO (RevenueCat renvoie « Germany », « Türkiye »…).
const EN = new Intl.DisplayNames(["en"], { type: "region" });
const CODES = "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KR KW KZ LA LB LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PR PS PT PY QA RO RS RU RW SA SC SD SE SG SI SK SL SM SN SO SR SV SY SZ TD TG TH TJ TM TN TR TT TW TZ UA UG US UY UZ VE VN YE ZA ZM ZW".split(" ");
const flat = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const BY_NAME = new Map<string, string>([["turkey", "TR"], ["turkiye", "TR"], ["czech republic", "CZ"], ["usa", "US"], ["uk", "GB"], ["south korea", "KR"], ["russia", "RU"], ["hong kong", "HK"]]);
CODES.forEach((c) => {
  try {
    const n = EN.of(c);
    if (n) BY_NAME.set(flat(n), c);
  } catch {}
});
export const countryCode = (name: string) => (/^[A-Z]{2}$/.test(name) ? name : (BY_NAME.get(flat(name)) ?? name));

/** Mesure → valeur, par date (et par segment si le graphique est segmenté). */
export function readChart(data: Chart): { date: string; measure: string; segment: string | null; isTotal: boolean; value: number }[] {
  return data.values.map((v) => {
    const seg = v.segment !== undefined ? data.segments?.[v.segment] : undefined;
    return {
      date: isoDay(new Date(v.cohort * 1000)),
      measure: data.measures?.[v.measure]?.display_name ?? String(v.measure),
      segment: seg ? (seg.is_other ? "Autres" : seg.display_name) : null,
      isTotal: Boolean(seg?.is_total),
      value: v.value,
    };
  });
}

export async function syncRevenueCat(db: SupabaseClient): Promise<number> {
  const { data: apps, error } = await db.from("apps").select("key, rc_project_id").eq("active", true);
  if (error) throw new Error(error.message);
  const ready = (apps ?? []).filter((a) => a.rc_project_id && rcKey(a.key));
  if (!ready.length) throw new Error("Aucune clé RevenueCat (REVENUECAT_KEY_<APP>)");
  const missing = (apps ?? []).filter((a) => a.rc_project_id && !rcKey(a.key)).map((a) => a.key);

  const today = isoDay(new Date());
  // Les apps en parallèle (une clé par projet), les graphiques d'une app à la suite.
  const counts = await Promise.all(
    ready.map(async (app) => {
      const key = rcKey(app.key)!;
      const { count } = await db.from("rc_daily").select("date", { count: "exact", head: true }).eq("app", app.key);
      // Première fois : tout depuis le 1er septembre. Ensuite : les 10 derniers jours.
      const start = count ? daysAgo(10) : HISTORY_START;

      const daily = new Map<string, Record<string, unknown>>();
      for (const { chart: name, map } of DAILY) {
        const rows = readChart(await chart(app, key, name, { start_date: start, end_date: today, resolution: "0" }));
        rows.filter((r) => r.segment === null && map[r.measure]).forEach((r) => {
          const row: Record<string, unknown> = daily.get(r.date) ?? { date: r.date, app: app.key };
          const col = map[r.measure];
          row[col] = INTEGER.has(col) ? Math.round(r.value) : r.value;
          daily.set(r.date, row);
        });
      }
      const dailyRows = [...daily.values()].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
      await upsertChunks(db, "rc_daily", dailyRows, "date,app");

      // Par semaine et par pays : revenus et nouveaux utilisateurs.
      const weekStart = count ? daysAgo(28) : HISTORY_START;
      const seg = { start_date: weekStart, end_date: today, resolution: "1", segment: "country", limit_num_segments: "250" };
      const weekly = new Map<string, Record<string, unknown>>();
      const put = (r: ReturnType<typeof readChart>[number], col: "revenue" | "new_users") => {
        if (!r.segment || r.isTotal) return;
        const code = countryCode(r.segment);
        const k = `${r.date}|${code}`;
        const row: Record<string, unknown> = weekly.get(k) ?? { week: r.date, app: app.key, country: code, country_name: r.segment, revenue: 0, new_users: 0 };
        row[col] = col === "new_users" ? Math.round(r.value) : r.value;
        weekly.set(k, row);
      };
      readChart(await chart(app, key, "revenue", seg)).filter((r) => r.measure === "Revenue").forEach((r) => put(r, "revenue"));
      readChart(await chart(app, key, "customers_new", seg)).filter((r) => r.measure === "New Customers").forEach((r) => put(r, "new_users"));
      const weeklyRows = [...weekly.values()].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
      await upsertChunks(db, "rc_country_weekly", weeklyRows, "week,app,country");
      return dailyRows.length + weeklyRows.length;
    }),
  );
  if (missing.length) throw new PartialSync(counts.reduce((a, b) => a + b, 0), `Clé manquante pour : ${missing.join(", ")}`);
  return counts.reduce((a, b) => a + b, 0);
}

/** Une partie a été synchronisée, mais il manque quelque chose : on le dit sans perdre le reste. */
export class PartialSync extends Error {
  constructor(readonly rows: number, message: string) {
    super(message);
  }
}
