"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Check, ChevronLeft, Circle, Code2, ExternalLink, Hash, NotebookText, Pencil, Store, X } from "lucide-react";
import { useView } from "@/components/app/view-state";
import { SupportTab } from "@/components/agent/support-tab";
import { AppForm } from "@/components/apps/app-form";
import { AppLogo, NA, PHASES, money, phaseOf, useApi } from "@/components/apps/shared";
import { Bars, Panel } from "@/components/dashboard/charts";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import type { AppDetail, Checkpoint } from "@/lib/apps/report";
import { appTodosStore, appsStore, decisionsStore, itemsStore } from "@/lib/data";
import { isoDate } from "@/lib/dates";
import { big, int, shortDate } from "@/lib/format";
import { createItem, toggleDone } from "@/lib/items";
import { newId, useRows } from "@/lib/store";
import type { AppPhase } from "@/lib/types";
import { cn } from "@/lib/utils";

const share = (v: number | null) => (v === null ? null : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);
const count = (v: number | null) => (v === null ? null : int(v));
const th = "px-2.5 py-2 text-left text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-faint uppercase";
const thNum = cn(th, "text-right");
const td = "px-2.5 py-2 whitespace-nowrap";
const tdNum = cn(td, "num text-right");
const field = "h-9 min-w-0 flex-1 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";
const cell = (v: string | null) => v ?? <span className="text-faint">–</span>;
const signed = (v: number | null) => (v === null ? undefined : v >= 0 ? "text-good" : "text-bad");

function Kpi({ title, value, vs, tone, wide }: { title: string; value: string | null; vs?: number | null; tone?: string; wide?: boolean }) {
  return (
    <div className={cn("glass min-w-0 rounded-2xl p-4", wide && "col-span-2")}>
      <p className="truncate text-[12.5px] text-muted-foreground">{title}</p>
      {value === null ? (
        <p className="mt-2.5 text-[12.5px] text-faint">{NA}</p>
      ) : (
        <p className={cn("num mt-1.5 truncate text-[24px] leading-none font-medium tracking-[-0.02em]", tone)}>{value}</p>
      )}
      {value !== null && vs !== undefined && vs !== null && (
        <p className={cn("num mt-2 inline-flex items-center gap-0.5 text-[11.5px]", vs >= 0 ? "text-good" : "text-bad")}>
          {vs >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
          {vs >= 0 ? "+" : "−"}{Math.abs(Math.round(vs * 100))}&nbsp;% <span className="ml-0.5 font-sans text-muted-foreground">vs période d&apos;avant</span>
        </p>
      )}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}

const DECISION: Record<string, string> = { Doubler: "bg-good-soft text-good", Couper: "bg-bad-soft text-bad", "Changer l'angle": "bg-warn-soft text-warn" };
const CHECK: Record<Checkpoint["status"], { tone: string; icon: typeof Check }> = {
  ok: { tone: "border-good/40 bg-good-soft text-good", icon: Check },
  ko: { tone: "border-bad/40 bg-bad-soft text-bad", icon: X },
  attente: { tone: "border-line bg-muted text-muted-foreground", icon: Circle },
};

export function AppView() {
  const me = useMe();
  const { today, setOpenItem } = useView();
  const { slug } = useParams<{ slug: string }>();
  const apps = useRows(appsStore);
  const app = apps.find((a) => a.slug === slug);
  const items = useRows(itemsStore).filter((i) => i.app_slug === slug);
  const decisions = useRows(decisionsStore).filter((d) => d.app_slug === slug).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  const { data: r, error } = useApi<AppDetail>(`/api/apps/${slug}`, app?.launch_date);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const support = useSearchParams().get("onglet") === "support";
  const urgents = useRows(appTodosStore).filter((t) => t.app_slug === slug && t.type === "urgent" && (t.statut === "a_faire" || t.statut === "en_cours")).length;
  const [allCountries, setAllCountries] = useState(false);

  if (app && !app.active) return <p className="px-6 pt-8 text-[14px] text-muted-foreground">Cette app est archivée. <button type="button" onClick={() => void appsStore.update(app.slug, { active: true })} className="underline underline-offset-4 hover:text-foreground">La remettre</button></p>;
  if (!app) return <p className="px-6 pt-8 text-[14px] text-muted-foreground">{appsStore.loaded ? "Cette app n'existe pas." : "Chargement…"}</p>;

  const todo = items.filter((i) => !i.done).sort((a, b) => a.sort_order - b.sort_order);
  const done = items.filter((i) => i.done);
  const submit = (run: (title: string) => void) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const title = String(new FormData(e.currentTarget).get("title") ?? "").trim();
    if (!title) return;
    run(title);
    e.currentTarget.reset();
  };
  const addTask = submit((title) => createItem({ title, owner: me.short, bucket: "inbox", app_slug: slug, created_by: me.id }));
  const addDecision = submit((title) => void decisionsStore.insert({ id: newId(), date: isoDate(today), title, why: null, domain: "Apps", app_slug: slug, created_at: new Date().toISOString(), created_by: me.id }));

  const links = [
    { url: app.store_url, label: "App Store", icon: Store },
    { url: app.repo_url, label: "Repo", icon: Code2 },
    { url: app.notion_url, label: "Notion", icon: NotebookText },
  ].filter((l) => l.url);
  const weeks = r?.weeks ?? [];
  const countries = r ? (allCountries ? r.countries : r.countries.slice(0, 12)) : [];
  const updated = r?.updatedAt ? new Date(r.updatedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(" ", " à ") : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* ------------------------------------------------------------ en-tête */}
      <div className="px-4 pt-3.5 pb-4 md:px-6 md:pt-6">
        <Link href="/apps" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden /> Apps</Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <AppLogo app={app} size={60} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[24px] leading-[1.05] font-semibold md:text-[32px]">{app.name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              <select
                value={app.phase} aria-label="Phase" onChange={(e) => void appsStore.update(app.slug, { phase: e.target.value as AppPhase })}
                className={cn("h-[22px] cursor-pointer appearance-none rounded-md px-2 text-[11.5px] font-semibold outline-none", phaseOf(app.phase).tone)}
              >
                {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              {r?.launchWeek ? <span>semaine <span className="num">S{r.launchWeek}</span> depuis le lancement</span> : app.launch_date ? <span>lancement le <span className="num">{shortDate(app.launch_date)}</span></span> : <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-4 hover:text-foreground">date de lancement à renseigner</button>}
              {updated && <span>mis à jour le <span className="num">{updated}</span></span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {links.map((l) => (
              <a key={l.label} href={l.url!} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium transition-colors duration-100 hover:border-line-strong">
                <l.icon className="size-4" aria-hidden /> {l.label} <ExternalLink className="size-3 text-faint" aria-hidden />
              </a>
            ))}
            {app.slack_channel && <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-[13px] font-medium"><Hash className="size-4" aria-hidden />{app.slack_channel.replace(/^#/, "")}</span>}
            <button type="button" onClick={() => setEditing(true)} aria-label="Modifier la fiche" className="grid size-9 place-items-center rounded-lg border border-line text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground"><Pencil className="size-4" aria-hidden /></button>
          </div>
        </div>
      </div>

      <div className="mb-3 flex gap-1 px-4 md:px-6" role="tablist">
        {[{ key: false, label: "Chiffres" }, { key: true, label: "Support & avis" }].map((t) => (
          <button key={t.label} type="button" role="tab" aria-selected={support === t.key} onClick={() => router.replace(`/apps/${slug}${t.key ? "?onglet=support" : ""}`)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors duration-100", support === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            {t.label}
            {t.key && urgents > 0 && <span className="num rounded-md bg-bad px-1.5 text-[11px] text-white">{urgents}</span>}
          </button>
        ))}
      </div>
      {support && <SupportTab app={app} />}
      {!support && error && <p className="px-6 text-[14px] text-bad">{error}</p>}
      <div className={cn("flex min-w-0 flex-col gap-3 px-4 pb-24 md:px-6 [&>*]:min-w-0", support && "hidden", !r && !error && "animate-pulse")}>
        {/* ---------------------------------------------------------- KPI */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi title="Revenu 7 jours" value={money(r?.rev7.value ?? null)} vs={r?.rev7.vs} />
          <Kpi title="Revenu 30 jours" value={money(r?.rev30.value ?? null)} vs={r?.rev30.vs} />
          <Kpi title="Coût posteurs" value={money(r?.cost ?? null)} />
          <Kpi title="Marge" value={money(r?.margin ?? null)} tone={signed(r?.margin ?? null)} />
          <Kpi title="€ par compte · semaine" value={money(r?.perAccount ?? null, 2)} />
          <Kpi title="€ pour 1 000 vues" value={money(r?.per1000 ?? null, 2)} />
          <Kpi title="Abonnés actifs" value={count(r?.subs ?? null)} />
          <Kpi title="Essais · 7 jours" value={count(r?.trials ?? null)} />
          <Kpi title="Vues médianes" value={count(r?.median ?? null)} />
          <Kpi title="Posts à 10 k+" value={share(r?.viralPct ?? null)} />
        </div>

        {/* --------------------------------------------------- graphiques */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          <Panel title="Revenu contre coût" caption="Par semaine, 8 dernières semaines pleines">
            {weeks.some((w) => w.revenue !== null) ? (
              <Bars label="Revenu et coût des posteurs par semaine" data={weeks} x="label" format={big} series={[{ key: "revenue", label: "Revenu", color: "var(--viz-1)" }, { key: "cost", label: "Coût posteurs", color: "var(--viz-other)" }]} />
            ) : (
              <Empty>RevenueCat : {NA}.</Empty>
            )}
            {weeks.some((w) => w.revenue !== null) && !weeks.some((w) => w.cost !== null) && <p className="mt-2 text-[12.5px] text-muted-foreground">Coût des posteurs : {NA} (OS).</p>}
          </Panel>
          <Panel title="Vues" caption="Par semaine">
            {weeks.some((w) => w.views !== null) ? <Bars label="Vues par semaine" data={weeks} x="label" format={big} series={[{ key: "views", label: "Vues", color: "var(--viz-2)" }]} /> : <Empty>OS : {NA}.</Empty>}
          </Panel>
        </div>

        {/* --------------------------------------------------------- pays */}
        <Panel
          title="Pays" caption="Revenu de la dernière semaine pleine. € par utilisateur sur 4 semaines."
          action={r && r.countries.length > 12 ? <button type="button" onClick={() => setAllCountries((v) => !v)} className="shrink-0 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">{allCountries ? "Les 12 premiers" : `Tous (${r.countries.length})`}</button> : undefined}
        >
          {countries.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[13px]">
                <thead><tr className="border-b border-line"><th className={th}>Pays</th><th className={thNum}>Revenu</th><th className={thNum}>€ par utilisateur</th><th className={thNum}>Comptes</th><th className={thNum}>Coût</th><th className={thNum}>Marge</th></tr></thead>
                <tbody>
                  {countries.map((c) => (
                    <tr key={c.code} className="border-b border-line last:border-0">
                      <td className={cn(td, "font-medium")}>{c.name}{app.pays_cibles.includes(c.code) && <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">cible</span>}</td>
                      <td className={tdNum}>{cell(money(c.revenue))}</td><td className={tdNum}>{cell(money(c.perUser, 2))}</td><td className={tdNum}>{cell(count(c.accounts))}</td><td className={tdNum}>{cell(money(c.cost))}</td>
                      <td className={cn(tdNum, signed(c.margin))}>{cell(money(c.margin))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>RevenueCat : {NA}.</Empty>
          )}
          {countries.length > 0 && !r?.sources.os && <p className="mt-2 text-[12.5px] text-muted-foreground">Comptes, coût et marge par pays : {NA} (OS).</p>}
        </Panel>

        {/* ------------------------------------------------------- labels */}
        <Panel title="Labels">
          {r?.labels.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead><tr className="border-b border-line"><th className={th}>Label</th><th className={thNum}>Comptes</th><th className={thNum}>Médiane</th><th className={thNum}>% à 10 k+</th><th className={cn(th, "text-right")}>Décision proposée</th></tr></thead>
                <tbody>
                  {r.labels.map((l) => (
                    <tr key={l.label} className="border-b border-line last:border-0">
                      <td className={cn(td, "font-medium")}>{l.label}</td><td className={tdNum}>{cell(count(l.accounts))}</td><td className={tdNum}>{cell(count(l.median))}</td><td className={tdNum}>{cell(share(l.viralPct))}</td>
                      <td className={cn(td, "text-right")}><span className={cn("rounded-md px-2 py-0.5 text-[11.5px] font-semibold", DECISION[l.decision])}>{l.decision}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>OS : {NA}.</Empty>
          )}
        </Panel>

        {/* ------------------------------------------------------- phases */}
        <Panel title="Phases">
          <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {PHASES.map((p, i) => {
              const now = p.key === app.phase;
              const past = PHASES.findIndex((x) => x.key === app.phase) > i;
              return (
                <li key={p.key} aria-current={now ? "step" : undefined} className={cn("rounded-xl border px-3 py-2.5", now ? "border-now bg-now/8" : "border-line", past && "opacity-60")}>
                  <p className={cn("text-[13.5px] font-semibold", now && "text-now")}>{p.label}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{p.detail}</p>
                </li>
              );
            })}
          </ol>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {(r?.checkpoints ?? []).map((c) => {
              const Icon = CHECK[c.status].icon;
              return (
                <li key={c.week} className="flex items-start gap-2.5 rounded-xl border border-line px-3 py-2.5">
                  <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border", CHECK[c.status].tone)}><Icon className="size-3.5" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium"><span className="num">S{c.week}</span> · {c.rule}</span>
                    <span className="block text-[12px] text-muted-foreground">{c.note}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* ------------------------------------------- tâches et décisions */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          <Panel title={<>Tâches <span className="num ml-1 text-[13px] font-normal text-muted-foreground">{done.length}/{items.length}</span></>}>
            <form onSubmit={addTask} className="mb-2 flex gap-2"><input name="title" placeholder="Nouvelle tâche" aria-label="Nouvelle tâche" className={field} /></form>
            <ul className="divide-y divide-line">
              {[...todo, ...done].map((i) => (
                <li key={i.id} className="flex items-center gap-2.5 py-2">
                  <button type="button" onClick={() => toggleDone(i)} aria-label={i.done ? "Décocher" : "Cocher"} className={cn("grid size-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors duration-100", i.done ? "border-foreground bg-foreground text-background" : "border-line-strong hover:border-foreground")}>{i.done && <Check className="size-3" aria-hidden />}</button>
                  <button type="button" onClick={() => setOpenItem(i.id)} className={cn("min-w-0 flex-1 truncate text-left text-[13.5px]", i.done && "text-muted-foreground line-through")}>{i.title}</button>
                  <PersonAvatar who={i.owner} />
                </li>
              ))}
            </ul>
            {!items.length && <p className="text-[13px] text-muted-foreground">Aucune tâche pour cette app.</p>}
          </Panel>
          <Panel title="Décisions">
            <form onSubmit={addDecision} className="mb-2 flex gap-2"><input name="title" placeholder="Nouvelle décision" aria-label="Nouvelle décision" className={field} /></form>
            <ul className="divide-y divide-line">
              {decisions.map((d) => (
                <li key={d.id} className="flex items-baseline gap-3 py-2">
                  <span className="num shrink-0 text-[12px] text-muted-foreground">{shortDate(d.date)}</span>
                  <span className="min-w-0 flex-1 text-[13.5px]">{d.title}{d.why && <span className="block text-[12.5px] text-muted-foreground">{d.why}</span>}</span>
                </li>
              ))}
            </ul>
            {!decisions.length && <p className="text-[13px] text-muted-foreground">Aucune décision pour cette app.</p>}
          </Panel>
        </div>
      </div>
      {editing && <AppForm app={app} onClose={() => setEditing(false)} />}
    </div>
  );
}
