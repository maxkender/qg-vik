"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { ViewHeader } from "@/components/app/shell";
import { useControl } from "@/components/control/use-control";
import { Panel } from "@/components/dashboard/charts";
import { CHANNEL_NAME, attention, stepLabel, unavailable, type Channel, type ControlData, type Issue, type Kind, type PayrollView, type RecruitmentView } from "@/lib/control/read";
import { cn } from "@/lib/utils";

const TABS: { key: Kind; label: string }[] = [{ key: "recrutement", label: "Recrutement" }, { key: "paie", label: "Paie" }, { key: "problemes", label: "Autres problèmes" }];
const th = "px-2.5 py-2 text-left text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-faint uppercase";
const thNum = cn(th, "text-right");
const td = "px-2.5 py-2";
const tdNum = cn(td, "num text-right whitespace-nowrap");
const n = (v: number | null) => (v === null ? <span className="text-faint">–</span> : v.toLocaleString("fr-FR"));
const money = (v: number | null, currency: string) => (v === null ? <span className="text-faint">–</span> : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency === "EUR" ? "€" : "$"}`);
const TONE = { bad: "bg-bad", warn: "bg-warn", good: "bg-good", none: "bg-line-strong" };
const VERDICT = { vert: { label: "Prête", tone: "bg-good-soft text-good" }, orange: { label: "À surveiller", tone: "bg-warn-soft text-warn" }, rouge: { label: "En danger", tone: "bg-bad-soft text-bad" } };
const day = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); };
const age = (iso: string | null, now: number) => { if (!iso) return null; const d = Math.floor((now - new Date(iso).getTime()) / 864e5); return Number.isNaN(d) ? null : d <= 0 ? "aujourd'hui" : `${d} j`; };

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}
const None = () => <p className="text-[13px] text-muted-foreground">Rien à afficher.</p>;

function Table({ title, head, rows, max = 10 }: { title: string; head: string; rows: RecruitmentView["channels"]["ruul"]["byCountry"]; max?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, max);
  const rate = (r: (typeof rows)[number]) => (r.recrues && r.premierPost !== null ? r.premierPost / r.recrues : null);
  return (
    <Panel title={title} action={rows.length > max ? <button type="button" onClick={() => setAll((v) => !v)} className="shrink-0 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">{all ? `Les ${max} premiers` : `Tous (${rows.length})`}</button> : undefined}>
      {rows.length ? (
        <div className="overflow-x-auto"><table className="w-full min-w-[460px] border-collapse text-[13px]">
          <thead><tr className="border-b border-line"><th className={th}>{head}</th><th className={thNum}>Recrues</th><th className={thNum}>Connectées</th><th className={thNum}>Warm-up</th><th className={thNum}>Ont posté</th><th className={thNum}>%</th></tr></thead>
          <tbody>{shown.map((r) => { const v = rate(r); return <tr key={r.key} className="border-b border-line last:border-0"><td className={cn(td, "font-medium")}>{r.key}</td><td className={tdNum}>{n(r.recrues)}</td><td className={tdNum}>{n(r.connexion)}</td><td className={tdNum}>{n(r.warmup)}</td><td className={tdNum}>{n(r.premierPost)}</td><td className={cn(tdNum, v !== null && (r.recrues ?? 0) >= 5 && (v >= 0.8 ? "text-good" : v < 0.5 ? "text-bad" : "text-warn"))}>{v === null ? n(null) : `${Math.round(v * 100)} %`}</td></tr>; })}</tbody>
        </table></div>
      ) : <None />}
    </Panel>
  );
}

function Recruitment({ r }: { r: RecruitmentView }) {
  const [channel, setChannel] = useState<Channel>("ruul");
  const c = r.channels[channel];
  const max = Math.max(1, ...c.funnel.flatMap((s) => [s.n ?? 0, s.previous ?? 0]));
  const v = r.verdict ? VERDICT[r.verdict] : null;
  const compared = c.funnel.some((s) => s.previous !== null);
  return (
    <>
      <Panel title={<>Cohorte du {r.cohort ? <span className="num">{day(r.cohort)}</span> : "?"}</>}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {v ? <span className={cn("rounded-lg px-3 py-1.5 text-[14px] font-semibold", v.tone)}>{v.label}</span> : <span className="rounded-lg bg-muted px-3 py-1.5 text-[13px] font-medium text-muted-foreground">Objectif non défini dans l&apos;OS</span>}
          <p className="num text-[24px] leading-none font-medium">{n(r.ready)}<span className="font-sans text-[14px] text-muted-foreground">{r.target ? <> / <span className="num">{r.target}</span> ont posté · <span className="num">{Math.round(r.pct! * 100)} %</span></> : " recrues ont posté"}</span></p>
          {r.stopped > 0 && <p className="text-[13px] text-muted-foreground"><span className="num">{r.stopped}</span> arrêtées ({r.stoppedReasons.map((x) => `${x.count} ${x.reason}`).join(", ")})</p>}
        </div>
        {r.pct !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", r.verdict === "vert" ? "bg-good" : r.verdict === "orange" ? "bg-warn" : "bg-bad")} style={{ width: `${Math.min(100, r.pct * 100)}%` }} /></div>}
      </Panel>
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-[10px] border border-line bg-glass p-[3px]" role="group" aria-label="Canal">
          {(Object.keys(CHANNEL_NAME) as Channel[]).map((k) => <button key={k} type="button" aria-pressed={channel === k} onClick={() => setChannel(k)} className={cn("h-[26px] rounded-[7px] px-3 text-[12.5px] font-medium transition-colors duration-100", channel === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{CHANNEL_NAME[k]}{r.channels[k].total !== null && <span className="num ml-1.5 opacity-70">{r.channels[k].total}</span>}</button>)}
        </div>
      </div>
      <Panel title="Entonnoir" caption={compared ? `Barre pleine : cette cohorte. Trait fin : celle du ${day(r.previousCohort!)}.` : `Pas de cohorte ${CHANNEL_NAME[channel]} la semaine d'avant.`}>
        {c.funnel.length ? (
          <ul className="space-y-2.5">
            {c.funnel.map((s) => (
              <li key={s.step} className="grid grid-cols-[minmax(96px,190px)_1fr_auto] items-center gap-3 text-[13px]">
                <span className="truncate">{stepLabel(s.step)}</span>
                <span className="block">
                  <span className="block h-3 rounded-[4px] bg-foreground" style={{ width: `${((s.n ?? 0) / max) * 100}%`, minWidth: s.n ? 2 : 0 }} />
                  {s.previous !== null && <span className="mt-1 block h-[3px] rounded-full bg-line-strong" style={{ width: `${(s.previous / max) * 100}%` }} />}
                </span>
                <span className="num min-w-12 text-right">{n(s.n)}{s.previous !== null && <span className="text-muted-foreground"> · {s.previous.toLocaleString("fr-FR")}</span>}</span>
              </li>
            ))}
          </ul>
        ) : <None />}
      </Panel>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Panel title="Bloqués par étape" caption="L'étape qui manque, et depuis quand la plus ancienne recrue est entrée.">
          {c.blocked.length ? (
            <div className="overflow-x-auto"><table className="w-full border-collapse text-[13px]">
              <thead><tr className="border-b border-line"><th className={th}>Étape manquante</th><th className={thNum}>Bloqués</th><th className={thNum}>Plus ancien</th></tr></thead>
              <tbody>{c.blocked.map((b) => <tr key={b.step} className="border-b border-line last:border-0" title={`${b.names.join(", ")}${b.count > b.names.length ? "…" : ""}`}><td className={cn(td, "font-medium")}>{stepLabel(b.step)}</td><td className={tdNum}>{n(b.count)}</td><td className={tdNum}>{b.oldestDays === null ? n(null) : `${b.oldestDays} j`}</td></tr>)}</tbody>
            </table></div>
          ) : <None />}
        </Panel>
        <Panel title="Santé des canaux">
          {r.health.length ? (
            <ul className="divide-y divide-line">
              {r.health.map((h) => (
                <li key={h.name} className="flex items-start gap-3 py-2.5 text-[13px]">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", h.tone === "ok" ? "bg-good" : h.tone === "panne" ? "bg-bad" : "bg-warn")} aria-label={h.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium first-letter:uppercase">{h.name}</span>
                    {h.note && <span className={cn("block text-[12.5px]", h.tone === "ok" ? "text-muted-foreground" : h.tone === "panne" ? "text-bad" : "text-warn")}>{h.note}</span>}
                    {h.facts.length > 0 && <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{h.facts.map((f) => <span key={f.label} className="mr-3 inline-block"><span className="num text-foreground">{f.value}</span> {f.label}</span>)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <None />}
        </Panel>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Table title="Par pays" head="Pays" rows={c.byCountry} />
        <Table title="Par HM" head="HM" rows={c.byHm} />
      </div>
    </>
  );
}

function Payroll({ p }: { p: PayrollView }) {
  const [allGaps, setAllGaps] = useState(false);
  const [allComplaints, setAllComplaints] = useState(false);
  const t = p.totals;
  const unit = p.currency === "EUR" ? "€" : "$";
  const open = p.complaints.filter((c) => c.open);
  const complaints = allComplaints ? p.complaints : open;
  const chips: [string, string][] = [
    ["Doublements", String(p.included.doublements)], ["Bonus", `${p.included.bonus.count}${p.included.bonus.count ? ` · ${p.included.bonus.total.toLocaleString("fr-FR")} ${unit}` : ""}`],
    ["Comment Masters", `${p.included.commentMasters.count}${p.included.commentMasters.count ? ` · ${p.included.commentMasters.total.toLocaleString("fr-FR")} ${unit}` : ""}`],
    ["Kills", String(p.included.kills)], ["À vérifier", String(p.included.toCheck)],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["Posteurs dans la paie", t.posters, ""], ["Avec un écart", t.withGap, t.withGap ? "text-bad" : ""], ["Plaintes ouvertes", open.length, open.length ? "text-warn" : ""], ["Plaintes sur 7 jours", p.complaints.length, ""]] as const).map(([label, value, tone]) => (
          <div key={label} className="glass min-w-0 rounded-2xl p-4"><p className="truncate text-[12.5px] text-muted-foreground">{label}</p><p className={cn("num mt-1.5 truncate text-[24px] leading-none font-medium", tone)}>{n(value)}</p></div>
        ))}
      </div>
      <Panel title={<>Paie du {p.paidOn ? <span className="num">{day(p.paidOn)}</span> : "lundi"}</>} caption={p.week ? `Pour la semaine du ${day(p.week)}. Ce qu'elle contient :` : undefined}>
        <ul className="flex flex-wrap gap-2">
          {chips.map(([label, value]) => <li key={label} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px]"><span className="text-muted-foreground">{label}</span><span className="num font-medium">{value}</span></li>)}
        </ul>
      </Panel>
      <Panel title="Vérification du lundi" action={p.gaps.length > 8 ? <button type="button" onClick={() => setAllGaps((v) => !v)} className="shrink-0 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">{allGaps ? "Les 8 plus gros" : `Tous les écarts (${p.gaps.length})`}</button> : undefined}>
        <div className="flex flex-wrap gap-x-10 gap-y-2">
          {([["Attendu", t.expected, ""], ["Payé", t.paid, ""], ["Écart", t.gap, t.gap ? "text-bad" : t.gap === 0 ? "text-good" : ""]] as const).map(([label, value, tone]) => <div key={label}><p className="text-[12px] text-muted-foreground">{label}</p><p className={cn("num mt-1 text-[24px] leading-none font-medium", tone)}>{money(value, p.currency)}</p></div>)}
        </div>
        {p.gaps.length > 0 && (
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-[13px]">
            <thead><tr className="border-b border-line"><th className={th}>Posteur</th><th className={th}>Canal</th><th className={thNum}>Attendu</th><th className={thNum}>Payé</th><th className={thNum}>Écart</th><th className={th}>Raison</th></tr></thead>
            <tbody>{(allGaps ? p.gaps : p.gaps.slice(0, 8)).map((l, i) => <tr key={i} className="border-b border-line last:border-0"><td className={cn(td, "font-medium whitespace-nowrap")}>{l.name}{l.country && <span className="num ml-2 font-normal text-muted-foreground">{l.country}</span>}</td><td className={cn(td, "capitalize")}>{l.channel}</td><td className={tdNum}>{money(l.expected, p.currency)}</td><td className={tdNum}>{money(l.paid, p.currency)}</td><td className={cn(tdNum, "font-medium text-bad")}>{l.gap > 0 ? "+" : "−"}{money(Math.abs(l.gap), p.currency)}</td><td className={cn(td, "text-bad")}>{l.reason ?? (l.gap > 0 ? "Payé en trop, sans raison donnée par l'OS" : "Payé en moins, sans raison donnée par l'OS")}</td></tr>)}</tbody>
          </table></div>
        )}
      </Panel>
      <Panel title="Plaintes" caption="Chaque plainte, à côté de la fiche de paie de la semaine." action={p.complaints.length > open.length ? <button type="button" onClick={() => setAllComplaints((v) => !v)} className="shrink-0 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">{allComplaints ? "Les ouvertes" : `Toutes (${p.complaints.length})`}</button> : undefined}>
        {complaints.length ? (
          <ul className="divide-y divide-line">
            {complaints.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 basis-72"><span className="block font-medium">{x.name ?? "Posteur inconnu"}{x.date && <span className="num ml-2 font-normal text-muted-foreground">{day(x.date)}</span>}{x.category && <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{x.category}</span>}</span><span className="block text-[12.5px] text-muted-foreground">{x.text}</span></span>
                <span className={cn("num shrink-0", x.gap ? "text-bad" : "text-muted-foreground")}>{x.expected === null ? "fiche introuvable" : <>attendu {money(x.expected, p.currency)} · payé {money(x.paid, p.currency)}{x.gap ? <> · écart {money(x.gap, p.currency)}</> : " · fiche juste"}</>}</span>
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold", x.open ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>{!x.open ? "résolue" : x.status === "bot" ? "chez le bot" : `ouverte${x.level && x.level !== "bot" ? ` · chez ${x.level === "max" ? "Max" : x.level === "adrien" ? "Adrien" : x.level}` : ""}`}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted-foreground">Aucune plainte ouverte.</p>}
      </Panel>
    </>
  );
}

const SEVERITY = { critique: "bg-bad-soft text-bad", haute: "bg-warn-soft text-warn", moyenne: "bg-info-soft text-info", basse: "bg-muted text-muted-foreground" };
function Issues({ issues, now }: { issues: Issue[]; now: number }) {
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast("Prompt copié"), () => toast.error("Impossible de copier"));
  return (
    <Panel>
      {issues.length ? (
        <ul className="divide-y divide-line">
          {issues.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
              <span className={cn("mt-0.5 w-[68px] shrink-0 rounded-md py-0.5 text-center text-[11.5px] font-semibold capitalize", SEVERITY[i.severity])}>{i.severity}</span>
              <span className="min-w-0 flex-1 basis-64">
                <span className="block text-[13.5px] font-medium">{i.title}</span>
                {i.detail && <span className="block text-[12.5px] text-muted-foreground">{i.detail}</span>}
                <span className="mt-1 block text-[12px] text-muted-foreground">{[i.status, age(i.since, now) && (age(i.since, now) === "aujourd'hui" ? "aujourd'hui" : `depuis ${age(i.since, now)}`)].filter(Boolean).join(" · ")}</span>
              </span>
              <button type="button" onClick={() => copy(i.prompt)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] font-medium transition-colors duration-100 hover:border-line-strong"><Copy className="size-3.5" aria-hidden /> Copier le prompt pour l&apos;OS</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13px] text-muted-foreground">Aucun problème ouvert.</p>}
    </Panel>
  );
}

export function ControlView() {
  const router = useRouter();
  const asked = useSearchParams().get("onglet");
  const tab = TABS.find((t) => t.key === asked)?.key ?? "recrutement";
  const [now] = useState(() => Date.now());
  const { data, failed } = useControl();
  const summary = data ? attention(data, now) : null;
  const down = data ? unavailable(data[tab], now) : null;
  const body = (d: ControlData) => (tab === "recrutement" ? d.recrutement.view && <Recruitment r={d.recrutement.view} /> : tab === "paie" ? d.paie.view && <Payroll p={d.paie.view} /> : d.problemes.view && <Issues issues={d.problemes.view} now={now} />);
  const fetched = data?.[tab].fetchedAt;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Control" eyebrow={fetched ? <>relevé du <span className="num">{new Date(fetched).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(" ", " à ")}</span></> : undefined}>
        <div className="flex items-center rounded-[10px] border border-line bg-glass p-[3px]" role="tablist">
          {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => router.replace(`/control?onglet=${t.key}`)} className={cn("h-[26px] rounded-[7px] px-2.5 text-[12.5px] font-medium transition-colors duration-100", tab === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{t.label}</button>)}
        </div>
      </ViewHeader>
      <div className="flex min-w-0 flex-col gap-3 px-4 pb-24 md:px-6 [&>*]:min-w-0">
        {failed && !data && <p className="text-[14px] text-bad">Impossible de charger Control.</p>}
        {summary && (
          <section className="glass-strong rounded-2xl p-4 sm:p-5">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Ce qui demande ton attention aujourd&apos;hui</h2>
            <ul className="mt-2 space-y-1.5">
              {summary.lines.map((l) => <li key={l.text} className="flex items-start gap-2.5 text-[15px] leading-snug"><span className={cn("mt-[7px] size-2 shrink-0 rounded-full", TONE[l.tone])} aria-hidden />{l.text}</li>)}
            </ul>
          </section>
        )}
        {data && (down ? <Empty>{down.charAt(0).toUpperCase() + down.slice(1)}.</Empty> : body(data))}
        {data && down && data[tab].view !== null && <><p className="text-[12.5px] text-muted-foreground">Dernier relevé connu :</p>{body(data)}</>}
      </div>
    </div>
  );
}
