/**
 * Le rapport de la page « Semaine » : comment la semaine s'est passée, et où sont les trous.
 * Fonction pure : elle reçoit des lignes (RevenueCat, Qonto, OS, relevé manuel) et rend le rapport.
 * Aucun chiffre n'est inventé : ce que l'OS ne fournit pas encore reste vide (null).
 */

// ------------------------------------------------------------------ entrées
export type RcDay = { date: string; app: string; revenue: number | null; new_subs: number | null; trials: number | null; trial_conversions: number | null; refunds: number | null };
export type RcCountry = { week: string; app: string; country: string; country_name: string | null; revenue: number | null; new_users: number | null };
export type OsPost = {
  date: string; account: string; app: string; label: string; country: string; lang: string | null;
  posts_published: number; posts_planned: number; views: number; post_views: number[];
  best_post_views: number | null; best_post_url: string | null; best_post_thumb: string | null;
};
export type OsAccounts = { date: string; app: string; label: string; country: string; active_accounts: number };
export type OsReserve = { date: string; label: string; lang: string; ready: number };
export type OsCost = { week: string; country: string; cost_usd: number };
export type OsDay = { date: string; app: string; comptes_actifs: number | null; posts_faits: number | null; posts_prevus: number | null; posts_viraux: number | null; vues_total: number | null; vues_mediane: number | null };
export type SeedWeek = { label: string; lundi: string; vues: number; viraux: number; actifs: number; partial: boolean };
export type SeedCountry = { pays: string; code: string; zone: string; verdict: string; comptes_actifs: number | null; vues_mediane: number | null; cout_semaine_usd: number | null };
export type Verdict = { code: string; zone: string | null; verdict: string | null };

export type WeekInput = {
  /** Lundi de la semaine demandée, AAAA-MM-JJ. */
  week: string;
  apps: { key: string; name: string }[];
  rc: RcDay[];
  rcCountry: RcCountry[];
  /** Dépenses nettes du poste « Posteurs » (Qonto), en euros : négatif = remboursement. */
  posterCosts: { date: string; amount: number }[];
  posts: OsPost[];
  accounts: OsAccounts[];
  reserve: OsReserve[];
  costs: OsCost[];
  osDaily: OsDay[];
  verdicts: Verdict[];
  seed: { asOf: string; weeks: SeedWeek[]; countries: SeedCountry[] } | null;
  /** Taux approximatif pour comparer un coût en dollars à un revenu en euros. */
  usdToEur: number;
};

// ------------------------------------------------------------------ sorties
export type Metric = {
  value: number | null;
  /** Variation par rapport à la semaine d'avant, et à la moyenne des 4 semaines d'avant (0,12 = +12 %). */
  vsPrev: number | null;
  vsAvg: number | null;
  source: string;
};
export type Source = { label: string; value: string };
export type Gap = {
  id: string;
  scope: "pays" | "label" | "app";
  /** L'ancre de la ligne concernée dans la page. */
  anchor: string;
  title: string;
  reason: string;
  /** Impact estimé en euros par semaine (ordre de grandeur, pour trier). */
  impact: number;
  how: string;
  sources: Source[];
  category: "recrutement" | "posts" | "produit" | "finance";
};
export type AppRow = {
  key: string; name: string;
  revenue: Metric; newSubs: number | null; trials: number | null; conversion: number | null; refunds: number | null; perUser: number | null;
  views: number | null; median: number | null; viralPct: number | null; postsDone: number | null; postsPlanned: number | null; actives: number | null; per1000: number | null;
};
export type CountryRow = {
  code: string; name: string; zone: string | null; verdict: string | null;
  revenue: number; revenuePrev: number; users: number;
  /** € par nouvel utilisateur sur 4 semaines glissantes (une seule semaine est trop bruitée pour un pays). */
  perUser: number | null;
  perUserWeek: number | null; users4: number;
  actives: number | null; postsDone: number | null; postsPlanned: number | null; median: number | null; viralPct: number | null;
  views: number | null; viewsVsPrev: number | null; viewsVsAvg: number | null;
  costUsd: number | null; ratio: number | null; revenueVsPrev: number | null;
};
export type LabelRow = {
  label: string; app: string; actives: number | null; posts: number; median: number | null; viralPct: number | null;
  views: number; viewsVsPrev: number | null; bestViews: number | null; bestUrl: string | null; reserve: number | null; reserveDays: number | null; weeksSinceViral: number | null;
};
export type WeekReport = {
  week: string; label: string; from: string; to: string; complete: boolean;
  /** D'où viennent les chiffres de contenu : l'OS synchronisé, le relevé manuel, ou rien. */
  content: { kind: "os" | "releve" | "aucun"; note: string };
  countrySource: "os" | "releve" | "aucun";
  summary: {
    revenue: Metric; newSubs: Metric; views: Metric; median: Metric; viralPct: Metric; postsDone: Metric; postsPlanned: number | null; actives: Metric; posterCost: Metric; per1000: Metric;
  };
  sentence: string;
  daily: { day: string; views: number | null; prev: number | null }[] | null;
  apps: AppRow[];
  topPosts: { account: string; label: string; country: string; views: number; url: string | null; thumb: string | null }[];
  drops: { account: string; label: string; country: string; views: number; prev: number; change: number }[];
  countries: CountryRow[];
  perUserMedian: number | null;
  medianViewsMedian: number | null;
  labels: LabelRow[];
  heatmap: { countries: string[]; labels: string[]; cells: Record<string, number> } | null;
  gaps: Gap[];
  slack: string;
};

// ------------------------------------------------------------------- outils
const DAY = 864e5;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysIso = (day: string, n: number) => iso(new Date(date(day).getTime() + n * DAY));
export const mondayOf = (day: string) => {
  const d = date(day);
  return iso(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY));
};
export function isoWeekLabel(monday: string): { year: number; week: number; label: string; key: string } {
  const t = new Date(date(monday).getTime() + 3 * DAY);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - first.getTime()) / DAY - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return { year: t.getUTCFullYear(), week, label: `S${week}`, key: `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}` };
}
/** « 2026-W46 » → le lundi de cette semaine. */
export function mondayOfWeekKey(key: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
  const first = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY;
  return iso(new Date(first + (Number(m[2]) - 1) * 7 * DAY));
}

const n = (v: unknown) => (v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
const sum = <T,>(rows: T[], pick: (r: T) => unknown) => rows.reduce((a, r) => a + n(pick(r)), 0);
const round2 = (v: number) => Math.round(v * 100) / 100;
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const quantile = (values: number[], q: number) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};
const change = (now: number | null, before: number | null) => (now === null || before === null || before === 0 ? null : (now - before) / Math.abs(before));
const mean = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const VIRAL = 10000;
const FR = typeof Intl !== "undefined" ? new Intl.DisplayNames(["fr"], { type: "region" }) : null;
const countryName = (code: string, fallback?: string | null) => {
  if (/^[A-Z]{2}$/.test(code)) {
    try {
      return FR?.of(code) ?? fallback ?? code;
    } catch {}
  }
  return fallback ?? code;
};
const eur = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;
const int = (v: number) => Math.round(v).toLocaleString("fr-FR");
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))} %`;
const share = (v: number) => `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// -------------------------------------------------------------- une semaine
type WeekStats = {
  revenue: number | null; newSubs: number | null; views: number | null; median: number | null; viralPct: number | null;
  postsDone: number | null; postsPlanned: number | null; actives: number | null; posterCost: number | null; per1000: number | null;
};

function contentOf(input: WeekInput, from: string, to: string) {
  const posts = input.posts.filter((p) => p.date >= from && p.date <= to);
  if (posts.length) {
    const all = posts.flatMap((p) => p.post_views);
    const lastDay = input.accounts.filter((a) => a.date >= from && a.date <= to).map((a) => a.date).sort().at(-1);
    return {
      kind: "os" as const,
      views: sum(posts, (p) => p.views), median: median(all), viralPct: all.length ? all.filter((v) => v >= VIRAL).length / all.length : null,
      postsDone: sum(posts, (p) => p.posts_published), postsPlanned: sum(posts, (p) => p.posts_planned),
      actives: lastDay ? sum(input.accounts.filter((a) => a.date === lastDay), (a) => a.active_accounts) : new Set(posts.map((p) => p.account)).size,
    };
  }
  const days = input.osDaily.filter((d) => d.date >= from && d.date <= to);
  if (days.length) {
    const total = days.some((d) => d.app === "all") ? days.filter((d) => d.app === "all") : days;
    const lastDay = total.map((d) => d.date).sort().at(-1)!;
    const done = sum(total, (d) => d.posts_faits);
    return {
      kind: "os" as const,
      views: sum(total, (d) => d.vues_total), median: mean(total.map((d) => d.vues_mediane)), viralPct: done > 0 ? sum(total, (d) => d.posts_viraux) / done : null,
      postsDone: done || null, postsPlanned: sum(total, (d) => d.posts_prevus) || null, actives: sum(total.filter((d) => d.date === lastDay), (d) => d.comptes_actifs) || null,
    };
  }
  const seed = input.seed?.weeks.find((w) => w.lundi === from && !w.partial);
  if (seed) return { kind: "releve" as const, views: seed.vues, median: null, viralPct: seed.viraux, postsDone: null, postsPlanned: null, actives: seed.actifs };
  return { kind: "aucun" as const, views: null, median: null, viralPct: null, postsDone: null, postsPlanned: null, actives: null };
}

function statsOf(input: WeekInput, from: string): WeekStats & { kind: "os" | "releve" | "aucun" } {
  const to = addDaysIso(from, 6);
  const rc = input.rc.filter((r) => r.date >= from && r.date <= to);
  const revenue = rc.length ? round2(sum(rc, (r) => r.revenue)) : null;
  const cost = input.posterCosts.filter((c) => c.date >= from && c.date <= to);
  const content = contentOf(input, from, to);
  return {
    ...content,
    revenue,
    newSubs: rc.some((r) => r.new_subs !== null) ? sum(rc, (r) => r.new_subs) : null,
    posterCost: cost.length ? round2(sum(cost, (c) => c.amount)) : null,
    per1000: revenue !== null && content.views ? (revenue / content.views) * 1000 : null,
  };
}

// --------------------------------------------------------------- le rapport
export function buildWeekReport(input: WeekInput): WeekReport {
  const from = input.week;
  const to = addDaysIso(from, 6);
  const wk = isoWeekLabel(from);
  const prevFrom = addDaysIso(from, -7);
  const back = [1, 2, 3, 4].map((i) => addDaysIso(from, -7 * i));
  const now = statsOf(input, from);
  const before = back.map((w) => statsOf(input, w));
  const srcRc = "RevenueCat";
  const srcContent = now.kind === "os" ? "OS" : now.kind === "releve" ? `relevé manuel du ${input.seed?.asOf ?? "?"}` : "OS (pas encore branché)";
  const metric = (pick: (s: WeekStats) => number | null, source: string): Metric => ({
    value: pick(now), vsPrev: change(pick(now), pick(before[0])), vsAvg: change(pick(now), mean(before.map(pick))), source,
  });
  const summary = {
    revenue: metric((s) => s.revenue, srcRc), newSubs: metric((s) => s.newSubs, srcRc),
    views: metric((s) => s.views, srcContent), median: metric((s) => s.median, srcContent), viralPct: metric((s) => s.viralPct, srcContent),
    postsDone: metric((s) => s.postsDone, srcContent), postsPlanned: now.postsPlanned, actives: metric((s) => s.actives, srcContent),
    posterCost: metric((s) => s.posterCost, "Qonto, poste « Posteurs »"), per1000: metric((s) => s.per1000, `${srcRc} ÷ ${srcContent}`),
  };

  const inWeek = (d: string, start = from) => d >= start && d <= addDaysIso(start, 6);
  const posts = input.posts.filter((p) => inWeek(p.date));
  const postsPrev = input.posts.filter((p) => inWeek(p.date, prevFrom));
  const postsBack = back.map((w) => input.posts.filter((p) => inWeek(p.date, w)));
  const hasPosts = posts.length > 0;
  const lastAccountsDay = input.accounts.filter((a) => inWeek(a.date)).map((a) => a.date).sort().at(-1);
  const accounts = lastAccountsDay ? input.accounts.filter((a) => a.date === lastAccountsDay) : [];
  const activesBy = (pick: (a: OsAccounts) => string, key: string, fallback: OsPost[]) =>
    accounts.length ? sum(accounts.filter((a) => pick(a) === key), (a) => a.active_accounts) : fallback.length ? new Set(fallback.map((p) => p.account)).size : null;
  const viralOf = (list: OsPost[]) => {
    const all = list.flatMap((p) => p.post_views);
    return all.length ? all.filter((v) => v >= VIRAL).length / all.length : null;
  };

  // ---- courbe des vues par jour
  const dayNames = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
  const viewsOn = (day: string) => {
    const p = input.posts.filter((x) => x.date === day);
    if (p.length) return sum(p, (x) => x.views);
    const d = input.osDaily.filter((x) => x.date === day);
    if (!d.length) return null;
    return sum(d.some((x) => x.app === "all") ? d.filter((x) => x.app === "all") : d, (x) => x.vues_total);
  };
  const dailyRows = dayNames.map((day, i) => ({ day, views: viewsOn(addDaysIso(from, i)), prev: viewsOn(addDaysIso(prevFrom, i)) }));
  const daily = dailyRows.some((d) => d.views !== null) ? dailyRows : null;

  // ---- par app
  const apps: AppRow[] = input.apps.map((app) => {
    const rcOf = (start: string) => input.rc.filter((r) => r.app === app.key && inWeek(r.date, start));
    const rc = rcOf(from);
    const revOf = (start: string) => (rcOf(start).length ? round2(sum(rcOf(start), (r) => r.revenue)) : null);
    const revenue = revOf(from);
    const users = sum(input.rcCountry.filter((r) => r.app === app.key && r.week === from), (r) => r.new_users);
    const trials = rc.some((r) => r.trials !== null) ? sum(rc, (r) => r.trials) : null;
    const mine = posts.filter((p) => p.app === app.key);
    const all = mine.flatMap((p) => p.post_views);
    const osDays = input.osDaily.filter((d) => d.app === app.key && inWeek(d.date));
    const views = mine.length ? sum(mine, (p) => p.views) : osDays.length ? sum(osDays, (d) => d.vues_total) : null;
    return {
      key: app.key, name: app.name,
      revenue: { value: revenue, vsPrev: change(revenue, revOf(prevFrom)), vsAvg: change(revenue, mean(back.map(revOf))), source: srcRc },
      newSubs: rc.some((r) => r.new_subs !== null) ? sum(rc, (r) => r.new_subs) : null,
      trials, conversion: trials ? sum(rc, (r) => r.trial_conversions) / trials : null,
      refunds: rc.some((r) => r.refunds !== null) ? round2(sum(rc, (r) => r.refunds)) : null,
      perUser: revenue !== null && users > 0 ? revenue / users : null,
      views, median: median(all), viralPct: viralOf(mine),
      postsDone: mine.length ? sum(mine, (p) => p.posts_published) : null, postsPlanned: mine.length ? sum(mine, (p) => p.posts_planned) : null,
      actives: activesBy((a) => a.app, app.key, mine), per1000: revenue !== null && views ? (revenue / views) * 1000 : null,
    };
  });

  // ---- top des posts et comptes en baisse
  const topPosts = posts
    .filter((p) => p.best_post_views !== null)
    .sort((a, b) => n(b.best_post_views) - n(a.best_post_views))
    .slice(0, 10)
    .map((p) => ({ account: p.account, label: p.label, country: p.country, views: n(p.best_post_views), url: p.best_post_url, thumb: p.best_post_thumb }));
  const byAccount = (list: OsPost[]) => {
    const map = new Map<string, { views: number; label: string; country: string }>();
    list.forEach((p) => map.set(p.account, { views: (map.get(p.account)?.views ?? 0) + p.views, label: p.label, country: p.country }));
    return map;
  };
  const accNow = byAccount(posts);
  const drops = [...byAccount(postsPrev).entries()]
    .map(([account, prev]) => ({ account, label: prev.label, country: prev.country, views: accNow.get(account)?.views ?? 0, prev: prev.views }))
    .filter((d) => d.prev > 0 && d.views < d.prev)
    .map((d) => ({ ...d, change: (d.views - d.prev) / d.prev }))
    .sort((a, b) => a.views - a.prev - (b.views - b.prev))
    .slice(0, 10);

  // ---- par pays
  const verdictOf = new Map(input.verdicts.map((v) => [v.code, v]));
  const seedCountries = !hasPosts && input.seed && input.seed.weeks.filter((w) => !w.partial).at(-1)?.lundi === from ? input.seed.countries : [];
  const seedOf = new Map(seedCountries.map((c) => [c.code, c]));
  const countrySource: WeekReport["countrySource"] = hasPosts ? "os" : seedCountries.length ? "releve" : "aucun";
  const costOf = new Map(input.costs.filter((c) => c.week === from).map((c) => [c.country, n(c.cost_usd)]));
  const codes = new Set<string>([
    ...input.rcCountry.filter((r) => r.week === from).map((r) => r.country),
    ...posts.map((p) => p.country).filter(Boolean),
    ...accounts.map((a) => a.country).filter(Boolean),
    ...seedCountries.map((c) => c.code),
    ...input.verdicts.filter((v) => v.verdict === "Recruter").map((v) => v.code),
  ]);
  const countries: CountryRow[] = [...codes].map((code) => {
    const rcOf = (start: string) => input.rcCountry.filter((r) => r.country === code && r.week === start);
    const rc = rcOf(from);
    const revenue = round2(sum(rc, (r) => r.revenue));
    const revenuePrev = round2(sum(rcOf(prevFrom), (r) => r.revenue));
    const users = sum(rc, (r) => r.new_users);
    const rc4 = input.rcCountry.filter((r) => r.country === code && r.week >= addDaysIso(from, -21) && r.week <= from);
    const users4 = sum(rc4, (r) => r.new_users);
    const mine = posts.filter((p) => p.country === code);
    const all = mine.flatMap((p) => p.post_views);
    const seed = seedOf.get(code);
    const viewsOf = (list: OsPost[]) => (list.some((p) => p.country === code) ? sum(list.filter((p) => p.country === code), (p) => p.views) : null);
    const views = hasPosts ? (viewsOf(posts) ?? 0) : null;
    const costUsd = costOf.get(code) ?? seed?.cout_semaine_usd ?? null;
    return {
      code, name: countryName(code, rc[0]?.country_name ?? seed?.pays), zone: verdictOf.get(code)?.zone ?? seed?.zone ?? null, verdict: verdictOf.get(code)?.verdict ?? seed?.verdict ?? null,
      revenue, revenuePrev, users, perUser: users4 > 0 ? sum(rc4, (r) => r.revenue) / users4 : null, perUserWeek: users > 0 ? revenue / users : null, users4,
      actives: hasPosts ? activesBy((a) => a.country, code, mine) : (seed?.comptes_actifs ?? null),
      postsDone: mine.length ? sum(mine, (p) => p.posts_published) : null, postsPlanned: mine.length ? sum(mine, (p) => p.posts_planned) : null,
      median: hasPosts ? median(all) : (seed?.vues_mediane ?? null), viralPct: viralOf(mine),
      views, viewsVsPrev: change(views, viewsOf(postsPrev)), viewsVsAvg: change(views, mean(postsBack.map(viewsOf))),
      costUsd, ratio: costUsd ? revenue / (costUsd * input.usdToEur) : null, revenueVsPrev: change(revenue, revenuePrev),
    };
  });
  // Les pays avec du volume d'abord (un pays à 3 utilisateurs ne prouve rien), puis par € par utilisateur.
  const solid = (c: CountryRow) => c.users4 >= 400;
  countries.sort((a, b) => Number(solid(b)) - Number(solid(a)) || (b.perUser ?? -1) - (a.perUser ?? -1) || b.revenue - a.revenue);
  const perUserMedian = median(countries.filter(solid).map((c) => c.perUser!).filter((v) => v !== null));
  const perUserLowQuarter = quantile(countries.filter(solid).map((c) => c.perUser!), 0.25);
  const medianViewsMedian = median(countries.map((c) => c.median).filter((v): v is number => v !== null));
  const viewsHigh = quantile(countries.map((c) => c.views).filter((v): v is number => v !== null && v > 0), 0.6);

  // ---- par label
  const labelKeys = new Set<string>([...posts.map((p) => p.label), ...accounts.map((a) => a.label), ...input.reserve.map((r) => r.label)].filter(Boolean));
  const lastReserveDay = input.reserve.filter((r) => r.date <= to).map((r) => r.date).sort().at(-1);
  const labels: LabelRow[] = [...labelKeys].map((label) => {
    const mine = posts.filter((p) => p.label === label);
    const all = mine.flatMap((p) => p.post_views);
    const best = [...mine].sort((a, b) => n(b.best_post_views) - n(a.best_post_views))[0];
    const viewsOf = (list: OsPost[]) => sum(list.filter((p) => p.label === label), (p) => p.views);
    const published = sum(mine, (p) => p.posts_published);
    const reserve = lastReserveDay && input.reserve.some((r) => r.label === label && r.date === lastReserveDay) ? sum(input.reserve.filter((r) => r.label === label && r.date === lastReserveDay), (r) => r.ready) : null;
    // Depuis combien de semaines ce label n'a pas eu de post viral (0 = il en a eu cette semaine).
    const sinceViral = [posts, ...postsBack].findIndex((list) => list.some((p) => p.label === label && p.post_views.some((v) => v >= VIRAL)));
    const everPosted = [posts, ...postsBack].some((list) => list.some((p) => p.label === label));
    return {
      label, app: mine[0]?.app ?? accounts.find((a) => a.label === label)?.app ?? "",
      actives: activesBy((a) => a.label, label, mine), posts: published, median: median(all), viralPct: viralOf(mine),
      views: viewsOf(posts), viewsVsPrev: change(viewsOf(posts), viewsOf(postsPrev) || null),
      bestViews: best?.best_post_views ?? null, bestUrl: best?.best_post_url ?? null,
      reserve, reserveDays: reserve !== null && published > 0 ? reserve / (published / 7) : null,
      weeksSinceViral: !everPosted ? null : sinceViral === -1 ? 5 : sinceViral,
    };
  }).sort((a, b) => b.views - a.views);

  // ---- carte de chaleur pays × label (vues médianes)
  let heatmap: WeekReport["heatmap"] = null;
  if (hasPosts) {
    const top = (pick: (p: OsPost) => string, max: number) =>
      [...posts.reduce((m, p) => m.set(pick(p), (m.get(pick(p)) ?? 0) + p.views), new Map<string, number>()).entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k);
    const cells: Record<string, number> = {};
    const cs = top((p) => p.country, 14);
    const ls = top((p) => p.label, 14);
    cs.forEach((c) => ls.forEach((l) => {
      const m = median(posts.filter((p) => p.country === c && p.label === l).flatMap((p) => p.post_views));
      if (m !== null) cells[`${c}|${l}`] = m;
    }));
    heatmap = { countries: cs, labels: ls, cells };
  }

  // ------------------------------------------------------------------ trous
  const gaps: Gap[] = [];
  const eurPer1000 = now.per1000 ?? 0;
  const recruitRevenue = median(countries.filter((c) => c.verdict === "Recruter" && c.revenue > 0).map((c) => c.revenue)) ?? 0;

  for (const c of countries) {
    const anchor = `pays-${c.code}`;
    const base: Source[] = [
      { label: "Revenus de la semaine", value: eur(c.revenue) },
      { label: "Nouveaux utilisateurs", value: int(c.users) },
      ...(c.perUser !== null ? [{ label: "€ par utilisateur (4 semaines)", value: `${c.perUser.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €` }] : []),
      ...(c.actives !== null ? [{ label: "Comptes actifs", value: int(c.actives) }] : []),
    ];
    if (solid(c) && perUserMedian !== null && c.perUser! > perUserMedian && c.actives !== null && c.actives > 0 && c.actives < 10) {
      gaps.push({
        id: `sous-couvert-${c.code}`, scope: "pays", anchor, category: "recrutement", title: `${c.name} : sous-couvert, recruter`,
        reason: `${c.perUser!.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € par utilisateur (médiane ${perUserMedian.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €) avec seulement ${c.actives} compte${c.actives > 1 ? "s" : ""} actif${c.actives > 1 ? "s" : ""}.`,
        impact: (c.revenue * (10 - c.actives)) / 10, how: "Revenus du pays × part des 10 comptes qui manquent.",
        sources: [...base, { label: "Médiane du € par utilisateur", value: `${perUserMedian.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €` }],
      });
    }
    if (c.viewsVsAvg !== null && c.viewsVsAvg < -0.3 && c.views !== null) {
      gaps.push({
        id: `vues-${c.code}`, scope: "pays", anchor, category: "posts", title: `${c.name} : vues en baisse de ${Math.abs(Math.round(c.viewsVsAvg * 100))} %`,
        reason: `${int(c.views)} vues cette semaine, contre une moyenne plus haute sur les 4 semaines d'avant.`,
        impact: c.revenue * Math.abs(c.viewsVsAvg), how: "Revenus du pays × la baisse des vues.",
        sources: [...base, { label: "Vues de la semaine", value: int(c.views) }, { label: "Écart à la moyenne des 4 semaines", value: pct(c.viewsVsAvg) }],
      });
    }
    if (c.postsPlanned && c.postsDone !== null && c.postsDone / c.postsPlanned < 0.7) {
      const rate = c.postsDone / c.postsPlanned;
      gaps.push({
        id: `posts-${c.code}`, scope: "pays", anchor, category: "posts", title: `${c.name} : ${Math.round(rate * 100)} % des posts prévus sont faits`,
        reason: `${int(c.postsDone)} posts publiés sur ${int(c.postsPlanned)} prévus.`,
        impact: c.revenue * (1 - rate), how: "Revenus du pays × la part des posts non faits.",
        sources: [...base, { label: "Posts faits / prévus", value: `${int(c.postsDone)} / ${int(c.postsPlanned)}` }],
      });
    }
    if (solid(c) && perUserLowQuarter !== null && c.perUser! <= perUserLowQuarter && c.views !== null && viewsHigh !== null && c.views >= viewsHigh) {
      gaps.push({
        id: `couper-${c.code}`, scope: "pays", anchor, category: "produit", title: `${c.name} : couper ou changer d'app`,
        reason: `Beaucoup de vues (${int(c.views)}) mais un € par utilisateur dans le quart le plus bas (${c.perUser!.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €).`,
        impact: c.costUsd ? c.costUsd * input.usdToEur : eurPer1000 * (c.views / 1000) * 0.5, how: c.costUsd ? "Coût posteurs du pays, économisé si on coupe." : "La moitié de ce que ces vues rapporteraient au taux moyen.",
        sources: [...base, { label: "Vues", value: int(c.views) }, ...(c.costUsd ? [{ label: "Coût posteurs", value: `${int(c.costUsd)} $` }] : [])],
      });
    }
    if (c.verdict === "Recruter" && c.actives !== null && c.actives === 0) {
      gaps.push({
        id: `vide-${c.code}`, scope: "pays", anchor, category: "recrutement", title: `${c.name} : ouvert au recrutement, aucun compte actif`,
        reason: "Le pays est classé « Recruter » mais personne n'y poste.",
        impact: c.revenue > 0 ? c.revenue : recruitRevenue, how: c.revenue > 0 ? "Revenus actuels du pays, à défendre." : "Revenu médian des pays « Recruter » actifs.",
        sources: base,
      });
    }
  }

  const viralTop = quantile(labels.map((l) => l.viralPct).filter((v): v is number => v !== null), 0.8);
  for (const l of labels) {
    const anchor = `label-${slug(l.label)}`;
    const worth = eurPer1000 * (l.views / 1000);
    const base: Source[] = [
      { label: "Vues de la semaine", value: int(l.views) },
      ...(l.actives !== null ? [{ label: "Comptes actifs", value: int(l.actives) }] : []),
      ...(l.viralPct !== null ? [{ label: "% de posts viraux", value: share(l.viralPct) }] : []),
    ];
    if (l.viewsVsPrev !== null && l.viewsVsPrev < -0.3) {
      gaps.push({ id: `label-baisse-${slug(l.label)}`, scope: "label", anchor, category: "posts", title: `Label ${l.label} : en baisse de ${Math.abs(Math.round(l.viewsVsPrev * 100))} %`, reason: `${int(l.views)} vues cette semaine, nettement moins que la semaine d'avant.`, impact: (worth / (1 + l.viewsVsPrev)) * Math.abs(l.viewsVsPrev), how: "Vues perdues × € pour 1 000 vues.", sources: [...base, { label: "Évolution", value: pct(l.viewsVsPrev) }] });
    }
    if (l.weeksSinceViral !== null && l.weeksSinceViral >= 2) {
      gaps.push({ id: `label-viral-${slug(l.label)}`, scope: "label", anchor, category: "posts", title: `Label ${l.label} : aucun post viral depuis ${l.weeksSinceViral >= 5 ? "plus de 4" : l.weeksSinceViral} semaines`, reason: "Aucun post à 10 000 vues ou plus sur la période.", impact: worth * 0.3, how: "30 % de ce que rapportent les vues du label.", sources: base });
    }
    if (viralTop !== null && l.viralPct !== null && l.viralPct >= viralTop && l.viralPct > 0 && l.actives !== null && l.actives > 0 && l.actives < 5) {
      gaps.push({ id: `label-sous-${slug(l.label)}`, scope: "label", anchor, category: "recrutement", title: `Label ${l.label} : sous-exploité, doubler ou recruter dessus`, reason: `${share(l.viralPct)} de posts viraux (dans les 20 % les meilleurs) avec seulement ${l.actives} compte${l.actives > 1 ? "s" : ""}.`, impact: worth, how: "Ce que rapportent déjà ses vues : doubler les comptes vise à les doubler.", sources: base });
    }
    if (l.reserveDays !== null && l.reserveDays < 3) {
      gaps.push({ id: `label-reserve-${slug(l.label)}`, scope: "label", anchor, category: "posts", title: `Label ${l.label} : recharger la réserve`, reason: `${int(l.reserve!)} slideshows prêts, soit ${l.reserveDays.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} jour${l.reserveDays >= 2 ? "s" : ""} au rythme actuel.`, impact: worth, how: "Ce que rapportent ses vues, à l'arrêt si la réserve tombe à zéro.", sources: [...base, { label: "Réserve", value: `${int(l.reserve!)} slideshows` }] });
    }
    if (l.actives !== null && l.actives === 0) {
      gaps.push({ id: `label-vide-${slug(l.label)}`, scope: "label", anchor, category: "recrutement", title: `Label ${l.label} : aucun compte actif`, reason: "Le label existe mais personne ne poste dessus.", impact: worth, how: "Ce que rapportaient ses vues.", sources: base });
    }
  }

  const totalRevenue = now.revenue ?? 0;
  const totalActives = now.actives ?? 0;
  for (const a of apps) {
    const anchor = `app-${a.key}`;
    const rev = a.revenue.value;
    if (rev !== null && a.revenue.vsPrev !== null && a.revenue.vsPrev < -0.2) {
      const lost = rev / (1 + a.revenue.vsPrev) - rev;
      gaps.push({ id: `app-baisse-${a.key}`, scope: "app", anchor, category: "produit", title: `${a.name} : revenus en baisse de ${Math.abs(Math.round(a.revenue.vsPrev * 100))} %`, reason: `${eur(rev)} cette semaine contre ${eur(rev + lost)} la semaine d'avant.`, impact: lost, how: "L'écart de revenus avec la semaine d'avant.", sources: [{ label: "Revenus", value: eur(rev) }, { label: "Semaine d'avant", value: eur(rev + lost) }] });
    }
    if (a.views && now.views && a.newSubs !== null && now.newSubs) {
      const viewShare = a.views / now.views;
      const subShare = a.newSubs / now.newSubs;
      if (viewShare > 0.1 && subShare < viewShare / 2) {
        gaps.push({ id: `app-conversion-${a.key}`, scope: "app", anchor, category: "produit", title: `${a.name} : beaucoup de vues, peu d'abonnés`, reason: `${share(viewShare)} des vues mais ${share(subShare)} des nouveaux abonnés.`, impact: eurPer1000 * (a.views / 1000) - (rev ?? 0), how: "Ce que ces vues rapporteraient au taux moyen, moins ce qu'elles rapportent.", sources: [{ label: "Vues", value: int(a.views) }, { label: "Nouveaux abonnés", value: int(a.newSubs) }] });
      }
    }
    if (rev !== null && totalRevenue > 0 && a.actives !== null && totalActives > 0) {
      const revShare = rev / totalRevenue;
      const accShare = a.actives / totalActives;
      if (revShare > 0.1 && accShare < revShare / 2) {
        gaps.push({ id: `app-comptes-${a.key}`, scope: "app", anchor, category: "recrutement", title: `${a.name} : trop peu de comptes pour ses revenus`, reason: `${share(revShare)} des revenus avec ${share(accShare)} des comptes.`, impact: rev * 0.2, how: "20 % des revenus de l'app, à gagner en rééquilibrant les comptes.", sources: [{ label: "Revenus", value: eur(rev) }, { label: "Comptes actifs", value: int(a.actives) }] });
      }
    }
  }
  gaps.forEach((g) => (g.impact = Math.max(0, Math.round(g.impact))));
  gaps.sort((a, b) => b.impact - a.impact);

  // ---- la phrase et le résumé à copier
  const say = (name: string, m: Metric, flat = "stables") => (m.vsPrev === null ? null : Math.abs(m.vsPrev) < 0.03 ? `${name} ${flat}` : `${name} ${pct(m.vsPrev)}`);
  const parts = [say("Revenus", summary.revenue), say("vues", summary.views), say("viraux", summary.viralPct)].filter(Boolean);
  const holes = gaps.slice(0, 2).map((g) => g.title.split(" : ")[0].replace(/^Label /, "label "));
  const sentence = `${parts.length ? `${parts.join(", ")}.` : "Pas encore de comparaison possible."} ${holes.length ? `Gros trou : ${holes.join(" et ")}.` : "Aucun trou détecté."}`;
  const line = (name: string, m: Metric, fmt: (v: number) => string) => (m.value === null ? null : `• ${name} : ${fmt(m.value)}${m.vsPrev !== null ? ` (${pct(m.vsPrev)} vs sem. d'avant)` : ""}`);
  const slack = [
    `*Semaine ${wk.label}* (${from.slice(8)}/${from.slice(5, 7)} → ${to.slice(8)}/${to.slice(5, 7)})`,
    sentence,
    line("Revenus", summary.revenue, eur), line("Nouveaux abonnés", summary.newSubs, int), line("Vues", summary.views, int),
    line("Posts viraux", summary.viralPct, share), line("Comptes actifs", summary.actives, int), line("Coût posteurs", summary.posterCost, eur),
    gaps.length ? "*À faire cette semaine*" : null,
    ...gaps.slice(0, 6).map((g, i) => `${i + 1}. ${g.title} (≈ ${eur(g.impact)})`),
  ].filter(Boolean).join("\n");

  const note = now.kind === "os" ? "Chiffres de contenu : OS, synchronisé." : now.kind === "releve" ? `Chiffres de contenu : relevé manuel du ${input.seed?.asOf}. Le détail par label, par post et par jour arrivera avec l'accès à l'OS.` : "Pas de chiffres de contenu pour cette semaine : l'OS n'est pas encore branché.";
  return {
    week: wk.key, label: wk.label, from, to, complete: true,
    content: { kind: now.kind, note }, countrySource,
    summary, sentence, daily, apps, topPosts, drops, countries, perUserMedian, medianViewsMedian, labels, heatmap, gaps, slack,
  };
}
