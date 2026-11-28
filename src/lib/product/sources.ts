import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Option, Question, Retention, RetentionKey } from "@/lib/product/types";
import { RETENTION_DAYS } from "@/lib/product/types";

/**
 * Les bases des apps, LECTURE SEULE : le QG n'y écrit jamais et n'y crée rien.
 * Deux variables Vercel par app : APPDB_<APP>_URL (adresse du projet Supabase de l'app)
 * et APPDB_<APP>_KEY (sa clé secrète, côté serveur uniquement).
 */
export type Source =
  /** Tables déjà agrégées par jour (daily_onboarding_stats, daily_cohort_retention, daily_paywall_stats). */
  | { kind: "aggregates"; order: string[]; end: string[]; skip: string[] }
  /** Table app_events brute : assez petite pour être lue telle quelle. */
  | { kind: "events" };

export const SOURCES: Record<string, Source> = {
  sophia: {
    kind: "aggregates",
    // L'ordre des écrans (iOS et Android confondus). Un écran absent d'ici se range à la suite, par fréquentation.
    order: [
      "welcome", "language", "lessons", "researchers", "intro", "social_proof", "name", "age", "gender", "knowledge", "motivation", "objective", "topics",
      "objective_intro", "phone_time", "years_grid", "transform", "questions", "mission", "personalize", "swipe_courses", "reading_time", "curve_90",
      "notifications", "review", "loading", "profile", "login", "account", "follow_creators", "welcome_aboard", "features", "trial_steps", "reminder",
      "paywall", "paywall_annual", "paywall_comparison",
    ],
    // L'onboarding est fini quand le premier paywall s'affiche (« paywall » sur Android, « paywall_annual » sur iOS).
    end: ["paywall", "paywall_annual"],
    // Des centaines de valeurs (un cours par ligne) : illisible ici.
    skip: ["swipe_liked", "swipe_passed"],
  },
  artura: { kind: "events" },
};

const OS_PROJECT_REF = "mbikecieskoobeizixig"; // projet de l'OS : jamais ici
const env = (app: string, name: "URL" | "KEY") => (process.env[`APPDB_${app.toUpperCase()}_${name}`] ?? "").trim();
export const sourceReady = (app: string) => Boolean(SOURCES[app] && env(app, "URL") && env(app, "KEY"));

export function appDb(app: string): SupabaseClient {
  const url = env(app, "URL");
  const key = env(app, "KEY");
  if (!url || !key) throw new Error(`APPDB_${app.toUpperCase()}_URL ou APPDB_${app.toUpperCase()}_KEY manquante`);
  if (url.includes(OS_PROJECT_REF)) throw new Error("Refusé : c'est la base de l'OS.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>;
/**
 * Toutes les lignes d'une requête. La première page donne le total, les suivantes partent en parallèle (8 à la fois).
 * La requête doit être triée sur une clé unique, sinon les pages se chevauchent.
 */
export async function readAll<T>(run: (from: number, to: number, count: boolean) => Page<T>, label: string): Promise<T[]> {
  const first = await run(0, 999, true);
  if (first.error) throw new Error(`${label} : ${first.error.message}`);
  const out = [...(first.data ?? [])];
  const starts: number[] = [];
  for (let from = 1000; from < (first.count ?? 0); from += 1000) starts.push(from);
  for (let i = 0; i < starts.length; i += 8) {
    const pages = await Promise.all(starts.slice(i, i + 8).map((from) => run(from, from + 999, false)));
    for (const p of pages) {
      if (p.error) throw new Error(`${label} : ${p.error.message}`);
      out.push(...(p.data ?? []));
    }
  }
  return out;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5));
export const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + pick(r), 0);

/** Les taux J1 à J30 : revenus / taille, sur les seules cohortes dont J+n est passé. */
export function retentionRates(cohorts: Retention["cohorts"]): Retention["rates"] {
  return Object.fromEntries(RETENTION_DAYS.map((n) => {
    const k = `d${n}` as RetentionKey;
    const known = cohorts.filter((c) => c[k] !== null && c.size > 0);
    const base = sum(known, (c) => c.size);
    return [k, base ? sum(known, (c) => c[k]!) / base : null];
  })) as Retention["rates"];
}

/**
 * Une question lisible : les valeurs numériques trop nombreuses sont rangées en 6 tranches,
 * les autres sont limitées aux 12 premières (le reste devient « Autres »).
 */
export function tidy(q: Question): Question {
  let options = [...q.options].sort((a, b) => b.users - a.users);
  const numeric = options.length > 8 && options.every((o) => o.value !== "" && Number.isFinite(Number(o.value)));
  if (numeric) {
    const values = options.map((o) => Number(o.value));
    const min = Math.min(...values), max = Math.max(...values);
    const size = Math.max(1, Math.ceil((max - min + 1) / 6));
    const buckets = new Map<number, number>();
    for (const o of options) {
      const b = Math.floor((Number(o.value) - min) / size);
      buckets.set(b, (buckets.get(b) ?? 0) + o.users);
    }
    options = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([b, users]): Option => {
      const lo = min + b * size, hi = Math.min(max, lo + size - 1);
      return { value: lo === hi ? String(lo) : `${lo} à ${hi}`, users };
    });
  } else if (options.length > 12) {
    options = [...options.slice(0, 11), { value: "Autres", users: sum(options.slice(11), (o) => o.users) }];
  }
  return { ...q, options };
}
