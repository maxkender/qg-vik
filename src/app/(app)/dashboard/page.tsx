"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleAlert, CircleCheck, CircleMinus, CircleX, Trash2 } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { Bars, Lines, Panel, type Serie } from "@/components/dashboard/charts";
import { Tick } from "@/components/planner/item-card";
import { useMe } from "@/components/session-provider";
import { checksStore, decisionsStore, metricsStore } from "@/lib/data";
import { isoDate } from "@/lib/dates";
import { big, change, eur, int, pct, shortDate, signedPct } from "@/lib/format";
import { newId, useRows } from "@/lib/store";
import type { MetricsCountry, MetricsPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const V = (n: number | "other") => `var(--viz-${n})`;

export default function DashboardPage() {
  const snapshots = useRows(metricsStore);
  const latest = useMemo(() => [...snapshots].sort((a, b) => b.as_of.localeCompare(a.as_of))[0], [snapshots]);

  if (!latest) {
    return (
      <>
        <ViewHeader title="Dashboard" />
        <p className="px-4 text-muted-foreground md:px-6">{metricsStore.loaded ? "Aucun chiffre pour l'instant." : "Les chiffres arrivent…"}</p>
      </>
    );
  }
  return <Dashboard m={latest.payload} asOf={latest.as_of} />;
}

function Dashboard({ m, asOf }: { m: MetricsPayload; asOf: string }) {
  const weeks = m.weeks ?? [];
  const full = weeks.filter((w) => !w.partial);
  const cur = full.at(-1);
  const prev = full.at(-2);
  const live = weeks.at(-1);
  const margin = cur ? cur.rev - cur.dep : null;
  const prevMargin = prev ? prev.rev - prev.dep : null;

  const weekData = weeks.map((w) => ({ ...w, viraux_pct: w.viraux * 100 }));

  // Dépenses par mois : les 5 plus gros postes, le reste en « Autres ».
  const { monthData, monthSeries } = useMemo(() => {
    const totals = new Map<string, number>();
    m.months.forEach((mo) => Object.entries(mo.postes).forEach(([k, v]) => totals.set(k, (totals.get(k) ?? 0) + v)));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const top = ranked.slice(0, 5);
    const rest = ranked.slice(5);
    const series: Serie[] = top.map((k, i) => ({ key: k, label: k, color: V(i + 1) }));
    if (rest.length) series.push({ key: "Autres", label: "Autres", color: V("other") });
    const data = m.months.map((mo) => {
      const row: Record<string, string | number> = { label: mo.label };
      top.forEach((k) => (row[k] = mo.postes[k] ?? 0));
      if (rest.length) row["Autres"] = rest.reduce((a, k) => a + (mo.postes[k] ?? 0), 0);
      return row;
    });
    return { monthData: data, monthSeries: series };
  }, [m.months]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader
        title="Dashboard"
        sub={
          <>
            Chiffres au <span className="num">{shortDate(asOf)}</span>
            {cur && <> · dernière semaine pleine : <span className="num">{cur.label}</span></>}
          </>
        }
      />
      <div className="flex flex-col gap-3 px-4 pb-16 md:px-6">
        {/* ------------------------------------------------------------ KPI */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-[1.35fr_repeat(3,1fr)]">
          <div className="glass col-span-2 flex flex-col justify-between rounded-2xl p-5 lg:col-span-1 lg:row-span-2">
            <p className="text-[12.5px] text-muted-foreground">Trésorerie Qonto</p>
            <div>
              <p className="font-heading text-[clamp(2.4rem,5vw,3.4rem)] leading-none font-extrabold tracking-[-0.03em]">{eur(live?.tresor)}</p>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                au <span className="num">{shortDate(asOf)}</span>
                {prev && cur && (
                  <>
                    {" "}· <span className="num">{eur(cur.tresor)}</span> fin {cur.label}
                  </>
                )}
              </p>
            </div>
          </div>
          <Kpi label={`Revenus ${cur?.label ?? ""}`} value={eur(cur?.rev)} delta={change(cur?.rev, prev?.rev)} />
          <Kpi label={`Dépenses ${cur?.label ?? ""}`} value={eur(cur?.dep)} delta={change(cur?.dep, prev?.dep)} inverse />
          <Kpi label={`Marge ${cur?.label ?? ""}`} value={eur(margin)} delta={change(margin, prevMargin)} />
          <Kpi label="Posts viraux" value={pct(cur?.viraux)} delta={change(cur?.viraux, prev?.viraux)} />
          <Kpi label="Comptes actifs" value={int(live?.actifs)} note={live?.label.replace("*", "") ? `${live.label.replace("*", "")} en cours` : undefined} />
          <Kpi
            label="Support résolu"
            value={pct(live?.support, 0)}
            note={live?.support != null && live.support < 0.5 ? "à surveiller" : undefined}
            warn={live?.support != null && live.support < 0.5}
          />
        </div>

        {/* ---------------------------------------------------------- Argent */}
        <SectionTitle>Argent</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Revenus et dépenses par semaine" caption="Revenus RevenueCat (bruts) · dépenses Qonto, sans les pubs Meta">
            <Bars
              label="Revenus et dépenses par semaine"
              data={weekData}
              x="label"
              format={big}
              series={[
                { key: "rev", label: "Revenus", color: V(3) },
                { key: "dep", label: "Dépenses", color: V(2) },
              ]}
            />
          </Panel>
          <Panel title="Revenus par app" caption="Chaque app a sa propre échelle : Sophia porte presque tout">
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["sophia", "Sophia", V(1)],
                  ["micabo", "Micabo", V(4)],
                  ["unswipe", "Unswipe", V(5)],
                ] as const
              ).map(([key, label, color]) => (
                <div key={key} className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
                    {label}
                  </p>
                  <p className="num mt-0.5 mb-1 text-[15px]">{eur(cur?.[key])}</p>
                  <Bars label={`Revenus ${label} par semaine`} data={weekData} x="label" format={big} height={150} series={[{ key, label, color }]} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="Dépenses par mois et par poste"
            caption={`Qonto · dernier mois jusqu'au ${shortDate(asOf)}`}
            action={
              <Link href="/depenses" className="inline-flex shrink-0 items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
                Détail par app <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            <Bars label="Dépenses par mois et par poste" data={monthData} x="label" format={big} stacked series={monthSeries} />
          </Panel>
          <Anomalies m={m} />
        </div>

        {/* ------------------------------------------------------- Contenu */}
        <SectionTitle>Contenu et posteurs</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="% de posts viraux" caption="Posts à 10 k vues ou plus">
            <Lines
              label="Pourcentage de posts viraux par semaine"
              data={weekData}
              x="label"
              format={(v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %"}
              series={[{ key: "viraux_pct", label: "Posts viraux", color: V(1) }]}
            />
          </Panel>
          <Panel title="Vues totales par semaine" caption="Tous les comptes, TikTok">
            <Bars label="Vues totales par semaine" data={weekData} x="label" format={big} series={[{ key: "vues", label: "Vues", color: V(3) }]} />
          </Panel>
          <Panel title="Comptes actifs, kills, doublés" caption="Kills le samedi, doublements le jeudi">
            <Lines label="Comptes actifs par semaine" data={weekData} x="label" format={int} height={104} series={[{ key: "actifs", label: "Comptes actifs", color: V(3) }]} />
            <div className="mt-3">
              <Bars
                label="Kills et doublements par semaine"
                data={weekData}
                x="label"
                format={int}
                height={92}
                series={[
                  { key: "kills", label: "Kills", color: V(2) },
                  { key: "doubles", label: "Doublés", color: V(4) },
                ]}
              />
            </div>
          </Panel>
        </div>

        <SectionTitle>Pays</SectionTitle>
        <Countries countries={m.countries ?? []} />

        <SectionTitle>Décisions</SectionTitle>
        <Decisions />

        {m.source && <p className="pt-2 text-[12px] text-faint">{m.source}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 mb-0.5 text-[20px] font-extrabold tracking-[-0.01em]">{children}</h2>;
}

function Kpi({
  label, value, delta, inverse, note, warn,
}: {
  label: string;
  value: string;
  delta?: number | null;
  /** Pour les dépenses : une hausse est une mauvaise nouvelle. */
  inverse?: boolean;
  note?: string;
  warn?: boolean;
}) {
  const flat = delta == null || Math.abs(delta) < 0.01;
  const good = !flat && (inverse ? delta! < 0 : delta! > 0);
  const Icon = flat ? null : delta! > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="glass flex min-w-0 flex-col gap-1 rounded-2xl p-4">
      <p className="truncate text-[12.5px] text-muted-foreground">{label}</p>
      <p className="font-heading text-[26px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums">{value}</p>
      {delta != null ? (
        <p className={cn("num inline-flex items-center gap-0.5 text-[11.5px]", flat ? "text-muted-foreground" : good ? "text-good" : "text-bad")}>
          {Icon && <Icon className="size-3.5" aria-hidden />}
          {signedPct(delta)} <span className="ml-1 font-sans text-faint">vs sem. préc.</span>
        </p>
      ) : (
        <p className={cn("inline-flex items-center gap-1 text-[11.5px]", warn ? "text-bad" : "text-faint")}>
          {warn && <CircleAlert className="size-3.5" aria-hidden />}
          {note ?? " "}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------- dépenses à vérifier
function Anomalies({ m }: { m: MetricsPayload }) {
  const me = useMe();
  const checks = useRows(checksStore);
  const ok = new Set(checks.filter((c) => c.ok).map((c) => c.anomaly_id));
  const list = m.anomalies ?? [];
  const left = list.filter((a) => !ok.has(a.id)).length;

  return (
    <Panel
      title="Dépenses à vérifier"
      caption={
        <>
          <span className="num">{left}</span> sur <span className="num">{list.length}</span> pas encore vérifiées · coche quand c&apos;est justifié
        </>
      }
    >
      <ul className="-my-1 divide-y divide-line">
        {list.map((a) => {
          const done = ok.has(a.id);
          return (
            <li key={a.id} className="flex items-start gap-3 py-2.5">
              <Tick
                checked={done}
                label={`${a.vendor} vérifié`}
                onChange={() =>
                  void checksStore.upsert({ anomaly_id: a.id, ok: !done, note: null, checked_by: me.id, checked_at: new Date().toISOString() })
                }
              />
              <div className={cn("min-w-0 flex-1 transition-opacity duration-100", done && "opacity-45")}>
                <p className="text-[13.5px] font-semibold">
                  {a.vendor} <span className="num ml-1 rounded-full bg-muted px-2 py-px text-[11px] font-medium text-muted-foreground">{a.mois}</span>
                </p>
                <p className="text-[12.5px] text-muted-foreground">{a.why}</p>
              </div>
              <span className={cn("num shrink-0 text-[13px]", done && "opacity-45")}>{eur(a.amount)}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// --------------------------------------------------------------------- pays
const VERDICT: Record<string, { tone: string; icon: typeof CircleCheck }> = {
  Recruter: { tone: "bg-good-soft text-good", icon: CircleCheck },
  Garder: { tone: "bg-info-soft text-info", icon: CircleMinus },
  "À corriger": { tone: "bg-warn-soft text-warn", icon: CircleAlert },
  Couper: { tone: "bg-bad-soft text-bad", icon: CircleX },
};

function Countries({ countries }: { countries: MetricsCountry[] }) {
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...countries].sort((a, b) => (b.eur_par_user ?? -1) - (a.eur_par_user ?? -1)), [countries]);
  const max = Math.max(...sorted.map((c) => c.eur_par_user ?? 0), 1);
  const shown = all ? sorted : sorted.slice(0, 12);

  return (
    <Panel caption="Moyenne par semaine sur les 4 dernières semaines pleines (Sophia). Trié par € par utilisateur : c'est là qu'est l'argent.">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-muted-foreground">
              {["Pays", "Zone", "Verdict", "€ / utilisateur"].map((h) => (
                <th key={h} className="border-b border-line px-2 py-1.5 font-medium">{h}</th>
              ))}
              {["Revenus / sem.", "Comptes", "Vues méd.", "Coût / sem."].map((h) => (
                <th key={h} className="border-b border-line px-2 py-1.5 text-right font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const v = VERDICT[c.verdict];
              const Icon = v?.icon;
              return (
                <tr key={c.code} className="border-b border-line last:border-0 hover:bg-glass">
                  <td className="px-2 py-2 font-medium">{c.pays}</td>
                  <td className="num px-2 py-2 text-muted-foreground">{c.zone}</td>
                  <td className="px-2 py-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", v?.tone ?? "bg-muted text-muted-foreground")}>
                      {Icon && <Icon className="size-3" aria-hidden />}
                      {c.verdict}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {c.eur_par_user ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${Math.round((c.eur_par_user / max) * 100)}%`, background: V(1) }} />
                        </div>
                        <span className="num text-[12px]">{eur(c.eur_par_user, 2)}</span>
                      </div>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                  <td className="num px-2 py-2 text-right">{eur(c.revenus_semaine)}</td>
                  <td className="num px-2 py-2 text-right">{int(c.comptes_actifs)}</td>
                  <td className="num px-2 py-2 text-right">{c.vues_mediane ? big(c.vues_mediane) : "–"}</td>
                  <td className="num px-2 py-2 text-right">{c.cout_semaine_usd != null ? `${int(c.cout_semaine_usd)} $` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > 12 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {all ? "Voir moins" : `Voir les ${sorted.length} pays`}
        </button>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- décisions
const DOMAINS = ["OS", "Recrutement", "Paie", "Contenu", "Apps", "Admin"];
const field = "h-9 min-w-0 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";

function Decisions() {
  const me = useMe();
  const rows = useRows(decisionsStore);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)), [rows]);

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim();
    if (!title) return;
    void decisionsStore.insert({
      id: newId(),
      date: isoDate(new Date()),
      title,
      why: String(f.get("why") ?? "").trim() || null,
      domain: String(f.get("domain") ?? "") || null,
      created_at: new Date().toISOString(),
      created_by: me.id,
    });
    e.currentTarget.reset();
  }

  return (
    <Panel>
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <input name="title" required placeholder="Nouvelle décision…" aria-label="Décision" className={cn(field, "flex-[2_1_240px]")} />
        <input name="why" placeholder="Pourquoi" aria-label="Pourquoi" className={cn(field, "flex-[2_1_240px]")} />
        <select name="domain" aria-label="Domaine" className={cn(field, "flex-none")} defaultValue="OS">
          {DOMAINS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-foreground px-4 text-[13.5px] font-semibold text-background">
          Ajouter
        </button>
      </form>
      {sorted.length === 0 && <p className="text-muted-foreground">Aucune décision pour l&apos;instant.</p>}
      <ul className="divide-y divide-line">
        {sorted.map((d) => (
          <li key={d.id} className="group grid grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-3 py-3">
            <span className="num pt-0.5 text-[12px] text-muted-foreground">{shortDate(d.date)}</span>
            <div className="min-w-0">
              <p className="font-semibold">{d.title}</p>
              {d.why && <p className="mt-0.5 text-[13px] text-muted-foreground">{d.why}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              {d.domain && <span className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">{d.domain}</span>}
              <button
                type="button"
                aria-label={`Supprimer la décision « ${d.title} »`}
                onClick={() => {
                  if (window.confirm("Supprimer cette décision ?")) void decisionsStore.remove(d.id);
                }}
                className="grid size-6 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
