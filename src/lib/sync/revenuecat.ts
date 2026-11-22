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

// Nettoyée : une valeur collée dans Vercel a parfois un espace ou un retour à la ligne en trop.
export const rcKey = (app: string) => (process.env[`REVENUECAT_KEY_${app.toUpperCase()}`] ?? "").trim() || undefined;

/** Forme d'une clé, sans jamais la montrer : pour comprendre un refus de RevenueCat. */
export function rcHint(app: string) {
  const raw = process.env[`REVENUECAT_KEY_${app.toUpperCase()}`] ?? "";
  const k = raw.trim();
  const prefix = k.match(/^[a-z]+_/i)?.[0] ?? "(aucun)";
  return {
    longueur: k.length,
    // Le préfixe dit le type de clé : « sk_ » = clé secrète (la bonne), « appl_ » / « goog_ » = clé publique de l'app (la mauvaise).
    prefixe: ["sk_", "appl_", "goog_", "amzn_", "strp_", "rcb_", "atk_"].includes(prefix) ? prefix : k ? "(autre)" : "(vide)",
    espaces_en_trop: raw !== k,
    contient_des_espaces: /\s/.test(k),
  };
}

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
const flat = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
// Quelques noms que RevenueCat écrit autrement que la norme.
const BY_NAME = new Map<string, string>([
  ["turkey", "TR"], ["turkiye", "TR"], ["czech republic", "CZ"], ["usa", "US"], ["uk", "GB"], ["south korea", "KR"], ["russian federation", "RU"],
  ["kosovo", "XK"], ["macao", "MO"], ["hong kong", "HK"], ["myanmar", "MM"], ["saint pierre and miquelon", "PM"], ["palestine state of", "PS"], ["congo", "CG"], ["congo the democratic republic of the", "CD"],
  ["brunei darussalam", "BN"], ["cabo verde", "CV"], ["virgin islands british", "VG"], ["virgin islands u s", "VI"],
  ["saint martin french part", "MF"], ["bonaire sint eustatius and saba", "BQ"], ["korea republic of", "KR"], ["viet nam", "VN"],
  ["iran islamic republic of", "IR"], ["moldova republic of", "MD"], ["tanzania united republic of", "TZ"], ["taiwan province of china", "TW"],
  ["bolivia plurinational state of", "BO"], ["venezuela bolivarian republic of", "VE"], ["lao people s democratic republic", "LA"], ["syrian arab republic", "SY"],
]);
// Tous les codes à deux lettres que le navigateur ou le serveur sait nommer.
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    try {
      // On écarte les anciens codes (DD, BU, YU…) : la norme les ramène à un code actuel différent.
      if (new Intl.Locale(`und-${code}`).region !== code) continue;
      const n = EN.of(code);
      if (n && n !== code && !BY_NAME.has(flat(n))) BY_NAME.set(flat(n), code);
    } catch {}
  }
}
/** Lundi de la semaine d'une date AAAA-MM-JJ (en UTC, comme les jours de RevenueCat). */
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return isoDay(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5));
}
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
  const { data: apps, error } = await db.from("apps").select("key:slug, rc_project_id:revenuecat_project_id").eq("active", true);
  if (error) throw new Error(error.message);
  const ready = (apps ?? []).filter((a) => a.rc_project_id && rcKey(a.key));
  if (!ready.length) throw new Error("Aucune clé RevenueCat (REVENUECAT_KEY_<APP>)");
  const missing = (apps ?? []).filter((a) => a.rc_project_id && !rcKey(a.key)).map((a) => a.key);

  const today = isoDay(new Date());
  // Les apps en parallèle (une clé par projet), les graphiques d'une app à la suite.
  const settled = await Promise.allSettled(
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

      // Par pays : on demande les chiffres PAR JOUR et on les regroupe nous-mêmes en semaines du lundi
      // au dimanche. (RevenueCat découpe les semaines selon le réglage de chaque projet, parfois le dimanche.)
      const from = mondayOf(HISTORY_START);
      const seg = { start_date: from, end_date: today, resolution: "0", segment: "country", limit_num_segments: "250" };
      const weekly = new Map<string, { week: string; app: string; country: string; country_name: string; revenue: number; new_users: number; trials: number }>();
      const put = (r: ReturnType<typeof readChart>[number], col: "revenue" | "new_users" | "trials") => {
        if (!r.segment || r.isTotal) return;
        const code = countryCode(r.segment);
        const week = mondayOf(r.date);
        const k = `${week}|${code}`;
        const row = weekly.get(k) ?? { week, app: app.key, country: code, country_name: r.segment, revenue: 0, new_users: 0, trials: 0 };
        row[col] += r.value;
        weekly.set(k, row);
      };
      readChart(await chart(app, key, "revenue", seg)).filter((r) => r.measure === "Revenue").forEach((r) => put(r, "revenue"));
      readChart(await chart(app, key, "customers_new", seg)).filter((r) => r.measure === "New Customers").forEach((r) => put(r, "new_users"));
      readChart(await chart(app, key, "trials_new", seg)).filter((r) => r.measure === "New Trials").forEach((r) => put(r, "trials"));
      const weeklyRows = [...weekly.values()].map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100, new_users: Math.round(r.new_users), trials: Math.round(r.trials), updated_at: new Date().toISOString() }));
      // On remplace tout l'historique par pays de l'app : pas de vieille ligne qui traîne.
      if (weeklyRows.length) {
        const { error: delError } = await db.from("rc_country_weekly").delete().eq("app", app.key);
        if (delError) throw new Error(`rc_country_weekly : ${delError.message}`);
        await upsertChunks(db, "rc_country_weekly", weeklyRows, "week,app,country");
      }
      return dailyRows.length + weeklyRows.length;
    }),
  );
  // Une app en échec (clé refusée…) ne fait pas perdre les autres.
  const rows = settled.reduce((a, r) => a + (r.status === "fulfilled" ? r.value : 0), 0);
  const problems = [
    ...settled.flatMap((r, i) => (r.status === "rejected" ? [`${ready[i].key} : ${(r.reason as Error).message.replace(/\s+/g, " ").slice(0, 160)}`] : [])),
    ...(missing.length ? [`clé manquante pour ${missing.join(", ")}`] : []),
  ];
  if (problems.length) throw new PartialSync(rows, problems.join(" · "));
  return rows;
}

/** Une partie a été synchronisée, mais il manque quelque chose : on le dit sans perdre le reste. */
export class PartialSync extends Error {
  constructor(readonly rows: number, message: string) {
    super(message);
  }
}
