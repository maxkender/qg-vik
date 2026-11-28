import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, readAll, retentionRates, sum, tidy, type Source } from "@/lib/product/sources";
import type { Cohort, Product, Question, RetentionKey } from "@/lib/product/types";
import { RETENTION_DAYS } from "@/lib/product/types";

type Stat = { day: string; kind: "step" | "answer" | "answered"; key: string; value: string; installs: number; updated_at: string };
type CohortRow = { cohort_day: string; signups: number; tracked: number } & Record<`reopened_${1 | 3 | 7 | 14 | 30}`, number>;
type PaywallStat = { paywall_id: string; viewers: number; purchases_started: number; buyers: number };

/**
 * Une app qui range déjà ses chiffres par jour (Sophia). Jours en UTC, comme dans l'app.
 * Les lignes sont détaillées par plateforme, langue et version : on les additionne ici.
 */
export async function readAggregates(db: SupabaseClient, app: string, source: Extract<Source, { kind: "aggregates" }>, days: number, today: string): Promise<Product> {
  const from = addDays(today, -(days - 1));
  const skip = `(${source.skip.join(",")})`;
  // Un jour à la fois (6 de front), dans l'ordre de la clé primaire : la base n'a rien à trier.
  const dayList: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) dayList.push(d);
  const readDay = (d: string) => readAll<Stat>((a, b, count) => {
    const q = db.from("daily_onboarding_stats").select("day, kind, key, value, installs, updated_at", count ? { count: "exact" } : undefined).eq("day", d)
      .order("platform").order("app_version").order("lang").order("kind").order("key").order("value").range(a, b);
    return source.skip.length ? q.not("key", "in", skip) : q;
  }, "onboarding");
  const readStats = async () => {
    const out: Stat[] = [];
    for (let i = 0; i < dayList.length; i += 6) out.push(...(await Promise.all(dayList.slice(i, i + 6).map(readDay))).flat());
    return out;
  };
  const [stats, cohortRows, paywalls] = await Promise.all([
    readStats(),
    // 45 jours de cohortes, quelle que soit la période : il en faut 30 pour connaître J30.
    readAll<CohortRow>((a, b, count) => db.from("daily_cohort_retention")
      .select("cohort_day, signups, tracked, reopened_1, reopened_3, reopened_7, reopened_14, reopened_30", count ? { count: "exact" } : undefined)
      .gte("cohort_day", addDays(today, -45)).lt("cohort_day", today).order("cohort_day", { ascending: false }).range(a, b), "rétention"),
    readAll<PaywallStat>((a, b, count) => db.from("daily_paywall_stats").select("paywall_id, viewers, purchases_started, buyers", count ? { count: "exact" } : undefined).gte("day", from)
      .order("day").order("platform").order("app_version").order("lang").order("paywall_id").order("offering").order("experiment").order("variant").range(a, b), "paywall"),
  ]);

  const steps = new Map<string, number>();
  const byDay = new Map<string, { started: number; completed: number }>();
  const answered = new Map<string, number>();
  const options = new Map<string, Map<string, number>>();
  const first = source.order[0];
  for (const s of stats) {
    if (s.kind === "step") {
      steps.set(s.key, (steps.get(s.key) ?? 0) + s.installs);
      const d = byDay.get(s.day) ?? { started: 0, completed: 0 };
      if (s.key === first) d.started += s.installs;
      if (source.end.includes(s.key)) d.completed += s.installs;
      byDay.set(s.day, d);
    } else if (s.kind === "answered") {
      answered.set(s.key, (answered.get(s.key) ?? 0) + s.installs);
    } else {
      const o = options.get(s.key) ?? new Map<string, number>();
      o.set(s.value, (o.get(s.value) ?? 0) + s.installs);
      options.set(s.key, o);
    }
  }
  const rank = (key: string) => { const i = source.order.indexOf(key); return i < 0 ? Infinity : i; };
  const questions: Question[] = [...options.entries()].map(([key, o]) => {
    const list = [...o.entries()].map(([value, users]) => ({ value, users }));
    const n = answered.get(key) ?? sum(list, (x) => x.users);
    // Plus de réponses que de répondants : la question accepte plusieurs choix.
    return tidy({ key, answered: n, multi: sum(list, (x) => x.users) > n * 1.02, options: list });
  }).sort((a, b) => rank(a.key) - rank(b.key) || b.answered - a.answered);

  // « Revenu dans l'app à J+n », parmi les installations suivies. Les cohortes d'avant le suivi (moins de la moitié suivie) sont écartées.
  const cohorts: Cohort[] = cohortRows.filter((r) => r.tracked > 0 && r.tracked >= r.signups / 2).map((r) => ({
    day: r.cohort_day, size: r.tracked,
    ...(Object.fromEntries(RETENTION_DAYS.map((n) => [`d${n}`, addDays(r.cohort_day, n) < today ? r[`reopened_${n}`] : null])) as Record<RetentionKey, number | null>),
  }));

  const pw = new Map<string, { viewers: number; started: number; buyers: number }>();
  for (const p of paywalls) {
    const x = pw.get(p.paywall_id) ?? { viewers: 0, started: 0, buyers: 0 };
    x.viewers += p.viewers; x.started += p.purchases_started; x.buyers += p.buyers;
    pw.set(p.paywall_id, x);
  }
  const rows = [...pw.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => b.viewers - a.viewers);
  const daily = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, d]) => ({ day, ...d }));

  return {
    app, days, from, to: today, unit: "installs",
    updated_at: stats.reduce<string | null>((m, s) => (m === null || s.updated_at > m ? s.updated_at : m), null),
    onboarding: {
      started: steps.get(first) ?? 0,
      completed: sum(source.end, (k) => steps.get(k) ?? 0),
      // Les écrans de fin (un par plateforme) ne font qu'une ligne : sinon chacun semblerait perdre la moitié des gens.
      steps: [...steps.entries()].filter(([key]) => !source.end.slice(1).includes(key))
        .map(([key, users]) => ({ key, users: key === source.end[0] ? sum(source.end, (k) => steps.get(k) ?? 0) : users }))
        .sort((a, b) => rank(a.key) - rank(b.key) || b.users - a.users),
      daily,
    },
    questions,
    retention: { cohorts, rates: retentionRates(cohorts) },
    // Une même personne peut voir plusieurs paywalls : le total additionne les spectateurs de chaque paywall et de chaque jour.
    paywall: { viewers: sum(rows, (r) => r.viewers), started: sum(rows, (r) => r.started), buyers: sum(rows, (r) => r.buyers), rows },
  };
}
