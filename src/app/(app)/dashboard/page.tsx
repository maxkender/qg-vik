"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleAlert, CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Bars, Lines, Panel } from "@/components/dashboard/charts";
import { Decisions } from "@/components/dashboard/decisions";
import { Flags, MonthlyByPoste, TopVendors, Transactions } from "@/components/dashboard/expenses";
import { QuickLinks } from "@/components/dashboard/quick-links";
import { Src, SyncBar } from "@/components/dashboard/sync-bar";
import { useDash, type Dash, type SourceInfo } from "@/components/dashboard/use-dash";
import { verdictsStore } from "@/lib/data";
import {
  balanceAt, buckets, change, countries, countryName, dayCount, debitsIn, osRows, osTotals, periodOf, previous, rcTotals, spendIn, total,
  type Period, type PeriodKind,
} from "@/lib/dash";
import { big, eur, int, pct, shortDate, signedPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODS: { key: PeriodKind; label: string }[] = [
  { key: "7", label: "7 j" }, { key: "30", label: "30 j" }, { key: "90", label: "90 j" }, { key: "month", label: "Mois" }, { key: "custom", label: "Perso" },
];
const field = "h-9 min-w-0 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none transition-colors duration-100 focus:border-line-strong";
const color = (c: string | null | undefined) => `var(--${c ?? "viz-other"})`;

export default function DashboardPage() {
  const dash = useDash();
  const { today } = useView();
  const [kind, setKind] = useState<PeriodKind>("30");
  const [custom, setCustom] = useState<Period>(() => periodOf("30", today));
  const [app, setApp] = useState("all");

  const period = useMemo(() => periodOf(kind, today, custom), [kind, today, custom]);
  const prev = useMemo(() => previous(period), [period]);
  const S = dash.sources;

  // ------------------------------------------------------------ cartes du haut
  const k = useMemo(() => {
    const side = (p: Period) => {
      const rc = rcTotals(dash.rc, app, p);
      const qonto = total(debitsIn(dash.tx, p, app));
      const meta = spendIn(dash.meta, p, app);
      const os = osTotals(dash.os, app, p);
      return { rc, qonto, meta, dep: qonto + meta, marge: rc.revenue - qonto - meta, os, tresor: balanceAt(dash.bal, p.to) };
    };
    return { cur: side(period), old: side(prev) };
  }, [dash.rc, dash.tx, dash.meta, dash.os, dash.bal, app, period, prev]);

  const weeks = useMemo(() => buckets(period), [period]);
  const appName = app === "all" ? "Toutes les apps" : (dash.apps.find((a) => a.key === app)?.name ?? app);

  // -------------------------------------------------------------- séries
  const series = useMemo(
    () =>
      weeks.map((b) => {
        const p = { from: b.from < period.from ? period.from : b.from, to: b.to > period.to ? period.to : b.to };
        const row: Record<string, string | number | boolean | null> = { label: b.label, partial: b.to > period.to };
        const rc = rcTotals(dash.rc, app, p);
        row.rev = Math.round(rc.revenue);
        row.dep = Math.round(total(debitsIn(dash.tx, p, app)) + spendIn(dash.meta, p, app));
        dash.apps.forEach((a) => (row[`rev_${a.key}`] = Math.round(rcTotals(dash.rc, a.key, p).revenue)));
        const os = osTotals(dash.os, app, p);
        row.vues = os.vues;
        row.viraux = os.virauxPct === null ? null : os.virauxPct * 100;
        row.actifs = os.actifs;
        row.kills = os.kills;
        row.doubles = os.doubles;
        return row;
      }),
    [weeks, period, dash.rc, dash.tx, dash.meta, dash.os, dash.apps, app],
  );

  if (!dash.loaded) {
    return (
      <>
        <ViewHeader title="Dashboard" />
        <p className="px-4 text-muted-foreground md:px-6">Les chiffres arrivent…</p>
      </>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader
        title="Dashboard"
        sub={
          <>
            Du <span className="num">{shortDate(period.from)}</span> au <span className="num">{shortDate(period.to)}</span> · {appName} · comparé aux{" "}
            <span className="num">{dayCount(period)}</span> jours d&apos;avant
          </>
        }
      >
        <div role="group" aria-label="Période" className="flex rounded-[10px] border border-line bg-glass p-[3px]">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={kind === p.key}
              onClick={() => setKind(p.key)}
              className={cn("h-[28px] rounded-[7px] px-2.5 text-[12.5px] font-medium transition-colors duration-100", kind === p.key ? "bg-accent text-foreground shadow-[0_0_0_1px_var(--line-strong)]" : "text-muted-foreground hover:text-foreground")}
            >
              {p.label}
            </button>
          ))}
        </div>
        {kind === "custom" && (
          <>
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="Du" className={field} />
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="Au" className={field} />
          </>
        )}
        <select value={app} onChange={(e) => setApp(e.target.value)} aria-label="App" className={field}>
          <option value="all">Toutes les apps</option>
          {dash.apps.map((a) => (
            <option key={a.key} value={a.key}>{a.name}</option>
          ))}
        </select>
      </ViewHeader>

      <div className="flex min-w-0 flex-col gap-3 px-4 pb-16 md:px-6 [&>*]:min-w-0">
        <QuickLinks />
        <SyncBar dash={dash} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Trésorerie" value={eur(k.cur.tresor)} delta={change(k.cur.tresor, k.old.tresor)} src={S.qonto} seedDate={dash.seedDate} hero />
          <Kpi label="Revenus" value={eur(k.cur.rc.revenue)} delta={change(k.cur.rc.revenue, k.old.rc.revenue)} src={S.revenuecat} seedDate={dash.seedDate} />
          <Kpi label="Dépenses" hint="Qonto + pubs Meta" value={eur(k.cur.dep)} delta={change(k.cur.dep, k.old.dep)} inverse src={[S.qonto, S.meta]} seedDate={dash.seedDate} />
          <Kpi label="Marge" value={eur(k.cur.marge)} delta={change(k.cur.marge, k.old.marge)} src={[S.revenuecat, S.qonto, S.meta]} seedDate={dash.seedDate} />
          <Kpi label="Pubs Meta" value={dash.live.meta ? eur(k.cur.meta) : "–"} delta={dash.live.meta ? change(k.cur.meta, k.old.meta) : null} inverse note={dash.live.meta ? undefined : "pas encore branché"} src={S.meta} seedDate={dash.seedDate} />
          <Kpi label="Posts viraux" hint="10 k vues ou plus" value={pct(k.cur.os.virauxPct)} delta={change(k.cur.os.virauxPct, k.old.os.virauxPct)} src={S.os} seedDate={dash.seedDate} />
          <Kpi label="Comptes actifs" value={int(k.cur.os.actifs)} delta={change(k.cur.os.actifs, k.old.os.actifs)} src={S.os} seedDate={dash.seedDate} />
          <Kpi
            label="Tickets support résolus"
            value={pct(k.cur.os.supportPct, 0)}
            delta={change(k.cur.os.supportPct, k.old.os.supportPct)}
            warn={k.cur.os.supportPct !== null && k.cur.os.supportPct < 0.5}
            src={S.os}
            seedDate={dash.seedDate}
          />
        </div>

        <SectionTitle>Par app</SectionTitle>
        <PerApp dash={dash} period={period} />

        <SectionTitle link={{ href: "/depenses", label: "Règles et détail" }}>Dépenses</SectionTitle>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          <MonthlyByPoste dash={dash} />
          <TopVendors dash={dash} period={period} app={app} />
        </div>
        <Flags dash={dash} />
        <Transactions dash={dash} period={period} app={app} />

        <SectionTitle>Revenus</SectionTitle>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          <Panel title="Revenus et dépenses" caption={dayCount(period) <= 14 ? "Par jour" : "Par semaine (lundi → dimanche)"} action={<Src s={[S.revenuecat, S.qonto, S.meta]} seedDate={dash.seedDate} />}>
            <Bars label="Revenus et dépenses" data={series} x="label" format={big} series={[{ key: "rev", label: "Revenus", color: "var(--viz-3)" }, { key: "dep", label: "Dépenses", color: "var(--viz-2)" }]} />
          </Panel>
          <Panel title="Revenus par app" caption="Chaque app a sa propre échelle" action={<Src s={S.revenuecat} seedDate={dash.seedDate} />}>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(dash.apps.length, 4) || 1}, minmax(0, 1fr))` }}>
              {dash.apps.map((a) => (
                <div key={a.key} className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span className="size-2.5 rounded-[3px]" style={{ background: color(a.color) }} aria-hidden />
                    {a.name}
                  </p>
                  <p className="num mt-0.5 mb-1 text-[15px]">{eur(rcTotals(dash.rc, a.key, period).revenue)}</p>
                  <Bars label={`Revenus ${a.name}`} data={series} x="label" format={big} height={150} series={[{ key: `rev_${a.key}`, label: a.name, color: color(a.color) }]} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <Countries dash={dash} period={period} app={app} />

        <SectionTitle>Contenu</SectionTitle>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
          <Panel title="% de posts viraux" caption="Posts à 10 k vues ou plus" action={<Src s={S.os} seedDate={dash.seedDate} />}>
            <Lines label="Pourcentage de posts viraux" data={series} x="label" format={(v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %"} series={[{ key: "viraux", label: "Posts viraux", color: "var(--viz-1)" }]} />
          </Panel>
          <Panel title="Vues TikTok" caption="Total de la période, tous les comptes" action={<Src s={S.os} seedDate={dash.seedDate} />}>
            <Bars label="Vues TikTok" data={series} x="label" format={big} series={[{ key: "vues", label: "Vues", color: "var(--viz-3)" }]} />
          </Panel>
          <Panel title="Comptes actifs, kills, doublés" caption="Kills le samedi, doublements le jeudi" action={<Src s={S.os} seedDate={dash.seedDate} />}>
            <Lines label="Comptes actifs" data={series} x="label" format={int} height={104} series={[{ key: "actifs", label: "Comptes actifs", color: "var(--viz-3)" }]} />
            <div className="mt-3">
              <Bars label="Kills et doublements" data={series} x="label" format={int} height={92} series={[{ key: "kills", label: "Kills", color: "var(--viz-2)" }, { key: "doubles", label: "Doublés", color: "var(--viz-4)" }]} />
            </div>
          </Panel>
        </div>

        <SectionTitle>Décisions</SectionTitle>
        <Decisions />
      </div>
    </div>
  );
}

function SectionTitle({ children, link }: { children: ReactNode; link?: { href: string; label: string } }) {
  return (
    <div className="mt-6 mb-0.5 flex items-baseline justify-between gap-3">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{children}</h2>
      {link && (
        <Link href={link.href} className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          {link.label} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function Kpi({
  label, hint, value, delta, inverse, note, warn, src, seedDate, hero,
}: {
  label: string;
  hint?: string;
  value: string;
  delta: number | null;
  /** Pour les dépenses : une hausse est une mauvaise nouvelle. */
  inverse?: boolean;
  note?: string;
  warn?: boolean;
  src: SourceInfo | SourceInfo[];
  seedDate: string | null;
  hero?: boolean;
}) {
  // Tant que la source n'est pas synchronisée, on n'affiche pas de variation : elle serait trompeuse.
  const srcs = Array.isArray(src) ? src : [src];
  const seedOnly = srcs.every((x) => !x.live);
  if (seedOnly) {
    delta = null;
    note = note ?? (seedDate ? `chiffres du ${shortDate(seedDate)}` : undefined);
  }
  const flat = delta === null || Math.abs(delta) < 0.005;
  const good = !flat && (inverse ? delta! < 0 : delta! > 0);
  const Icon = flat ? null : delta! > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="glass flex min-w-0 flex-col gap-1 rounded-2xl p-4">
      <p className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
        <span className="truncate">{label}{hint && <span className="ml-1.5 text-faint max-sm:hidden">{hint}</span>}</span>
        <Src s={src} seedDate={seedDate} />
      </p>
      <p className={cn("font-heading leading-tight font-semibold tracking-[-0.02em] tabular-nums", hero ? "text-[30px]" : "text-[26px]", warn && "text-bad")}>{value}</p>
      {delta !== null ? (
        <p className={cn("num inline-flex items-center gap-0.5 text-[11.5px]", flat ? "text-muted-foreground" : good ? "text-good" : "text-bad")}>
          {Icon && <Icon className="size-3.5" aria-hidden />}
          {signedPct(delta)} <span className="ml-1 font-sans text-faint">vs période préc.</span>
        </p>
      ) : (
        <p className={cn("inline-flex items-center gap-1 text-[11.5px]", warn ? "text-bad" : "text-faint")}>
          {warn && <CircleAlert className="size-3.5" aria-hidden />}
          {warn && note ? `à surveiller · ${note}` : (note ?? (warn ? "à surveiller" : "pas de comparaison"))}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- par app
function PerApp({ dash, period }: { dash: Dash; period: Period }) {
  const rows = useMemo(() => {
    const posteurs = debitsIn(dash.tx, period).filter((t) => t.poste === "Posteurs");
    const unassigned = total(posteurs.filter((t) => !t.app));
    // Les dépenses posteurs sans app sont réparties selon les comptes actifs de chaque app (OS).
    const actifs = dash.apps.map((a) => osTotals(dash.os.filter((r) => r.app !== "all"), a.key, period).actifs ?? 0);
    const sumActifs = actifs.reduce((x, y) => x + y, 0);
    return dash.apps.map((a, i) => {
      const rc = rcTotals(dash.rc, a.key, period);
      const cs = dash.rcCountry.filter((r) => r.app === a.key && r.week >= period.from && r.week <= period.to);
      const users = cs.reduce((x, r) => x + Number(r.new_users ?? 0), 0);
      const revC = cs.reduce((x, r) => x + Number(r.revenue ?? 0), 0);
      const os = osRows(dash.os.filter((r) => r.app !== "all"), a.key, period);
      const vues = os.length ? os.reduce((x, r) => x + Number(r.vues_total ?? 0), 0) : null;
      const own = total(posteurs.filter((t) => t.app === a.key));
      const share = unassigned === 0 ? 0 : sumActifs > 0 ? (unassigned * actifs[i]) / sumActifs : null;
      const cost = share === null ? null : own + share + spendIn(dash.meta, period, a.key);
      return {
        a, rc,
        rate: rc.trials && rc.conversions !== null ? rc.conversions / rc.trials : null,
        perUser: users > 0 ? revC / users : null,
        vues,
        cac: cost !== null && rc.newSubs ? cost / rc.newSubs : null,
      };
    });
  }, [dash, period]);

  const th = "border-b border-line px-2 py-1.5 text-right font-medium whitespace-nowrap";
  return (
    <Panel
      caption="Coût d'acquisition approximatif : (coût posteurs de l'app + pubs Meta de l'app) ÷ nouveaux abonnés. Le coût posteurs sans app est réparti selon les comptes actifs."
      action={<Src s={[dash.sources.revenuecat, dash.sources.qonto, dash.sources.meta, dash.sources.os]} seedDate={dash.seedDate} />}
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[12px] text-muted-foreground">
              <th className="border-b border-line px-2 py-1.5 text-left font-medium">App</th>
              <th className={th}>Revenus</th>
              <th className={th}>Nouveaux abonnés</th>
              <th className={th}>Essais → payants</th>
              <th className={th}>MRR</th>
              <th className={th}>€ / utilisateur</th>
              <th className={th}>Vues TikTok</th>
              <th className={th}>Coût d&apos;acquisition</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, rc, rate, perUser, vues, cac }) => (
              <tr key={a.key} className="border-b border-line last:border-0 hover:bg-glass">
                <td className="px-2 py-2 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2.5 rounded-[3px]" style={{ background: color(a.color) }} aria-hidden />
                    {a.name}
                  </span>
                </td>
                <td className="num px-2 py-2 text-right">{eur(rc.revenue)}</td>
                <td className="num px-2 py-2 text-right">{int(rc.newSubs)}</td>
                <td className="num px-2 py-2 text-right">
                  {rc.conversions === null ? "–" : <>{int(rc.conversions)}{rate !== null && <span className="ml-1.5 text-[11.5px] text-muted-foreground">{pct(rate, 0)}</span>}</>}
                </td>
                <td className="num px-2 py-2 text-right">{eur(rc.mrr)}</td>
                <td className="num px-2 py-2 text-right">{perUser === null ? "–" : eur(perUser, 2)}</td>
                <td className="num px-2 py-2 text-right">{vues === null ? "–" : big(vues)}</td>
                <td className="num px-2 py-2 text-right">{cac === null ? "–" : eur(cac, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!dash.live.revenuecat && <p className="mt-3 text-[12.5px] text-faint">Abonnés, essais, MRR et € par utilisateur arrivent avec la première synchro RevenueCat.</p>}
    </Panel>
  );
}

// ---------------------------------------------------------------------- pays
const VERDICTS = ["Recruter", "Garder", "À corriger", "Couper"] as const;
/** En dessous, le € par utilisateur d'un pays n'est pas fiable. */
const MIN_USERS = 100;
const VERDICT: Record<string, { tone: string; icon: typeof CircleCheck }> = {
  Recruter: { tone: "bg-good-soft text-good", icon: CircleCheck },
  Garder: { tone: "bg-info-soft text-info", icon: CircleMinus },
  "À corriger": { tone: "bg-warn-soft text-warn", icon: CircleAlert },
  Couper: { tone: "bg-bad-soft text-bad", icon: CircleX },
};

function Countries({ dash, period, app }: { dash: Dash; period: Period; app: string }) {
  const [all, setAll] = useState(false);
  const live = dash.rcCountry.length > 0;
  const rows = useMemo(() => {
    const known = new Set(dash.verdicts.map((v) => v.code));
    const solid = (c: { code: string; users: number | null }) => (c.users ?? 0) >= MIN_USERS || known.has(c.code);
    if (live) {
      return countries(dash.rcCountry, app, period)
        .filter((c) => c.code !== "Autres" && c.code !== "Unknown")
        .map((c) => ({ code: c.code, name: c.name, perUser: c.perUser, revWeek: c.revenue / c.weeks, users: c.users as number | null }))
        // Un pays avec une poignée d'utilisateurs donne un € par utilisateur qui ne veut rien dire :
        // on classe d'abord ceux qui ont du volume (ou déjà un verdict), les petits ensuite.
        .sort((a, b) => Number(solid(b)) - Number(solid(a)) || (b.perUser ?? -1) - (a.perUser ?? -1));
    }
    // En attendant RevenueCat : le tableau du seed.
    return [...(dash.seed?.countries ?? [])]
      .sort((a, b) => (b.eur_par_user ?? -1) - (a.eur_par_user ?? -1))
      .map((c) => ({ code: c.code, name: countryName(c.code, c.pays), perUser: c.eur_par_user, revWeek: c.revenus_semaine ?? 0, users: null as number | null }));
  }, [live, dash.rcCountry, dash.seed, dash.verdicts, app, period]);
  const verdictOf = new Map(dash.verdicts.map((v) => [v.code, v]));
  const max = Math.max(...rows.map((c) => c.perUser ?? 0), 0.01);
  const shown = all ? rows : rows.slice(0, 14);

  return (
    <Panel
      title="Par pays"
      caption="Trié par € par utilisateur (revenus ÷ nouveaux utilisateurs de la période) : c'est là qu'est l'argent. Les pays à moins de 100 nouveaux utilisateurs sont classés après. Le verdict se change ici."
      action={<Src s={dash.sources.revenuecat} seedDate={dash.seedDate} />}
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-muted-foreground">
              {["Pays", "Zone", "Verdict", "€ / utilisateur"].map((h) => (
                <th key={h} className="border-b border-line px-2 py-1.5 font-medium">{h}</th>
              ))}
              <th className="border-b border-line px-2 py-1.5 text-right font-medium">Revenus / sem.</th>
              <th className="border-b border-line px-2 py-1.5 text-right font-medium">Nouveaux utilisateurs</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const v = verdictOf.get(c.code);
              const tone = VERDICT[v?.verdict ?? ""];
              const Icon = tone?.icon;
              return (
                <tr key={c.code} className="border-b border-line last:border-0 hover:bg-glass">
                  <td className="px-2 py-1.5 font-medium">{c.name}</td>
                  <td className="num px-2 py-1.5 text-muted-foreground">{v?.zone ?? "–"}</td>
                  <td className="px-2 py-1.5">
                    <span className={cn("relative inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-[11.5px] font-semibold whitespace-nowrap", tone?.tone ?? "bg-muted text-muted-foreground")}>
                      {Icon && <Icon className="size-3" aria-hidden />}
                      <select
                        value={v?.verdict ?? ""}
                        aria-label={`Verdict pour ${c.name}`}
                        onChange={(e) => void verdictsStore.upsert({ code: c.code, zone: v?.zone ?? null, verdict: e.target.value || null })}
                        className="cursor-pointer appearance-none bg-transparent pr-1 font-semibold outline-none"
                      >
                        <option value="">À décider</option>
                        {VERDICTS.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {c.perUser ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((c.perUser / max) * 100))}%`, background: "var(--viz-1)" }} />
                        </div>
                        <span className="num text-[12px]">{eur(c.perUser, 2)}</span>
                      </div>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                  <td className="num px-2 py-1.5 text-right">{eur(c.revWeek)}</td>
                  <td className="num px-2 py-1.5 text-right">{int(c.users)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 14 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {all ? "Voir moins" : `Voir les ${rows.length} pays`}
        </button>
      )}
    </Panel>
  );
}
