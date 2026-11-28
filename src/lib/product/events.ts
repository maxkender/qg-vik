import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, readAll, retentionRates, tidy } from "@/lib/product/sources";
import type { Cohort, Product, Question, RetentionKey } from "@/lib/product/types";
import { RETENTION_DAYS } from "@/lib/product/types";

export type AppEvent = { id: number; device_id: string; name: string; occurred_at: string; properties: Record<string, unknown> | null };
type Seen = { device_id: string; occurred_at: string };

const FUNNEL = ["onboarding_step", "onboarding_completed", "paywall_viewed", "purchase_started", "purchase_succeeded"];
const day = (ts: string) => ts.slice(0, 10);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const label = (v: unknown) => (v === true ? "Oui" : v === false ? "Non" : String(v));

/**
 * Une app qui envoie ses événements bruts dans app_events (Artura). Jours en UTC.
 * On lit les événements de la période, puis tout se calcule ici, par appareil.
 */
export async function readEvents(db: SupabaseClient, app: string, days: number, today: string): Promise<Product> {
  const from = addDays(today, -(days - 1));
  const [events, seen] = await Promise.all([
    readAll<AppEvent>((a, b, count) => db.from("app_events").select("id, device_id, name, occurred_at, properties", count ? { count: "exact" } : undefined)
      .in("name", FUNNEL).gte("occurred_at", `${from}T00:00:00Z`).order("id").range(a, b), "événements"),
    // Rétention : chaque ouverture des 45 derniers jours (il en faut 30 pour connaître J30).
    readAll<Seen & { id: number }>((a, b, count) => db.from("app_events").select("id, device_id, occurred_at", count ? { count: "exact" } : undefined)
      .eq("name", "app_opened").gte("occurred_at", `${addDays(today, -45)}T00:00:00Z`).order("id").range(a, b), "ouvertures"),
  ]);
  return buildFromEvents(app, days, today, events, seen);
}

export function buildFromEvents(app: string, days: number, today: string, events: AppEvent[], seen: Seen[]): Product {
  const from = addDays(today, -(days - 1));
  events = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id);

  // Entonnoir : un appareil a vu un écran s'il en vient ou s'il y arrive. L'ordre des écrans est celui où on les découvre.
  const reached = new Map<string, Set<string>>();
  const position = new Map<string, { total: number; n: number }>();
  const visited = new Map<string, string[]>();
  const answers = new Map<string, Record<string, unknown>>();
  const starters = new Set<string>(), finishers = new Set<string>();
  const startDay = new Map<string, string>(), endDay = new Map<string, string>();
  const viewers = new Set<string>(), buyStarters = new Set<string>(), buyers = new Set<string>();
  const byKind = new Map<string, { viewers: Set<string> }>();
  const see = (device: string, step: string) => {
    if (!step) return;
    const path = visited.get(device) ?? [];
    if (path.includes(step)) return;
    path.push(step);
    visited.set(device, path);
    (reached.get(step) ?? reached.set(step, new Set()).get(step)!).add(device);
    const p = position.get(step) ?? { total: 0, n: 0 };
    p.total += path.length; p.n += 1;
    position.set(step, p);
  };
  for (const e of events) {
    const p = e.properties ?? {};
    if (e.name === "onboarding_step") {
      starters.add(e.device_id);
      if (!startDay.has(e.device_id)) startDay.set(e.device_id, day(e.occurred_at));
      see(e.device_id, str(p.from));
      see(e.device_id, str(p.to));
    }
    if (e.name === "onboarding_completed" && !finishers.has(e.device_id)) { finishers.add(e.device_id); endDay.set(e.device_id, day(e.occurred_at)); }
    // Les réponses voyagent avec chaque événement : la dernière version connue de l'appareil fait foi.
    if ((e.name === "onboarding_step" || e.name === "onboarding_completed") && p.answers && typeof p.answers === "object") answers.set(e.device_id, p.answers as Record<string, unknown>);
    if (e.name === "paywall_viewed") {
      viewers.add(e.device_id);
      const kind = str(p.kind) || "paywall";
      (byKind.get(kind) ?? byKind.set(kind, { viewers: new Set() }).get(kind)!).viewers.add(e.device_id);
    }
    if (e.name === "purchase_started") buyStarters.add(e.device_id);
    if (e.name === "purchase_succeeded") buyers.add(e.device_id);
  }
  const steps = [...reached.entries()].map(([key, set]) => ({ key, users: set.size, pos: position.get(key)!.total / position.get(key)!.n }))
    .sort((a, b) => a.pos - b.pos).map(({ key, users }) => ({ key, users }));

  const counts = new Map<string, { answered: number; multi: boolean; options: Map<string, number> }>();
  for (const set of answers.values()) {
    for (const [key, raw] of Object.entries(set)) {
      const values = Array.isArray(raw) ? raw : [raw];
      if (raw === null || raw === "" || values.length === 0) continue;
      const q = counts.get(key) ?? { answered: 0, multi: false, options: new Map<string, number>() };
      q.answered += 1;
      q.multi ||= Array.isArray(raw);
      for (const v of new Set(values.map(label))) q.options.set(v, (q.options.get(v) ?? 0) + 1);
      counts.set(key, q);
    }
  }
  const questions: Question[] = [...counts.entries()].map(([key, q]) => tidy({ key, answered: q.answered, multi: q.multi, options: [...q.options.entries()].map(([value, users]) => ({ value, users })) }));

  const daily = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    daily.push({ day: d, started: [...startDay.values()].filter((x) => x === d).length, completed: [...endDay.values()].filter((x) => x === d).length });
  }

  // Rétention : la cohorte d'un appareil est le jour de sa première ouverture ; il est « revenu à J+n » s'il a ouvert l'app ce jour-là.
  const daysOf = new Map<string, Set<string>>();
  for (const s of seen) (daysOf.get(s.device_id) ?? daysOf.set(s.device_id, new Set()).get(s.device_id)!).add(day(s.occurred_at));
  const oldest = addDays(today, -45);
  const cohortMap = new Map<string, Cohort>();
  for (const set of daysOf.values()) {
    const first = [...set].sort()[0];
    // Le premier jour de la fenêtre est écarté : ses appareils ont pu arriver avant.
    if (first <= oldest || first >= today) continue;
    const c = cohortMap.get(first) ?? { day: first, size: 0, ...(Object.fromEntries(RETENTION_DAYS.map((n) => [`d${n}`, addDays(first, n) < today ? 0 : null])) as Record<RetentionKey, number | null>) };
    c.size += 1;
    for (const n of RETENTION_DAYS) {
      const k = `d${n}` as RetentionKey;
      if (c[k] !== null && set.has(addDays(first, n))) c[k] = c[k]! + 1;
    }
    cohortMap.set(first, c);
  }
  const cohorts = [...cohortMap.values()].sort((a, b) => b.day.localeCompare(a.day));

  return {
    app, days, from, to: today, unit: "appareils",
    updated_at: [...events.map((e) => e.occurred_at), ...seen.map((s) => s.occurred_at)].reduce<string | null>((m, t) => (m === null || t > m ? t : m), null),
    onboarding: { started: starters.size, completed: [...finishers].filter((d) => starters.has(d)).length, steps, daily },
    questions,
    retention: { cohorts, rates: retentionRates(cohorts) },
    paywall: {
      viewers: viewers.size, started: [...buyStarters].length, buyers: buyers.size,
      // Les achats ne disent pas de quel paywall ils viennent : seul le nombre de spectateurs est connu par paywall.
      rows: [...byKind.entries()].map(([id, x]) => ({ id, viewers: x.viewers.size, started: 0, buyers: 0 })).sort((a, b) => b.viewers - a.viewers),
    },
  };
}
