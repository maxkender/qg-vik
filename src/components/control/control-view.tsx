"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { ViewHeader } from "@/components/app/shell";
import { useControl } from "@/components/control/use-control";
import { Panel } from "@/components/dashboard/charts";
import { attention, isOpen, readIssues, readPayroll, readRecruitment, unavailable, type ControlData, type Kind } from "@/lib/control/read";
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

function Recruitment({ payload }: { payload: unknown }) {
  const r = readRecruitment(payload);
  const max = Math.max(1, ...r.funnel.flatMap((s) => [s.count ?? 0, s.previous ?? 0]));
  const v = r.cohort.verdict ? VERDICT[r.cohort.verdict] : null;
  return (
    <>
      <Panel title="Prochaine cohorte">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {v ? <span className={cn("rounded-lg px-3 py-1.5 text-[14px] font-semibold", v.tone)}>{v.label}</span> : <span className="text-[13px] text-faint">verdict indisponible</span>}
          <p className="text-[14px]">{r.cohort.name ?? "Cohorte"}{r.cohort.start && <span className="text-muted-foreground"> · départ le <span className="num">{day(r.cohort.start)}</span></span>}</p>
          {r.cohort.pct !== null && <p className="num text-[24px] leading-none font-medium">{r.cohort.ready}<span className="text-[14px] text-muted-foreground"> / {r.cohort.target} prêts · {Math.round(r.cohort.pct * 100)} %</span></p>}
        </div>
        {r.cohort.pct !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", r.cohort.verdict === "vert" ? "bg-good" : r.cohort.verdict === "orange" ? "bg-warn" : "bg-bad")} style={{ width: `${Math.min(100, r.cohort.pct * 100)}%` }} /></div>}
      </Panel>
      <Panel title="Entonnoir" caption="Barre pleine : cette cohorte. Trait fin : la cohorte précédente.">
        {r.funnel.length ? (
          <ul className="space-y-2.5">
            {r.funnel.map((s) => (
              <li key={s.label} className="grid grid-cols-[minmax(90px,180px)_1fr_auto] items-center gap-3 text-[13px]">
                <span className="truncate">{s.label}</span>
                <span className="block">
                  <span className="block h-3 rounded-[4px] bg-foreground" style={{ width: `${((s.count ?? 0) / max) * 100}%`, minWidth: s.count ? 2 : 0 }} />
                  {s.previous !== null && <span className="mt-1 block h-[3px] rounded-full bg-line-strong" style={{ width: `${(s.previous / max) * 100}%` }} />}
                </span>
                <span className="num text-right">{n(s.count)}{s.previous !== null && <span className="text-muted-foreground"> · {s.previous.toLocaleString("fr-FR")}</span>}</span>
              </li>
            ))}
          </ul>
        ) : <None />}
      </Panel>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Panel title="Bloqués par étape">
          {r.blocked.length ? (
            <div className="overflow-x-auto"><table className="w-full border-collapse text-[13px]">
              <thead><tr className="border-b border-line"><th className={th}>Étape</th><th className={thNum}>Bloqués</th><th className={thNum}>Le plus ancien</th><th className={th}>Raison</th></tr></thead>
              <tbody>{r.blocked.map((b) => <tr key={b.label} className="border-b border-line last:border-0"><td className={cn(td, "font-medium")}>{b.label}</td><td className={tdNum}>{n(b.count)}</td><td className={tdNum}>{b.oldestDays === null ? n(null) : `${b.oldestDays} j`}</td><td className={cn(td, "text-muted-foreground")}>{b.reason}</td></tr>)}</tbody>
            </table></div>
          ) : <None />}
        </Panel>
        <Panel title="Santé des canaux">
          {r.channels.length ? (
            <ul className="divide-y divide-line">
              {r.channels.map((c) => (
                <li key={c.name} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className={cn("size-2 shrink-0 rounded-full", c.status === "ok" ? "bg-good" : c.status === "panne" ? "bg-bad" : c.status === "attention" ? "bg-warn" : "bg-line-strong")} aria-label={c.status ?? "état inconnu"} />
                  <span className="min-w-0 flex-1"><span className="block font-medium">{c.name}</span>{c.note && <span className="block text-[12.5px] text-muted-foreground">{c.note}</span>}</span>
                  <span className="num shrink-0 text-muted-foreground">{c.applicants !== null && `${c.applicants} candidats`}{c.hired !== null && ` · ${c.hired} recrutés`}</span>
                </li>
              ))}
            </ul>
          ) : <None />}
        </Panel>
      </div>
      <Panel title="Par pays et par HM">
        {r.byCountry.length ? (
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead><tr className="border-b border-line"><th className={th}>Pays</th><th className={th}>HM</th><th className={thNum}>Objectif</th><th className={thNum}>Prêts</th><th className={thNum}>En cours</th><th className={thNum}>Bloqués</th></tr></thead>
            <tbody>{r.byCountry.map((c, i) => <tr key={i} className="border-b border-line last:border-0"><td className={cn(td, "font-medium")}>{c.country ?? "–"}</td><td className={td}>{c.hm ?? "–"}</td><td className={tdNum}>{n(c.target)}</td><td className={cn(tdNum, c.target && c.ready !== null && (c.ready / c.target >= 0.8 ? "text-good" : c.ready / c.target < 0.5 ? "text-bad" : "text-warn"))}>{n(c.ready)}</td><td className={tdNum}>{n(c.inProgress)}</td><td className={tdNum}>{n(c.blocked)}</td></tr>)}</tbody>
          </table></div>
        ) : <None />}
      </Panel>
    </>
  );
}

const EVENT: Record<string, string> = { doublement: "bg-info-soft text-info", doubling: "bg-info-soft text-info", bonus: "bg-good-soft text-good", comment_masters: "bg-warn-soft text-warn" };
function Payroll({ payload }: { payload: unknown }) {
  const p = readPayroll(payload);
  const days = [...new Set(p.calendar.map((e) => e.date.slice(0, 10)))].sort();
  const c = p.check;
  return (
    <>
      {p.counters.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {p.counters.slice(0, 8).map((k) => <div key={k.label} className="glass min-w-0 rounded-2xl p-4"><p className="truncate text-[12.5px] text-muted-foreground first-letter:uppercase">{k.label}</p><p className="num mt-1.5 truncate text-[24px] leading-none font-medium">{k.value}</p></div>)}
        </div>
      )}
      <Panel title="Calendrier de la semaine">
        {days.length ? (
          <ol className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {days.map((d) => (
              <li key={d} className="rounded-xl border border-line px-3 py-2.5">
                <p className="num text-[12px] text-muted-foreground">{day(d)}</p>
                <ul className="mt-1.5 space-y-1">
                  {p.calendar.filter((e) => e.date.slice(0, 10) === d).map((e, i) => <li key={i} className={cn("rounded-md px-1.5 py-1 text-[12px] font-medium", EVENT[e.type.toLowerCase()] ?? "bg-muted text-muted-foreground")}>{e.label || e.type.replace(/_/g, " ")}{e.count !== null && <span className="num"> · {e.count}</span>}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        ) : <None />}
      </Panel>
      <Panel title="Vérification du lundi" caption={c?.week ? `Semaine ${c.week}` : undefined}>
        {c ? (
          <>
            <div className="flex flex-wrap gap-x-10 gap-y-2">
              {([["Attendu", c.expected, ""], ["Payé", c.paid, ""], ["Écart", c.gap, c.gap ? "text-bad" : c.gap === 0 ? "text-good" : ""]] as const).map(([label, value, tone]) => <div key={label}><p className="text-[12px] text-muted-foreground">{label}</p><p className={cn("num mt-1 text-[24px] leading-none font-medium", tone)}>{money(value, c.currency)}</p></div>)}
            </div>
            {c.lines.length > 0 && (
              <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-[13px]">
                <thead><tr className="border-b border-line"><th className={th}>Ligne</th><th className={thNum}>Attendu</th><th className={thNum}>Payé</th><th className={thNum}>Écart</th><th className={th}>Raison</th></tr></thead>
                <tbody>{c.lines.map((l, i) => <tr key={i} className="border-b border-line last:border-0"><td className={cn(td, "font-medium")}>{l.label}</td><td className={tdNum}>{money(l.expected, c.currency)}</td><td className={tdNum}>{money(l.paid, c.currency)}</td><td className={cn(tdNum, l.gap ? "font-medium text-bad" : "")}>{money(l.gap, c.currency)}</td><td className={cn(td, l.gap ? "text-bad" : "text-muted-foreground")}>{l.reason}</td></tr>)}</tbody>
              </table></div>
            )}
          </>
        ) : <None />}
      </Panel>
      <Panel title="Plaintes" caption="Chaque plainte, rapprochée de la fiche de paie.">
        {p.complaints.length ? (
          <ul className="divide-y divide-line">
            {p.complaints.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 basis-64"><span className="block font-medium">{x.poster ?? "Posteur inconnu"}{x.date && <span className="num ml-2 font-normal text-muted-foreground">{day(x.date)}</span>}</span><span className="block text-[12.5px] text-muted-foreground">{x.message}</span></span>
                <span className="num shrink-0 text-muted-foreground">attendu {money(x.expected, c?.currency ?? "USD")} · payé {money(x.paid, c?.currency ?? "USD")}</span>
                {x.verdict && <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-semibold">{x.verdict.replace(/_/g, " ")}</span>}
                {x.status && <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold", isOpen(x.status) ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>{x.status.replace(/_/g, " ")}</span>}
              </li>
            ))}
          </ul>
        ) : <None />}
      </Panel>
    </>
  );
}

const SEVERITY = { critique: "bg-bad-soft text-bad", haute: "bg-warn-soft text-warn", moyenne: "bg-info-soft text-info", basse: "bg-muted text-muted-foreground" };
function Issues({ payload, now }: { payload: unknown; now: number }) {
  const issues = readIssues(payload);
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast("Prompt copié"), () => toast.error("Impossible de copier"));
  return (
    <Panel>
      {issues.length ? (
        <ul className="divide-y divide-line">
          {issues.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
              <span className={cn("mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold capitalize", SEVERITY[i.severity])}>{i.severity}</span>
              <span className="min-w-0 flex-1 basis-64">
                <span className="block text-[13.5px] font-medium">{i.title}</span>
                {i.detail && <span className="block text-[12.5px] text-muted-foreground">{i.detail}</span>}
                <span className="mt-1 block text-[12px] text-muted-foreground">{[i.status?.replace(/_/g, " "), age(i.since, now) && `depuis ${age(i.since, now)}`].filter(Boolean).join(" · ")}</span>
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
  const body = (d: ControlData) => (tab === "recrutement" ? <Recruitment payload={d.recrutement.payload} /> : tab === "paie" ? <Payroll payload={d.paie.payload} /> : <Issues payload={d.problemes.payload} now={now} />);
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
        {data && down && data[tab].payload !== null && <><p className="text-[12.5px] text-muted-foreground">Dernier relevé connu :</p>{body(data)}</>}
      </div>
    </div>
  );
}
