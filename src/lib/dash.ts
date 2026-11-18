import { addDays, isoDate, isoWeek, monday } from "@/lib/dates";
import type { MetaSpend, MetricsPayload, OsDaily, QontoBalance, QontoTx, RcCountryWeekly, RcDaily } from "@/lib/types";

/**
 * Calculs du dashboard. Tout part de lignes datées (par jour ou par semaine), filtrées par
 * période et par app. Tant qu'une source n'est pas synchronisée, on fabrique les mêmes
 * lignes à partir du seed du 18/11 : un seul chemin de calcul pour les deux cas.
 */

// ------------------------------------------------------------------ périodes
export type PeriodKind = "7" | "30" | "90" | "month" | "custom";
export type Period = { from: string; to: string };

const parse = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const dayCount = (p: Period) => Math.round((parse(p.to).getTime() - parse(p.from).getTime()) / 864e5) + 1;

export function periodOf(kind: PeriodKind, today: Date, custom?: Period): Period {
  const to = isoDate(today);
  if (kind === "custom" && custom && custom.from <= custom.to) return custom;
  if (kind === "month") return { from: to.slice(0, 8) + "01", to };
  const n = kind === "7" ? 7 : kind === "90" ? 90 : 30;
  return { from: isoDate(addDays(today, -(n - 1))), to };
}
/** La période juste avant, de même durée. */
export function previous(p: Period): Period {
  const n = dayCount(p);
  const end = addDays(parse(p.from), -1);
  return { from: isoDate(addDays(end, -(n - 1))), to: isoDate(end) };
}
const within = (date: string, p: Period) => date >= p.from && date <= p.to;
export const change = (now: number | null, before: number | null) => (now === null || before === null || before === 0 ? null : (now - before) / Math.abs(before));

// --------------------------------------------------------- repli sur le seed
const MONTH_NUM: Record<string, string> = { janv: "01", févr: "02", mars: "03", avr: "04", mai: "05", juin: "06", juil: "07", août: "08", sept: "09", oct: "10", nov: "11", déc: "12" };

export function seedRc(m: MetricsPayload | undefined): RcDaily[] {
  if (!m) return [];
  return m.weeks.flatMap((w) =>
    (["sophia", "micabo", "unswipe"] as const).map((app) => ({
      date: w.lundi, app, revenue: w[app], new_subs: null, trials: null, trial_conversions: null, refunds: null, refund_count: null, actives: null, mrr: null,
    })),
  );
}
export function seedTx(m: MetricsPayload | undefined): QontoTx[] {
  if (!m) return [];
  const year = m.weeks.at(-1)?.lundi.slice(0, 4) ?? "2026";
  return m.months.flatMap((mo) => {
    const key = Object.keys(MONTH_NUM).find((k) => mo.label.toLowerCase().startsWith(k));
    if (!key) return [];
    const partial = /\(au (\d+)\)/.exec(mo.label);
    // Une ligne par poste, posée au milieu du mois (ou du début de mois pour le mois en cours).
    const day = partial ? String(Math.max(1, Math.floor(Number(partial[1]) / 2))).padStart(2, "0") : "15";
    return Object.entries(mo.postes).map(([poste, amount]) => ({
      id: `seed:${key}:${poste}`, date: `${year}-${MONTH_NUM[key]}-${day}`, amount, side: "debit" as const, operation_type: null,
      counterparty: poste, label: null, reference: null, qonto_category: null, poste, app: null, poste_locked: false,
    }));
  });
}
export function seedBalance(m: MetricsPayload | undefined): QontoBalance[] {
  if (!m) return [];
  const [d, mo] = m.asOf.split("/");
  const year = m.weeks.at(-1)?.lundi.slice(0, 4) ?? "2026";
  return m.weeks.map((w) => ({ date: w.partial ? `${year}-${mo}-${d}` : isoDate(addDays(parse(w.lundi), 6)), balance: w.tresor }));
}
export function seedOs(m: MetricsPayload | undefined): OsDaily[] {
  if (!m) return [];
  return m.weeks.map((w) => ({
    date: w.lundi, app: "all", comptes_actifs: w.actifs, posts_faits: null, posts_prevus: null, posts_viraux: null, vues_total: w.vues, vues_mediane: null,
    nouveaux_posteurs: null, kills: w.kills, doubles: w.doubles, tickets_ouverts: null, tickets_resolus: null, paie_upwork: null, paie_ruul: null,
    viraux_pct: w.viraux, support_pct: w.support,
  }));
}

// ------------------------------------------------------------------ agrégats
const n = (v: number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const sumOf = <T,>(rows: T[], pick: (r: T) => number | null | undefined) => rows.reduce((a, r) => a + n(pick(r)), 0);
const hasAny = <T,>(rows: T[], pick: (r: T) => number | null | undefined) => rows.some((r) => pick(r) !== null && pick(r) !== undefined);

export type RcTotals = { revenue: number; newSubs: number | null; trials: number | null; conversions: number | null; refunds: number | null; mrr: number | null; actives: number | null };
export function rcTotals(rows: RcDaily[], app: string, p: Period): RcTotals {
  const inP = rows.filter((r) => within(r.date, p) && (app === "all" || r.app === app));
  // MRR et abonnés actifs : la dernière valeur connue de chaque app dans la période.
  const lastOf = (pick: (r: RcDaily) => number | null) => {
    const byApp = new Map<string, RcDaily>();
    inP.filter((r) => pick(r) !== null).forEach((r) => {
      const cur = byApp.get(r.app);
      if (!cur || r.date > cur.date) byApp.set(r.app, r);
    });
    return byApp.size ? [...byApp.values()].reduce((a, r) => a + n(pick(r)), 0) : null;
  };
  const opt = (pick: (r: RcDaily) => number | null) => (hasAny(inP, pick) ? sumOf(inP, pick) : null);
  return {
    revenue: sumOf(inP, (r) => r.revenue), newSubs: opt((r) => r.new_subs), trials: opt((r) => r.trials), conversions: opt((r) => r.trial_conversions),
    refunds: opt((r) => r.refunds), mrr: lastOf((r) => r.mrr), actives: lastOf((r) => r.actives),
  };
}

export const debitsIn = (tx: QontoTx[], p: Period, app = "all") => tx.filter((t) => t.side === "debit" && within(t.date, p) && (app === "all" || t.app === app));
export const spendIn = (meta: MetaSpend[], p: Period, app = "all") => sumOf(meta.filter((r) => within(r.date, p) && (app === "all" || r.app === app)), (r) => r.spend);
export const total = (tx: QontoTx[]) => sumOf(tx, (t) => t.amount);

/** Solde au dernier jour connu de la période. */
export function balanceAt(bal: QontoBalance[], date: string): number | null {
  const before = bal.filter((b) => b.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return before ? Number(before.balance) : null;
}

export type OsTotals = { actifs: number | null; vues: number | null; virauxPct: number | null; supportPct: number | null; kills: number | null; doubles: number | null; nouveaux: number | null };
/** Lignes de l'OS pour une app. « Toutes » : la ligne « all » si elle existe, sinon la somme des apps. */
export function osRows(rows: OsDaily[], app: string, p: Period): OsDaily[] {
  const inP = rows.filter((r) => within(r.date, p));
  if (app !== "all") return inP.filter((r) => r.app === app);
  const all = inP.filter((r) => r.app === "all");
  return all.length ? all : inP;
}
export function osTotals(rows: OsDaily[], app: string, p: Period): OsTotals {
  const list = osRows(rows, app, p);
  if (!list.length) return { actifs: null, vues: null, virauxPct: null, supportPct: null, kills: null, doubles: null, nouveaux: null };
  const lastDate = list.map((r) => r.date).sort().at(-1)!;
  const last = list.filter((r) => r.date === lastDate);
  const opt = (pick: (r: OsDaily) => number | null | undefined) => (hasAny(list, pick) ? sumOf(list, pick) : null);
  const faits = sumOf(list, (r) => r.posts_faits);
  const ouverts = sumOf(list, (r) => r.tickets_ouverts);
  const seedViraux = list.filter((r) => r.viraux_pct != null);
  const seedSupport = [...list].sort((a, b) => a.date.localeCompare(b.date)).filter((r) => r.support_pct != null).at(-1);
  return {
    actifs: hasAny(last, (r) => r.comptes_actifs) ? sumOf(last, (r) => r.comptes_actifs) : null,
    vues: opt((r) => r.vues_total),
    virauxPct: faits > 0 ? sumOf(list, (r) => r.posts_viraux) / faits : seedViraux.length ? sumOf(seedViraux, (r) => r.viraux_pct) / seedViraux.length : null,
    supportPct: ouverts > 0 ? sumOf(list, (r) => r.tickets_resolus) / ouverts : (seedSupport?.support_pct ?? null),
    kills: opt((r) => r.kills), doubles: opt((r) => r.doubles), nouveaux: opt((r) => r.nouveaux_posteurs),
  };
}

// --------------------------------------------------------------- par semaine
export type Bucket = { key: string; label: string; from: string; to: string };
/** Découpe la période en semaines (lundi → dimanche), ou en jours si elle est courte. */
export function buckets(p: Period): Bucket[] {
  const out: Bucket[] = [];
  if (dayCount(p) <= 14) {
    for (let d = parse(p.from); isoDate(d) <= p.to; d = addDays(d, 1)) {
      const iso = isoDate(d);
      out.push({ key: iso, label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, from: iso, to: iso });
    }
    return out;
  }
  for (let m = monday(parse(p.from)); isoDate(m) <= p.to; m = addDays(m, 7)) {
    const from = isoDate(m);
    const to = isoDate(addDays(m, 6));
    out.push({ key: from, label: `S${isoWeek(m)[1]}${to > p.to ? "*" : ""}`, from, to });
  }
  return out;
}

// ---------------------------------------------------------------------- pays
export type CountryRow = { code: string; name: string; revenue: number; users: number; perUser: number | null; weeks: number };
const FR = typeof Intl !== "undefined" ? new Intl.DisplayNames(["fr"], { type: "region" }) : null;
export function countryName(code: string, fallback?: string | null): string {
  if (/^[A-Z]{2}$/.test(code)) {
    try {
      return FR?.of(code) ?? fallback ?? code;
    } catch {}
  }
  return fallback ?? code;
}
export function countries(rows: RcCountryWeekly[], app: string, p: Period): CountryRow[] {
  // Une semaine compte si son lundi tombe dans la période.
  const inP = rows.filter((r) => within(r.week, p) && (app === "all" || r.app === app));
  const weeks = new Set(inP.map((r) => r.week)).size || 1;
  const map = new Map<string, CountryRow>();
  inP.forEach((r) => {
    const c = map.get(r.country) ?? { code: r.country, name: countryName(r.country, r.country_name), revenue: 0, users: 0, perUser: null, weeks };
    c.revenue += n(r.revenue);
    c.users += n(r.new_users);
    map.set(r.country, c);
  });
  return [...map.values()].map((c) => ({ ...c, perUser: c.users > 0 ? c.revenue / c.users : null })).sort((a, b) => (b.perUser ?? -1) - (a.perUser ?? -1));
}
