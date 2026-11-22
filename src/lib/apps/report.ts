/**
 * Les chiffres d'une app, calculés à partir de app_metrics_daily. Fonction pure.
 * Règle : une source qui ne répond pas donne null (« données indisponibles »), jamais zéro.
 */
import type { DayMetrics, OsSnapshot } from "@/lib/apps/types";

export type Row = { date: string; metrics: DayMetrics; updated_at: string };
export type CountryWeek = { week: string; country: string; country_name: string | null; revenue: number | null; new_users: number | null };
export type Num = { value: number | null; vs: number | null };
export type WeekPoint = { week: string; label: string; revenue: number | null; cost: number | null; views: number | null };
export type Decision = "Couper" | "Doubler" | "Changer l'angle";
export type Checkpoint = { week: number; rule: string; status: "ok" | "ko" | "attente"; note: string };
export type AppSummary = {
  slug: string; updatedAt: string | null; sources: { revenuecat: boolean; os: boolean };
  rev7: Num; rev30: Num;
  /** Coût des posteurs par semaine, en euros, et marge = revenu sur 7 jours − ce coût. */
  cost: number | null; margin: number | null;
  perAccount: number | null; per1000: number | null; accounts: number | null;
  subs: number | null; trials: number | null; median: number | null; viralPct: number | null;
  weeks: WeekPoint[]; launchWeek: number | null;
};
export type AppDetail = AppSummary & {
  countries: { code: string; name: string; revenue: number | null; perUser: number | null; accounts: number | null; cost: number | null; margin: number | null }[];
  labels: { label: string; accounts: number | null; median: number | null; viralPct: number | null; decision: Decision }[];
  checkpoints: Checkpoint[];
};
export type Context = { today: string; usdToEur: number; zoneRates: Record<string, number>; zones: Record<string, string> };

const DAY = 864e5;
const add = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const mondayOf = (day: string) => add(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const weekLabel = (monday: string) => {
  const t = new Date(new Date(`${monday}T00:00:00Z`).getTime() + 3 * DAY);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return `S${1 + Math.round(((t.getTime() - first.getTime()) / DAY - 3 + ((first.getUTCDay() + 6) % 7)) / 7)}`;
};
const change = (now: number | null, before: number | null) => (now === null || before === null || before === 0 ? null : (now - before) / Math.abs(before));
const FR = new Intl.DisplayNames(["fr"], { type: "region" });
const countryName = (code: string, fallback: string | null) => {
  try {
    return (/^[A-Z]{2}$/.test(code) && FR.of(code)) || fallback || code;
  } catch {
    return fallback || code;
  }
};

/** La règle de décision d'un label. */
export function labelDecision(median: number | null, viralPct: number | null): Decision {
  if (viralPct !== null && viralPct >= 0.05) return "Doubler";
  if (median !== null && median < 500 && (viralPct ?? 0) === 0) return "Couper";
  return "Changer l'angle";
}

export function buildApp(app: { slug: string; launch_date: string | null }, rows: Row[], countryWeeks: CountryWeek[], ctx: Context): AppDetail {
  const { today, usdToEur } = ctx;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const between = (from: string, to: string) => sorted.filter((r) => r.date >= from && r.date <= to);
  const revenueOf = (list: Row[]) => {
    const days = list.filter((r) => r.metrics.rc && r.metrics.rc.revenue !== null);
    return days.length ? Math.round(days.reduce((a, r) => a + r.metrics.rc!.revenue!, 0) * 100) / 100 : null;
  };
  // Coût par semaine en dollars : celui que donne l'OS, sinon comptes × tarif de la zone du pays.
  const costUsd = (os: OsSnapshot) => {
    if (os.cost_usd !== null) return os.cost_usd;
    const priced = os.countries.filter((c) => c.cost_usd !== null || (c.accounts !== null && ctx.zoneRates[ctx.zones[c.code]] !== undefined));
    return priced.length ? priced.reduce((a, c) => a + (c.cost_usd ?? c.accounts! * ctx.zoneRates[ctx.zones[c.code]]), 0) : null;
  };
  const lastOs = (list: Row[]) => list.findLast((r) => r.metrics.os)?.metrics.os ?? null;

  // Une source est « là » si elle a répondu dans les 3 derniers jours.
  const fresh = between(add(today, -3), today);
  const rcOk = fresh.some((r) => r.metrics.rc && r.metrics.rc.revenue !== null);
  const os = lastOs(fresh);

  const window = (days: number): Num => {
    if (!rcOk) return { value: null, vs: null };
    const value = revenueOf(between(add(today, -days), add(today, -1)));
    return { value, vs: change(value, revenueOf(between(add(today, -2 * days), add(today, -days - 1)))) };
  };
  const rev7 = window(7);
  const rev30 = window(30);
  const last7 = between(add(today, -7), add(today, -1));
  const latestRc = sorted.findLast((r) => r.date < today && r.metrics.rc)?.metrics.rc ?? null;
  const dollars = os ? costUsd(os) : null;
  const cost = dollars === null ? null : Math.round(dollars * usdToEur * 100) / 100;

  const thisMonday = mondayOf(today);
  const weeks: WeekPoint[] = [8, 7, 6, 5, 4, 3, 2, 1].map((i) => {
    const week = add(thisMonday, -7 * i);
    const days = between(week, add(week, 6));
    const snap = lastOs(days);
    const c = snap ? costUsd(snap) : null;
    return { week, label: weekLabel(week), revenue: revenueOf(days), cost: c === null ? null : Math.round(c * usdToEur), views: snap?.views ?? null };
  });

  // ---- pays : dernière semaine pleine, € par utilisateur sur 4 semaines
  const lastWeek = add(thisMonday, -7);
  const codes = new Set([...countryWeeks.filter((r) => r.week === lastWeek).map((r) => r.country), ...(os?.countries ?? []).map((c) => c.code)]);
  const countries = [...codes].map((code) => {
    const mine = countryWeeks.filter((r) => r.country === code);
    const week = mine.filter((r) => r.week === lastWeek);
    const four = mine.filter((r) => r.week >= add(lastWeek, -21) && r.week <= lastWeek);
    const users = four.reduce((a, r) => a + (r.new_users ?? 0), 0);
    const revenue = week.length ? Math.round(week.reduce((a, r) => a + (r.revenue ?? 0), 0) * 100) / 100 : null;
    const oc = os?.countries.find((c) => c.code === code);
    const rate = ctx.zoneRates[ctx.zones[code]];
    const usd = oc ? (oc.cost_usd ?? (oc.accounts !== null && rate !== undefined ? oc.accounts * rate : null)) : null;
    const c = usd === null ? null : Math.round(usd * usdToEur * 100) / 100;
    return {
      code, name: countryName(code, mine[0]?.country_name ?? null), revenue, perUser: users > 0 ? four.reduce((a, r) => a + (r.revenue ?? 0), 0) / users : null,
      accounts: oc?.accounts ?? null, cost: c, margin: revenue !== null && c !== null ? revenue - c : null,
    };
  }).sort((a, b) => (b.revenue ?? -1) - (a.revenue ?? -1));

  const labels = (os?.labels ?? [])
    .map((l) => ({ label: l.label, accounts: l.accounts, median: l.median_views, viralPct: l.viral_pct, decision: labelDecision(l.median_views, l.viral_pct) }))
    .sort((a, b) => (b.viralPct ?? -1) - (a.viralPct ?? -1));

  // ---- points de contrôle, comptés en semaines depuis le lancement
  const launch = app.launch_date;
  const launchWeek = launch && today >= launch ? Math.floor((new Date(today).getTime() - new Date(launch).getTime()) / (7 * DAY)) + 1 : null;
  const range = (n: number) => [add(launch!, (n - 1) * 7), add(launch!, n * 7 - 1)] as const;
  const ratioCheck = (n: number, min: number): Checkpoint => {
    const rule = `Revenu ≥ ${Math.round(min * 100)} % du coût`;
    if (!launch || today <= range(n)[1]) return { week: n, rule, status: "attente", note: "pas encore" };
    const days = between(...range(n));
    const revenue = revenueOf(days);
    const snap = lastOs(days);
    const c = snap ? costUsd(snap) : null;
    if (revenue === null || c === null || c === 0) return { week: n, rule, status: "attente", note: "données indisponibles" };
    const ratio = revenue / (c * usdToEur);
    return { week: n, rule, status: ratio >= min ? "ok" : "ko", note: `${Math.round(ratio * 100)} % du coût` };
  };
  const viralCheck = (): Checkpoint => {
    const rule = "Au moins 1 label à 5 % de viraux";
    if (!launch) return { week: 2, rule, status: "attente", note: "pas encore" };
    const snaps = between(launch, range(2)[1]).filter((r) => r.metrics.os?.labels.length);
    const best = Math.max(-1, ...snaps.flatMap((r) => r.metrics.os!.labels.map((l) => l.viral_pct ?? -1)));
    if (best >= 0.05) return { week: 2, rule, status: "ok", note: `meilleur label : ${Math.round(best * 100)} %` };
    if (today <= range(2)[1]) return { week: 2, rule, status: "attente", note: "pas encore" };
    return best < 0 ? { week: 2, rule, status: "attente", note: "données indisponibles" } : { week: 2, rule, status: "ko", note: `meilleur label : ${Math.round(best * 100)} %` };
  };

  const trials = last7.filter((r) => r.metrics.rc && r.metrics.rc.trials !== null);
  return {
    slug: app.slug, updatedAt: sorted.map((r) => r.updated_at).sort().at(-1) ?? null, sources: { revenuecat: rcOk, os: Boolean(os) },
    rev7, rev30, cost, margin: rev7.value !== null && cost !== null ? Math.round((rev7.value - cost) * 100) / 100 : null,
    perAccount: rev7.value !== null && os?.accounts ? rev7.value / os.accounts : null,
    per1000: rev7.value !== null && os?.views ? (rev7.value / os.views) * 1000 : null,
    accounts: os?.accounts ?? null,
    subs: rcOk ? (latestRc?.actives ?? null) : null,
    trials: rcOk && trials.length ? trials.reduce((a, r) => a + r.metrics.rc!.trials!, 0) : null,
    median: os?.median_views ?? null, viralPct: os?.viral_pct ?? null,
    weeks, launchWeek, countries, labels, checkpoints: [viralCheck(), ratioCheck(4, 0.3), ratioCheck(8, 1)],
  };
}
