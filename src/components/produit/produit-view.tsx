"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewHeader } from "@/components/app/shell";
import { AppLogo, NA, useApi } from "@/components/apps/shared";
import { Lines, Panel } from "@/components/dashboard/charts";
import { appsStore } from "@/lib/data";
import { int, pct, shortDate } from "@/lib/format";
import { RETENTION_DAYS, type Product, type ProductResponse, type Question, type RetentionKey } from "@/lib/product/types";
import { useRows } from "@/lib/store";
import { cn } from "@/lib/utils";

const PERIODS = [7, 14, 28];
const th = "px-2.5 py-2 text-left text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-faint uppercase";
const thNum = cn(th, "text-right");
const td = "px-2.5 py-1.5 whitespace-nowrap";
const tdNum = cn(td, "num text-right");
const ratio = (a: number | null, b: number | null) => (a === null || !b ? null : a / b);
/** « social_proof », « trialNotif » → « Social proof », « Trial notif ». */
const human = (key: string) => {
  const s = key.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function Kpi({ title, value, detail }: { title: string; value: string | null; detail?: string | null }) {
  return (
    <div className="glass min-w-0 rounded-2xl p-4">
      <p className="truncate text-[12.5px] text-muted-foreground">{title}</p>
      {value === null ? <p className="mt-2.5 text-[12.5px] text-faint">{NA}</p> : <p className="num mt-1.5 truncate text-[24px] leading-none font-medium tracking-[-0.02em]">{value}</p>}
      {value !== null && detail && <p className="num mt-2 truncate text-[11.5px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}

/** Une ligne par écran : la part des personnes qui l'ont vu, et la perte par rapport à l'écran d'avant quand elle dépasse 3 %. */
function Funnel({ p }: { p: Product }) {
  const { steps, started } = p.onboarding;
  if (!steps.length || !started) return <Empty>Aucun onboarding sur la période.</Empty>;
  // Un écran que tout le monde ne voit pas (une seule plateforme, un test) : plus de monde le dépasse qu'il n'en reçoit.
  const partials = steps.map((s, i) => steps.slice(i + 1).some((x) => x.users > s.users * 1.1));
  return (
    <ol className="flex flex-col gap-[3px]">
      {steps.map((s, i) => {
        const share = s.users / started;
        const partial = partials[i];
        const before = steps.slice(0, i).filter((_, j) => !partials[j]).at(-1);
        const drop = !partial && before && s.users < before.users ? (before.users - s.users) / before.users : 0;
        return (
          <li key={s.key} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_3.6rem_3.2rem_3.4rem] items-center gap-2 text-[12.5px]">
            <span className="truncate" title={s.key}><span className="num mr-1.5 text-[10.5px] text-faint">{String(i + 1).padStart(2, "0")}</span>{human(s.key)}</span>
            <span className="h-[14px] overflow-hidden rounded-[4px] bg-muted" aria-hidden>
              <span className={cn("block h-full rounded-[4px]", partial ? "bg-foreground/30" : "bg-foreground/75")} style={{ width: `${Math.min(100, share * 100)}%` }} />
            </span>
            <span className="num text-right text-muted-foreground">{int(s.users)}</span>
            <span className="num text-right">{pct(share, 0)}</span>
            <span className={cn("num text-right text-[11.5px]", drop >= 0.1 ? "font-semibold text-bad" : "text-muted-foreground")}>{partial ? <span className="font-sans text-faint">partiel</span> : drop >= 0.03 ? `−${pct(drop, 0)}` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

function QuestionCard({ q }: { q: Question }) {
  const max = Math.max(...q.options.map((o) => o.users), 1);
  return (
    <Panel title={human(q.key)} caption={`${int(q.answered)} réponses${q.multi ? " · plusieurs choix" : ""}`}>
      <ul className="flex flex-col gap-1.5">
        {q.options.map((o) => (
          <li key={o.value} className="text-[12.5px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate" title={o.value}>{o.value === "true" ? "Oui" : o.value === "false" ? "Non" : o.value || "(vide)"}</span>
              <span className="num shrink-0 text-muted-foreground">{pct(q.answered ? o.users / q.answered : null, 0)}</span>
            </div>
            <span className="mt-1 block h-[5px] overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${(o.users / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Cohorts({ p }: { p: Product }) {
  const { cohorts, rates } = p.retention;
  if (!cohorts.length) return <Empty>Pas encore de cohorte à suivre.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={th}>Arrivés le</th>
            <th className={thNum}>{p.unit === "installs" ? "Installs" : "Appareils"}</th>
            {RETENTION_DAYS.map((n) => <th key={n} className={thNum}>J{n}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line font-semibold">
            <td className={td}>Moyenne</td>
            <td className={tdNum}>{int(cohorts.reduce((a, c) => a + c.size, 0))}</td>
            {RETENTION_DAYS.map((n) => <td key={n} className={tdNum}>{pct(rates[`d${n}` as RetentionKey], 0)}</td>)}
          </tr>
          {cohorts.slice(0, 21).map((c) => (
            <tr key={c.day} className="border-b border-line/60 last:border-0">
              <td className={cn(td, "num")}>{shortDate(c.day)}</td>
              <td className={tdNum}>{int(c.size)}</td>
              {RETENTION_DAYS.map((n) => <Rate key={n} value={ratio(c[`d${n}` as RetentionKey], c.size)} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
/** Une case de cohorte : plus le taux est haut, plus le vert est soutenu. Un tiret tant que J+n n'est pas passé. */
function Rate({ value }: { value: number | null }) {
  if (value === null) return <td className={cn(tdNum, "text-faint")}>–</td>;
  return <td className={tdNum} style={{ background: `color-mix(in srgb, var(--good) ${Math.round(Math.min(value, 0.6) * 70)}%, transparent)` }}>{pct(value, 0)}</td>;
}

function Paywalls({ p }: { p: Product }) {
  const { rows } = p.paywall;
  if (!p.paywall.viewers) return <Empty>Aucun paywall affiché sur la période.</Empty>;
  const detailed = rows.some((r) => r.buyers > 0 || r.started > 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className={th}>Paywall</th>
            <th className={thNum}>Vus par</th>
            {detailed && <><th className={thNum}>Achats lancés</th><th className={thNum}>Acheteurs</th><th className={thNum}>Conversion</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r) => (
            <tr key={r.id} className="border-b border-line/60 last:border-0">
              <td className={cn(td, "max-w-[14rem] truncate")} title={r.id}>{human(r.id)}</td>
              <td className={tdNum}>{int(r.viewers)}</td>
              {detailed && <><td className={tdNum}>{int(r.started)}</td><td className={tdNum}>{int(r.buyers)}</td><td className={tdNum}>{pct(ratio(r.buyers, r.viewers))}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Report({ p }: { p: Product }) {
  const o = p.onboarding;
  const who = p.unit === "installs" ? "installs" : "appareils";
  const daily = o.daily.map((d) => ({ day: shortDate(d.day), taux: d.started ? Math.round(((d.completed ?? 0) / d.started) * 1000) / 10 : null, partial: d.day === p.to }));
  return (
    <div className="flex flex-col gap-3 px-4 pb-24 md:px-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi title="Onboardings démarrés" value={int(o.started)} detail={`${who}, ${p.days} jours`} />
        <Kpi title="Onboarding terminé" value={o.started ? pct(ratio(o.completed, o.started), 1) : null} detail={o.completed === null ? null : `${int(o.completed)} sur ${int(o.started)}`} />
        <Kpi title="Rétention J1" value={p.retention.rates.d1 === null ? null : pct(p.retention.rates.d1, 1)} />
        <Kpi title="Rétention J7" value={p.retention.rates.d7 === null ? null : pct(p.retention.rates.d7, 1)} />
        <Kpi title="Conversion paywall" value={p.paywall.viewers ? pct(ratio(p.paywall.buyers, p.paywall.viewers), 1) : null} detail={`${int(p.paywall.buyers)} acheteurs`} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title="Entonnoir d'onboarding" caption="Part des personnes qui ont vu chaque écran, et perte depuis l'écran d'avant">
          <Funnel p={p} />
        </Panel>
        <div className="flex min-w-0 flex-col gap-3">
          <Panel title="Onboarding terminé, par jour" caption="Le dernier jour est en cours">
            <Lines data={daily} x="day" series={[{ key: "taux", label: "Terminé", color: "var(--viz-1)" }]} format={(v) => `${v.toLocaleString("fr-FR")} %`} height={200} label="Part des onboardings terminés, par jour" />
          </Panel>
          <Panel title="Rétention par cohorte" caption={p.unit === "installs" ? "Part des installs revenus dans l'app à J+n" : "Part des appareils qui ont rouvert l'app à J+n"}>
            <Cohorts p={p} />
          </Panel>
          <Panel title="Paywalls" caption={`${int(p.paywall.viewers)} vues uniques, ${int(p.paywall.started)} achats lancés, ${int(p.paywall.buyers)} acheteurs`}>
            <Paywalls p={p} />
          </Panel>
        </div>
      </div>

      {p.questions.length > 0 && (
        <>
          <h2 className="mt-3 px-1 text-[15px] font-semibold">Réponses de l&apos;onboarding</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {p.questions.map((q) => <QuestionCard key={q.key} q={q} />)}
          </div>
        </>
      )}
    </div>
  );
}

export function ProduitView() {
  const router = useRouter();
  const params = useSearchParams();
  const all = useRows(appsStore);
  const apps = useMemo(() => all.filter((a) => a.active).sort((a, b) => a.sort_order - b.sort_order), [all]);
  const slug = params.get("app") ?? apps[0]?.slug ?? "sophia";
  const days = PERIODS.includes(Number(params.get("jours"))) ? Number(params.get("jours")) : PERIODS[0];
  const go = (next: { app?: string; jours?: number }) => router.replace(`/produit?app=${next.app ?? slug}&jours=${next.jours ?? days}`);
  const { data, error } = useApi<ProductResponse>(`/api/produit?app=${slug}&days=${days}`);
  const updated = data?.connected && data.updated_at ? new Date(data.updated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Produit" sub={updated ? `Dernière donnée reçue à ${updated}` : undefined}>
        <div role="group" aria-label="Période" className="flex rounded-[10px] border border-line bg-glass p-[3px]">
          {PERIODS.map((n) => (
            <button key={n} type="button" aria-pressed={days === n} onClick={() => go({ jours: n })} className={cn("num h-7 rounded-[7px] px-2.5 text-[12.5px] font-medium transition-colors duration-100", days === n ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {n} j
            </button>
          ))}
        </div>
      </ViewHeader>

      <div role="tablist" aria-label="App" className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:px-6">
        {apps.map((a) => (
          <button key={a.slug} type="button" role="tab" aria-selected={slug === a.slug} onClick={() => go({ app: a.slug })} className={cn("inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-2.5 text-[13px] font-medium transition-colors duration-100", slug === a.slug ? "border-line-strong bg-glass-strong text-foreground" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <AppLogo app={a} size={20} />
            {a.name}
          </button>
        ))}
      </div>

      {error && <p className="px-6 text-[14px] text-bad">{error}</p>}
      {!data && !error && <div className="mx-4 h-40 animate-pulse rounded-2xl bg-muted md:mx-6" aria-hidden />}
      {data && !data.connected && <div className="px-4 md:px-6"><Empty>{data.reason}</Empty></div>}
      {data?.connected && <Report p={data} />}
    </div>
  );
}
