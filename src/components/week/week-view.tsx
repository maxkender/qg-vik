"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Minus, Plus } from "lucide-react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip as ChartTip, XAxis, YAxis, ZAxis } from "recharts";
import { toast } from "sonner";
import { ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Lines, Panel } from "@/components/dashboard/charts";
import { useMe } from "@/components/session-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { itemLinksStore, itemsStore } from "@/lib/data";
import { weekKey } from "@/lib/dates";
import { big, eur, int } from "@/lib/format";
import { createItem } from "@/lib/items";
import { newId, useRows } from "@/lib/store";
import { cn } from "@/lib/utils";
import { addDaysIso, isoWeekLabel, mondayOfWeekKey, type CountryRow, type Gap, type Metric, type WeekReport } from "@/lib/week/report";

type Report = WeekReport & { lastFull: string; usdToEur: number };

const dash = "–";
const share = (v: number | null) => (v === null ? dash : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);
const money2 = (v: number | null) => (v === null ? dash : `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const ratio = (done: number | null, planned: number | null) => (done === null ? dash : `${int(done)} / ${planned ? int(planned) : dash}`);
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Une variation : flèche verte ou rouge et pourcentage. `upIsGood` à false pour un coût. */
function Delta({ value, upIsGood = true, label }: { value: number | null; upIsGood?: boolean; label?: string }) {
  if (value === null) return label ? <span className="text-faint">{label} {dash}</span> : <span className="text-faint">{dash}</span>;
  const flat = Math.abs(value) < 0.005;
  const good = flat ? null : value > 0 === upIsGood;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap", good === null ? "text-muted-foreground" : good ? "text-good" : "text-bad")}>
      <Icon className="size-3.5" aria-hidden />
      <span className="num">{value > 0 ? "+" : value < 0 ? "−" : ""}{Math.abs(Math.round(value * 100))} %</span>
      {label && <span className="text-muted-foreground">{label}</span>}
    </span>
  );
}

function Card({ title, metric, format, upIsGood = true, extra }: { title: string; metric: Metric; format: (v: number) => string; upIsGood?: boolean; extra?: ReactNode }) {
  return (
    <div className="glass min-w-0 rounded-2xl p-4" title={`Source : ${metric.source}`}>
      <p className="truncate text-[12.5px] text-muted-foreground">{title}</p>
      <p className={cn("num mt-1.5 truncate text-[24px] leading-none font-medium tracking-[-0.02em]", metric.value === null && "text-faint")}>
        {metric.value === null ? dash : format(metric.value)}
        {extra}
      </p>
      {metric.value === null ? (
        <p className="mt-2 truncate text-[11.5px] text-faint">{metric.source}</p>
      ) : (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
          <Delta value={metric.vsPrev} upIsGood={upIsGood} label="vs sem. d'avant" />
          <Delta value={metric.vsAvg} upIsGood={upIsGood} label="vs moy. 4 sem." />
        </p>
      )}
    </div>
  );
}

const th = "px-2.5 py-2 text-left text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-faint uppercase";
const td = "px-2.5 py-2 whitespace-nowrap";
const tdNum = cn(td, "num text-right");
const thNum = cn(th, "text-right");

function Waiting({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}

/** Les trous d'une partie de la page. Au survol : les chiffres qui les justifient. */
function GapList({ gaps, onAdd, added, withButton }: { gaps: Gap[]; onAdd: (g: Gap) => void; added: (g: Gap) => boolean; withButton?: boolean }) {
  if (!gaps.length) return <p className="text-[13px] text-muted-foreground">Aucun trou détecté.</p>;
  return (
    <ul className="divide-y divide-line">
      {gaps.map((g) => (
        <li key={g.id} className="flex items-start gap-3 py-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={`#${g.anchor}`} className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="block text-[13.5px] font-medium">{g.title}</span>
                <span className="block text-[12.5px] text-muted-foreground">{g.reason}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 text-[12px]">
              <p className="mb-1 font-semibold">Chiffres sources</p>
              {g.sources.map((s) => (
                <p key={s.label} className="flex justify-between gap-4">
                  <span className="opacity-75">{s.label}</span>
                  <span className="num">{s.value}</span>
                </p>
              ))}
              <p className="mt-1.5 border-t border-white/15 pt-1.5 opacity-75">Impact estimé : {g.how}</p>
            </TooltipContent>
          </Tooltip>
          <span className="num shrink-0 pt-0.5 text-[13px] text-muted-foreground" title={`Impact estimé par semaine. ${g.how}`}>≈ {eur(g.impact)}</span>
          {withButton &&
            (added(g) ? (
              <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] text-good"><Check className="size-3.5" aria-hidden /> Dans À faire</span>
            ) : (
              <button type="button" onClick={() => onAdd(g)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-[12.5px] font-medium transition-colors duration-100 hover:border-line-strong">
                <Plus className="size-3.5" aria-hidden /> To-do
              </button>
            ))}
        </li>
      ))}
    </ul>
  );
}

const VERDICT: Record<string, string> = { Recruter: "bg-good-soft text-good", Garder: "bg-info-soft text-info", "À corriger": "bg-warn-soft text-warn", Couper: "bg-bad-soft text-bad" };

/** Les 4 cases : € par utilisateur (horizontal) × vues médianes (vertical), une bulle par pays. */
function Quadrant({ countries, xMid, yMid }: { countries: CountryRow[]; xMid: number; yMid: number }) {
  const points = countries.filter((c) => c.perUser !== null && c.median !== null && c.actives).map((c) => ({ x: c.perUser!, y: c.median!, z: c.actives!, name: c.name }));
  if (points.length < 3) return <Waiting>Pas assez de pays avec à la fois un € par utilisateur et des vues médianes.</Waiting>;
  const axis = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" };
  const corner = "pointer-events-none absolute text-[11px] font-semibold tracking-[0.04em] uppercase";
  return (
    <div className="relative h-[340px] w-full">
      <span className={cn(corner, "top-1 right-3 text-good")}>Pousser</span>
      <span className={cn(corner, "right-3 bottom-9 text-warn")}>Contenu à corriger</span>
      <span className={cn(corner, "top-1 left-14 text-info")}>Vues sans argent</span>
      <span className={cn(corner, "bottom-9 left-14 text-bad")}>Couper</span>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 22, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--line)" />
          <XAxis type="number" dataKey="x" name="€ par utilisateur" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => `${Number(v).toLocaleString("fr-FR")} €`} />
          <YAxis type="number" dataKey="y" name="Vues médianes" width={52} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => big(Number(v))} />
          <ZAxis type="number" dataKey="z" range={[60, 700]} name="Comptes" />
          <ReferenceLine x={xMid} stroke="var(--line-strong)" strokeDasharray="4 4" />
          <ReferenceLine y={yMid} stroke="var(--line-strong)" strokeDasharray="4 4" />
          <ChartTip
            cursor={false}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { name: string; x: number; y: number; z: number } | undefined;
              if (!active || !p) return null;
              return (
                <div className="glass-strong rounded-xl px-3 py-2 text-[12px] shadow-xl">
                  <p className="font-semibold">{p.name}</p>
                  <p className="num text-muted-foreground">{money2(p.x)} par utilisateur · {int(p.y)} vues médianes · {p.z} compte{p.z > 1 ? "s" : ""}</p>
                </div>
              );
            }}
          />
          <Scatter data={points} fill="var(--viz-1)" fillOpacity={0.55} stroke="var(--viz-1)" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function Heatmap({ map, names }: { map: NonNullable<WeekReport["heatmap"]>; names: Map<string, string> }) {
  const max = Math.max(1, ...Object.values(map.cells));
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-[12px]">
        <thead>
          <tr>
            <th />
            {map.labels.map((l) => <th key={l} className="max-w-24 truncate px-1 pb-1 text-left font-medium text-muted-foreground" title={l}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {map.countries.map((c) => (
            <tr key={c}>
              <th className="pr-2 text-left font-medium whitespace-nowrap">{names.get(c) ?? c}</th>
              {map.labels.map((l) => {
                const v = map.cells[`${c}|${l}`];
                return v === undefined ? (
                  <td key={l} className="h-8 min-w-16 rounded-md border border-dashed border-line-strong" title={`${names.get(c) ?? c} × ${l} : personne`} />
                ) : (
                  <td key={l} className="num h-8 min-w-16 rounded-md px-1.5 text-right" title={`${names.get(c) ?? c} × ${l} : ${int(v)} vues médianes`} style={{ background: `color-mix(in oklab, var(--viz-1) ${Math.round(8 + 62 * Math.sqrt(v / max))}%, transparent)` }}>
                    {big(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WeekView() {
  const me = useMe();
  const { today } = useView();
  const router = useRouter();
  const asked = useSearchParams().get("s");
  const [state, setState] = useState<{ key: string | null; report?: Report; error?: string }>({ key: null });
  const [allCountries, setAllCountries] = useState(false);
  const items = useRows(itemsStore);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/semaine${asked ? `?s=${asked}` : ""}`)
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as Report & { error?: string } }))
      .then(({ ok, body }) => alive && setState(ok ? { key: asked, report: body } : { key: asked, error: body.error ?? "Impossible de charger la semaine." }))
      .catch(() => alive && setState({ key: asked, error: "Impossible de charger la semaine." }));
    return () => {
      alive = false;
    };
  }, [asked]);
  const loading = state.key !== asked;
  const r = state.report;

  // Arrivée par un lien « …#pays-NO » : on amène la ligne à l'écran.
  useEffect(() => {
    if (!r || !window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("qg-flash");
  }, [r]);

  const names = useMemo(() => new Map((r?.countries ?? []).map((c) => [c.code, c.name])), [r]);
  const go = (monday: string) => router.replace(`/semaine?s=${isoWeekLabel(monday).key}`);
  const monday = r ? r.from : ((asked && mondayOfWeekKey(asked)) ?? null);

  const added = (g: Gap) => items.some((i) => !i.done && i.title === g.title);
  function addTodo(g: Gap) {
    if (!r) return;
    const item = createItem({
      title: g.title, prio: "urgent", owner: "max", bucket: weekKey(today), category: g.category, created_by: me.id,
      notes: [`${g.reason}`, "", `Semaine ${r.label}. Impact estimé : ${eur(g.impact)} par semaine (${g.how.replace(/\.$/, "")}).`, ...g.sources.map((s) => `${s.label} : ${s.value}`)].join("\n"),
    });
    void itemLinksStore.insert({ id: newId(), item_id: item.id, page_id: null, url: `${window.location.origin}/semaine?s=${r.week}#${g.anchor}`, title: null, created_by: me.id, created_at: new Date().toISOString() });
    toast("Ajouté dans À faire", { description: "Urgent, assigné à Max." });
  }
  const copy = () => r && void navigator.clipboard.writeText(r.slack).then(() => toast("Résumé copié"), () => toast.error("Impossible de copier"));

  const shown = r ? (allCountries ? r.countries : r.countries.filter((c) => c.users4 >= 200 || (c.actives ?? 0) > 0).slice(0, 40)) : [];
  const hasOsDetail = r?.content.kind === "os" && r.labels.length > 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Semaine" eyebrow={r ? <>{r.label} · du <span className="num">{r.from.slice(8)}/{r.from.slice(5, 7)}</span> au <span className="num">{r.to.slice(8)}/{r.to.slice(5, 7)}</span>{!r.complete && " · semaine en cours"}</> : undefined}>
        <div className="flex items-center rounded-[10px] border border-line bg-glass p-[3px]">
          <button type="button" disabled={!monday} onClick={() => monday && go(addDaysIso(monday, -7))} aria-label="Semaine d'avant" className="grid size-[26px] place-items-center rounded-[7px] text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronLeft className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => router.replace("/semaine")} className="num h-[26px] rounded-[7px] px-2.5 text-[12.5px] font-medium hover:bg-accent" title="Revenir à la dernière semaine pleine">{r?.label ?? "…"}</button>
          <button type="button" disabled={!r || !monday || monday >= addDaysIso(r.lastFull, 7)} onClick={() => monday && go(addDaysIso(monday, 7))} aria-label="Semaine d'après" className="grid size-[26px] place-items-center rounded-[7px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"><ChevronRight className="size-4" aria-hidden /></button>
        </div>
        <button type="button" onClick={copy} disabled={!r} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background disabled:opacity-40">
          <Copy className="size-4" aria-hidden /> Copier le résumé
        </button>
      </ViewHeader>

      {state.error && !loading && <p className="px-6 text-[14px] text-bad">{state.error}</p>}
      {!r && !state.error && <p className="animate-pulse px-6 text-[14px] text-faint">Calcul de la semaine…</p>}

      {r && (
        <div className={cn("flex min-w-0 flex-col gap-3 px-4 pb-24 transition-opacity duration-100 md:px-6 [&>*]:min-w-0", loading && "opacity-50")}>
          {/* ------------------------------------------------------ 1. résumé */}
          <p className="text-[17px] leading-snug font-medium tracking-[-0.01em]">{r.sentence}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Card title="Revenus" metric={r.summary.revenue} format={(v) => eur(v)} />
            <Card title="Nouveaux abonnés" metric={r.summary.newSubs} format={int} />
            <Card title="Vues totales" metric={r.summary.views} format={(v) => big(v)} />
            <Card title="Vues médianes par post" metric={r.summary.median} format={int} />
            <Card title="Posts viraux · 10 k vues ou plus" metric={r.summary.viralPct} format={share} />
            <Card title="Posts faits / prévus" metric={r.summary.postsDone} format={int} extra={r.summary.postsPlanned ? <span className="text-[14px] text-muted-foreground"> / {int(r.summary.postsPlanned)}</span> : null} />
            <Card title="Comptes actifs" metric={r.summary.actives} format={int} />
            <Card title="Coût posteurs" metric={r.summary.posterCost} format={(v) => eur(v)} upIsGood={false} />
            <Card title="€ pour 1 000 vues" metric={r.summary.per1000} format={money2} />
          </div>
          <p className="text-[12.5px] text-muted-foreground">{r.content.note}</p>

          {/* --------------------------------------------- 2. vues et contenu */}
          <h2 className="mt-5 text-[20px] font-semibold">Vues et contenu</h2>
          <Panel title="Vues par jour" caption="Cette semaine, comparée à la semaine d'avant">
            {r.daily ? (
              <Lines data={r.daily} x="day" series={[{ key: "views", label: r.label, color: "var(--viz-1)" }, { key: "prev", label: "Semaine d'avant", color: "var(--viz-other)" }]} format={(v) => big(v)} label="Vues par jour" />
            ) : (
              <Waiting>Le détail par jour arrive avec l&apos;accès à l&apos;OS.</Waiting>
            )}
          </Panel>
          <Panel title="Par app">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead><tr className="border-b border-line"><th className={th}>App</th><th className={thNum}>Vues</th><th className={thNum}>Médiane</th><th className={thNum}>% viraux</th><th className={thNum}>Posts faits / prévus</th><th className={thNum}>Comptes actifs</th></tr></thead>
                <tbody>
                  {r.apps.map((a) => (
                    <tr key={a.key} id={`app-${a.key}`} className="border-b border-line last:border-0">
                      <td className={cn(td, "font-medium")}>{a.name}</td><td className={tdNum}>{a.views === null ? dash : big(a.views)}</td><td className={tdNum}>{int(a.median)}</td><td className={tdNum}>{share(a.viralPct)}</td><td className={tdNum}>{ratio(a.postsDone, a.postsPlanned)}</td><td className={tdNum}>{int(a.actives)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!hasOsDetail && <p className="mt-2 text-[12.5px] text-muted-foreground">Le détail du contenu par app arrive avec l&apos;accès à l&apos;OS.</p>}
          </Panel>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
            <Panel title="Top 10 des posts de la semaine">
              {r.topPosts.length ? (
                <ol className="divide-y divide-line">
                  {r.topPosts.map((p, i) => (
                    <li key={i} className="flex items-center gap-3 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniature servie par l'OS */}
                      {p.thumb ? <img src={p.thumb} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded-md object-cover" /> : <span className="h-12 w-9 shrink-0 rounded-md bg-muted" />}
                      <span className="min-w-0 flex-1">
                        {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="block truncate text-[13.5px] font-medium hover:underline">{p.account}</a> : <span className="block truncate text-[13.5px] font-medium">{p.account}</span>}
                        <span className="block truncate text-[12px] text-muted-foreground">{p.label || "sans label"} · {names.get(p.country) ?? (p.country || dash)}</span>
                      </span>
                      <span className="num text-[13.5px]">{big(p.views)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Waiting>Les posts arrivent avec l&apos;accès à l&apos;OS.</Waiting>
              )}
            </Panel>
            <Panel title="Les 10 comptes qui ont le plus baissé">
              {r.drops.length ? (
                <ol className="divide-y divide-line">
                  {r.drops.map((d) => (
                    <li key={d.account} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{d.account}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{d.label || "sans label"} · {names.get(d.country) ?? (d.country || dash)}</span>
                      </span>
                      <span className="num text-[12.5px] text-muted-foreground">{big(d.prev)} → {big(d.views)}</span>
                      <Delta value={d.change} />
                    </li>
                  ))}
                </ol>
              ) : (
                <Waiting>Les comptes arrivent avec l&apos;accès à l&apos;OS.</Waiting>
              )}
            </Panel>
          </div>

          {/* ---------------------------------------------------- 3. RevenueCat */}
          <h2 className="mt-5 text-[20px] font-semibold">RevenueCat</h2>
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[13px]">
                <thead><tr className="border-b border-line"><th className={th}>App</th><th className={thNum}>Revenus</th><th className={thNum}>vs sem. d&apos;avant</th><th className={thNum}>Nouveaux abonnés</th><th className={thNum}>Essais</th><th className={thNum}>Essai → payant</th><th className={thNum}>Remboursements</th><th className={thNum}>€ par nouvel utilisateur</th><th className={thNum}>€ pour 1 000 vues</th></tr></thead>
                <tbody>
                  {r.apps.map((a) => (
                    <tr key={a.key} className="border-b border-line last:border-0">
                      <td className={cn(td, "font-medium")}>{a.name}</td>
                      <td className={tdNum}>{a.revenue.value === null ? <span className="text-faint">pas branchée</span> : eur(a.revenue.value)}</td>
                      <td className={tdNum}><Delta value={a.revenue.vsPrev} /></td>
                      <td className={tdNum}>{int(a.newSubs)}</td><td className={tdNum}>{int(a.trials)}</td><td className={tdNum}>{share(a.conversion)}</td><td className={tdNum}>{a.refunds === null ? dash : eur(a.refunds)}</td><td className={tdNum}>{money2(a.perUser)}</td><td className={tdNum}>{money2(a.per1000)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12.5px] text-muted-foreground">« € pour 1 000 vues » par app : il faut les vues par app, donc l&apos;accès à l&apos;OS. En attendant, le chiffre global est en haut de page.</p>
          </Panel>

          {/* ------------------------------------------------ 4. trous par pays */}
          <h2 className="mt-5 text-[20px] font-semibold">Les trous par pays</h2>
          <Panel title="Trous détectés"><GapList gaps={r.gaps.filter((g) => g.scope === "pays")} onAdd={addTodo} added={added} /></Panel>
          <Panel
            title="Par pays"
            caption={`€ par utilisateur calculé sur 4 semaines glissantes. ${r.countrySource === "releve" ? "Comptes, vues médianes et coût : relevé manuel du 18/11." : r.countrySource === "aucun" ? "Comptes, vues et coût : en attente de l'OS." : "Comptes, vues et coût : OS."}`}
            action={<button type="button" onClick={() => setAllCountries((v) => !v)} className="shrink-0 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">{allCountries ? "Les principaux" : `Tous les pays (${r.countries.length})`}</button>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className={th}>Pays</th><th className={thNum}>€ par utilisateur</th><th className={thNum}>Revenus</th><th className={thNum}>vs sem. d&apos;avant</th><th className={thNum}>Nouveaux utilisateurs</th><th className={thNum}>Comptes actifs</th><th className={thNum}>Posts faits / prévus</th><th className={thNum}>Vues médianes</th><th className={thNum}>% viraux</th><th className={thNum}>Coût posteurs</th><th className={thNum} title={`Revenus ÷ coût, avec 1 $ ≈ ${r.usdToEur.toLocaleString("fr-FR")} €`}>Revenu ÷ coût</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.code} id={`pays-${c.code}`} className="border-b border-line last:border-0">
                      <td className={cn(td, "font-medium")}>
                        {c.name}
                        {c.verdict && <span className={cn("ml-2 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold", VERDICT[c.verdict] ?? "bg-muted text-muted-foreground")}>{c.verdict}</span>}
                      </td>
                      <td className={tdNum} title={c.perUserWeek !== null ? `Sur la seule semaine : ${money2(c.perUserWeek)}` : undefined}>{money2(c.perUser)}</td>
                      <td className={tdNum}>{eur(c.revenue)}</td><td className={tdNum}><Delta value={c.revenueVsPrev} /></td><td className={tdNum}>{int(c.users)}</td>
                      <td className={tdNum}>{int(c.actives)}</td><td className={tdNum}>{ratio(c.postsDone, c.postsPlanned)}</td><td className={tdNum}>{int(c.median)}</td><td className={tdNum}>{share(c.viralPct)}</td>
                      <td className={tdNum}>{c.costUsd === null ? dash : `${int(Math.round(c.costUsd))} $`}</td><td className={tdNum}>{c.ratio === null ? dash : `× ${c.ratio.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Où pousser, où couper" caption="€ par utilisateur (horizontal) × vues médianes (vertical). Une bulle par pays, sa taille = le nombre de comptes. Les pointillés sont les médianes.">
            {r.perUserMedian !== null && r.medianViewsMedian !== null ? <Quadrant countries={r.countries} xMid={r.perUserMedian} yMid={r.medianViewsMedian} /> : <Waiting>Il faut les vues médianes par pays : elles arrivent avec l&apos;accès à l&apos;OS.</Waiting>}
          </Panel>

          {/* ----------------------------------------------- 5. trous par label */}
          <h2 className="mt-5 text-[20px] font-semibold">Les trous par label</h2>
          {r.labels.length ? (
            <>
              <Panel title="Trous détectés"><GapList gaps={r.gaps.filter((g) => g.scope === "label")} onAdd={addTodo} added={added} /></Panel>
              <Panel title="Par label">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-[13px]">
                    <thead><tr className="border-b border-line"><th className={th}>Label</th><th className={th}>App</th><th className={thNum}>Comptes actifs</th><th className={thNum}>Posts</th><th className={thNum}>Vues médianes</th><th className={thNum}>% viraux</th><th className={thNum}>Meilleur post</th><th className={thNum}>vs sem. d&apos;avant</th><th className={thNum}>Réserve</th></tr></thead>
                    <tbody>
                      {r.labels.map((l) => (
                        <tr key={l.label} id={`label-${slug(l.label)}`} className="border-b border-line last:border-0">
                          <td className={cn(td, "font-medium")}>{l.label}</td><td className={td}>{l.app || dash}</td><td className={tdNum}>{int(l.actives)}</td><td className={tdNum}>{int(l.posts)}</td><td className={tdNum}>{int(l.median)}</td><td className={tdNum}>{share(l.viralPct)}</td>
                          <td className={tdNum}>{l.bestViews === null ? dash : l.bestUrl ? <a href={l.bestUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">{big(l.bestViews)}</a> : big(l.bestViews)}</td>
                          <td className={tdNum}><Delta value={l.viewsVsPrev} /></td>
                          <td className={cn(tdNum, l.reserveDays !== null && l.reserveDays < 3 && "text-bad")}>{l.reserve === null ? dash : `${int(l.reserve)}${l.reserveDays !== null ? ` · ${l.reserveDays.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j` : ""}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              {r.heatmap && (
                <Panel title="Pays × label" caption="Vues médianes. Une case vide en pointillés = personne sur ce label dans ce pays.">
                  <Heatmap map={r.heatmap} names={names} />
                </Panel>
              )}
            </>
          ) : (
            <Waiting>Les labels (comptes, vues, réserve de contenu) et la carte pays × label viennent de l&apos;OS, qui n&apos;est pas encore branché. Le message pour Adrien est prêt.</Waiting>
          )}

          {/* ------------------------------------------------- 6. trous par app */}
          <h2 className="mt-5 text-[20px] font-semibold">Les trous par app</h2>
          <Panel><GapList gaps={r.gaps.filter((g) => g.scope === "app")} onAdd={addTodo} added={added} /></Panel>

          {/* ---------------------------------------- 7. à faire cette semaine */}
          <h2 className="mt-5 text-[20px] font-semibold">À faire cette semaine</h2>
          <Panel caption="Tous les trous détectés, du plus gros impact estimé au plus petit. Survole une ligne pour voir ses chiffres sources.">
            <GapList gaps={r.gaps} onAdd={addTodo} added={added} withButton />
          </Panel>
        </div>
      )}
    </div>
  );
}
