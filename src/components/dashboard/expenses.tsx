"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeftRight, HelpCircle, Sparkles, Trash2, TrendingUp, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Bars, Panel, type Serie } from "@/components/dashboard/charts";
import { Src } from "@/components/dashboard/sync-bar";
import type { Dash } from "@/components/dashboard/use-dash";
import { Tick } from "@/components/planner/item-card";
import { useMe } from "@/components/session-provider";
import { flagsStore, qontoTxStore, vendorRulesStore } from "@/lib/data";
import { debitsIn, total, type Period } from "@/lib/dash";
import { MONTHS_SHORT, cap } from "@/lib/dates";
import { big, eur, shortDate } from "@/lib/format";
import { POSTES, matchRule, type VendorRule } from "@/lib/postes";
import { newId, useRows } from "@/lib/store";
import type { ExpenseFlag, QontoTx } from "@/lib/types";
import { cn } from "@/lib/utils";

const POSTE_COLOR: Record<string, string> = {
  Posteurs: "var(--viz-1)", "Contenu & IA": "var(--viz-3)", "Outils & abonnements": "var(--viz-4)", "Admin & compta": "var(--viz-5)",
  "Déplacements & repas": "var(--viz-6)", Transferts: "var(--viz-2)",
};
const field = "h-9 min-w-0 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";
const cellSelect = "h-7 max-w-full rounded-md border border-transparent bg-transparent px-1 text-[12.5px] outline-none transition-colors duration-100 hover:border-line focus:border-line-strong";

/** Dépenses par mois et par poste (barres empilées), sur tout l'historique connu. */
export function MonthlyByPoste({ dash }: { dash: Dash }) {
  const { data, series } = useMemo(() => {
    const debits = dash.tx.filter((t) => t.side === "debit");
    const months = [...new Set(debits.map((t) => t.date.slice(0, 7)))].sort().slice(-8);
    const totals = new Map<string, number>();
    debits.forEach((t) => totals.set(t.poste, (totals.get(t.poste) ?? 0) + Number(t.amount)));
    // Les 5 plus gros postes ont leur couleur ; le reste est regroupé.
    const main = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).filter((p) => POSTE_COLOR[p]).slice(0, 5);
    const s: Serie[] = main.map((p) => ({ key: p, label: p, color: POSTE_COLOR[p] }));
    if (totals.size > main.length) s.push({ key: "Autres postes", label: "Autres postes", color: "var(--viz-other)" });
    const rows = months.map((m) => {
      const row: Record<string, string | number> = { label: cap(MONTHS_SHORT[Number(m.slice(5, 7)) - 1]) };
      const inMonth = debits.filter((t) => t.date.startsWith(m));
      main.forEach((p) => (row[p] = Math.round(total(inMonth.filter((t) => t.poste === p)))));
      row["Autres postes"] = Math.round(total(inMonth.filter((t) => !main.includes(t.poste))));
      return row;
    });
    return { data: rows, series: s };
  }, [dash.tx]);
  return (
    <Panel title="Dépenses par mois et par poste" caption="Qonto, tous les mois connus" action={<Src s={dash.sources.qonto} seedDate={dash.seedDate} />}>
      {data.length ? <Bars label="Dépenses par mois et par poste" data={data} x="label" format={big} stacked series={series} height={250} /> : <p className="text-muted-foreground">Pas encore de données.</p>}
    </Panel>
  );
}

/** Les 10 plus gros fournisseurs de la période. */
export function TopVendors({ dash, period, app }: { dash: Dash; period: Period; app: string }) {
  const rows = useMemo(() => {
    const map = new Map<string, { total: number; n: number; poste: string }>();
    debitsIn(dash.tx, period, app).forEach((t) => {
      const v = map.get(t.counterparty) ?? { total: 0, n: 0, poste: t.poste };
      v.total += Number(t.amount);
      v.n++;
      map.set(t.counterparty, v);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  }, [dash.tx, period, app]);
  const max = Math.max(...rows.map(([, v]) => v.total), 1);
  return (
    <Panel title="Top 10 des fournisseurs" caption="Sur la période choisie" action={<Src s={dash.sources.qonto} seedDate={dash.seedDate} />}>
      {!dash.live.qonto ? (
        <p className="text-[13.5px] text-muted-foreground">Disponible dès la première synchro Qonto. Pour l&apos;instant on n&apos;a que les totaux par poste du {dash.seedDate ? shortDate(dash.seedDate) : "seed"}.</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">Aucune dépense sur cette période.</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {rows.map(([name, v]) => (
            <li key={name} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate">
                  {name} <span className="ml-1 text-[11.5px] text-faint">{v.poste} · ×{v.n}</span>
                </span>
                <span className="num shrink-0">{eur(v.total)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(v.total / max) * 100}%`, background: POSTE_COLOR[v.poste] ?? "var(--viz-other)" }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const FLAG_ICON = { new_vendor: Sparkles, unknown_vendor: HelpCircle, spike: TrendingUp, big_transfer: ArrowLeftRight };
const FLAG_LABEL = { new_vendor: "Nouveau", unknown_vendor: "Inconnu", spike: "Hausse", big_transfer: "Virement" };

/** Ce que la synchro Qonto a repéré : à cocher « vérifié », avec un commentaire. */
export function Flags({ dash }: { dash: Dash }) {
  const me = useMe();
  const [showDone, setShowDone] = useState(false);
  const [kind, setKind] = useState<ExpenseFlag["kind"] | "all">("all");
  const [limit, setLimit] = useState(12);
  const all = useMemo(() => [...dash.flags].sort((a, b) => Number(a.checked) - Number(b.checked) || Number(b.amount ?? 0) - Number(a.amount ?? 0)), [dash.flags]);
  const left = all.filter((f) => !f.checked).length;
  const shown = all.filter((f) => (showDone || !f.checked) && (kind === "all" || f.kind === kind));

  return (
    <Panel
      title="À vérifier"
      caption={
        dash.live.qonto ? (
          <><span className="num">{left}</span> sur <span className="num">{all.length}</span> pas encore vérifiées : nouveau fournisseur, fournisseur inconnu, hausse de plus de 50 %, virement de plus de 1 000 €</>
        ) : (
          "Les anomalies seront repérées automatiquement à la première synchro Qonto."
        )
      }
      action={
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Type d'anomalie" className={cn(field, "h-8 shrink-0")}>
          <option value="all">Tout</option>
          {(Object.keys(FLAG_LABEL) as ExpenseFlag["kind"][]).map((k) => (
            <option key={k} value={k}>{FLAG_LABEL[k]}</option>
          ))}
        </select>
      }
    >
      {dash.live.qonto && shown.length === 0 && <p className="text-[13.5px] text-muted-foreground">{left === 0 && all.length ? "Tout est vérifié." : "Rien à signaler."}</p>}
      <ul className="-my-1 divide-y divide-line">
        {shown.slice(0, limit).map((f) => {
          const Icon = FLAG_ICON[f.kind];
          return (
            <li key={f.id} className="flex items-start gap-3 py-2.5">
              <Tick
                checked={f.checked}
                label={`${f.title} : vérifié`}
                onChange={() => void flagsStore.update(f.id, { checked: !f.checked, checked_by: f.checked ? null : me.id, checked_at: f.checked ? null : new Date().toISOString() })}
              />
              <div className={cn("min-w-0 flex-1", f.checked && "opacity-50")}>
                <p className="flex flex-wrap items-center gap-x-2 text-[13.5px] font-semibold">
                  <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-px text-[11px] font-semibold text-warn">
                    <Icon className="size-3" aria-hidden /> {FLAG_LABEL[f.kind]}
                  </span>
                  {f.title}
                </p>
                {f.detail && <p className="text-[12.5px] text-muted-foreground">{f.detail}</p>}
                <input
                  key={f.comment ?? ""}
                  defaultValue={f.comment ?? ""}
                  placeholder="Commentaire…"
                  aria-label={`Commentaire sur ${f.title}`}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (v !== (f.comment ?? "")) void flagsStore.update(f.id, { comment: v || null });
                  }}
                  className="mt-1 h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] outline-none transition-colors duration-100 placeholder:text-faint hover:border-line focus:border-line-strong focus:bg-glass"
                />
              </div>
              {f.amount !== null && <span className={cn("num shrink-0 text-[13px]", f.checked && "opacity-50")}>{eur(Number(f.amount))}</span>}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-4 text-[12.5px] text-muted-foreground">
        {shown.length > limit && <button type="button" onClick={() => setLimit((l) => l + 30)} className="underline underline-offset-4 hover:text-foreground">Voir plus ({shown.length - limit})</button>}
        {all.some((f) => f.checked) && <button type="button" onClick={() => setShowDone((v) => !v)} className="underline underline-offset-4 hover:text-foreground">{showDone ? "Masquer les vérifiées" : "Voir les vérifiées"}</button>}
      </div>
    </Panel>
  );
}

/** Détail des transactions de la période, filtrable. Changer le poste d'une ligne le verrouille. */
export function Transactions({ dash, period, app }: { dash: Dash; period: Period; app: string }) {
  const [q, setQ] = useState("");
  const [poste, setPoste] = useState("all");
  const [limit, setLimit] = useState(25);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return debitsIn(dash.tx, period, app)
      .filter((t) => (poste === "all" || t.poste === poste) && (!needle || `${t.counterparty} ${t.label ?? ""} ${t.reference ?? ""}`.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date) || Number(b.amount) - Number(a.amount));
  }, [dash.tx, period, app, q, poste]);

  return (
    <Panel
      title="Détail des transactions"
      caption={<><span className="num">{rows.length}</span> opérations · <span className="num">{eur(total(rows))}</span> net des remboursements</>}
      action={<Src s={dash.sources.qonto} seedDate={dash.seedDate} />}
    >
      {!dash.live.qonto ? (
        <p className="text-[13.5px] text-muted-foreground">Le détail ligne par ligne arrive avec la première synchro Qonto.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Filtrer par fournisseur ou libellé…" aria-label="Filtrer les transactions" className={cn(field, "flex-[1_1_220px]")} />
            <select value={poste} onChange={(e) => setPoste(e.target.value)} aria-label="Poste" className={field}>
              <option value="all">Tous les postes</option>
              {POSTES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-muted-foreground">
                  <th className="border-b border-line px-2 py-1.5 font-medium">Date</th>
                  <th className="border-b border-line px-2 py-1.5 font-medium">Contrepartie</th>
                  <th className="border-b border-line px-2 py-1.5 font-medium">Catégorie Qonto</th>
                  <th className="border-b border-line px-2 py-1.5 font-medium">Poste</th>
                  <th className="border-b border-line px-2 py-1.5 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0 hover:bg-glass">
                    <td className="num px-2 py-1.5 text-[12px] whitespace-nowrap text-muted-foreground">{shortDate(t.date)}</td>
                    <td className="max-w-[300px] px-2 py-1.5">
                      <p className="truncate font-medium">
                        {t.counterparty}
                        {t.refund && <span className="ml-2 rounded-full bg-good-soft px-1.5 py-px text-[11px] font-semibold text-good">remboursement</span>}
                      </p>
                      {(t.label || t.reference) && <p className="truncate text-[11.5px] text-faint">{[t.label, t.reference].filter(Boolean).join(" · ")}</p>}
                    </td>
                    <td className="max-w-[160px] truncate px-2 py-1.5 text-[12px] text-muted-foreground">{t.qonto_category ?? "–"}</td>
                    <td className="px-1 py-1.5">
                      <select
                        value={t.poste}
                        aria-label={`Poste de ${t.counterparty}`}
                        onChange={(e) => void qontoTxStore.update(t.id, { poste: e.target.value, poste_locked: true })}
                        className={cn(cellSelect, t.poste === "Autre" && "text-warn")}
                      >
                        {[...new Set([...POSTES, t.poste])].map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num px-2 py-1.5 text-right whitespace-nowrap">{eur(Number(t.amount), 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + 100)} className="mt-3 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Voir plus ({rows.length - limit} restantes)
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

/** Règles « si la contrepartie contient… alors ce poste ». Modifiables ici, appliquées à chaque synchro. */
export function VendorRules({ dash }: { dash: Dash }) {
  const raw = useRows(vendorRulesStore);
  const rules = useMemo(() => [...raw].sort((a, b) => a.sort_order - b.sort_order) as VendorRule[], [raw]);

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pattern = String(f.get("pattern") ?? "").trim();
    if (!pattern) return;
    // Les règles ajoutées à la main passent avant celles de départ.
    void vendorRulesStore.insert({ id: newId(), pattern, poste: String(f.get("poste")), app: String(f.get("app")) || null, sort_order: Math.min(0, ...rules.map((r) => r.sort_order)) - 1, created_at: new Date().toISOString() });
    e.currentTarget.reset();
  }
  /** Reclasse tout de suite les transactions que personne n'a rangées à la main. */
  function apply() {
    let changed = 0;
    (dash.tx as QontoTx[]).filter((t) => !t.poste_locked && !t.refund && !t.id.startsWith("seed:")).forEach((t) => {
      const r = matchRule(`${t.counterparty} ${t.label ?? ""}`, rules);
      const poste = r?.poste ?? "Autre";
      const app = r?.app ?? null;
      if (poste !== t.poste || app !== t.app) {
        changed++;
        void qontoTxStore.update(t.id, { poste, app });
      }
    });
    toast(changed ? `${changed} transaction${changed > 1 ? "s" : ""} reclassée${changed > 1 ? "s" : ""}` : "Tout était déjà bien rangé");
  }

  return (
    <Panel
      title="Règles de rangement des fournisseurs"
      caption="« Si la contrepartie contient… alors c'est ce poste (et cette app). » Appliquées à chaque synchro."
      action={
        <button type="button" onClick={apply} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground hover:border-line-strong hover:text-foreground">
          <Wand2 className="size-3.5" aria-hidden /> Appliquer maintenant
        </button>
      }
    >
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <input name="pattern" required placeholder="Contient… (ex. higgsfield)" aria-label="La contrepartie contient" onKeyDown={(e) => e.stopPropagation()} className={cn(field, "flex-[1_1_160px]")} />
        <select name="poste" aria-label="Poste" className={field} defaultValue="Outils & abonnements">
          {POSTES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select name="app" aria-label="App" className={field} defaultValue="">
          <option value="">App : aucune</option>
          {dash.apps.map((a) => (
            <option key={a.key} value={a.key}>{a.name}</option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background">Ajouter</button>
      </form>
      <ul className="grid gap-x-6 md:grid-cols-2">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-2 border-b border-line py-1.5 text-[13px]">
            <span className="num min-w-0 flex-1 truncate">{r.pattern}</span>
            <select value={r.poste} aria-label={`Poste pour ${r.pattern}`} onChange={(e) => void vendorRulesStore.update(r.id, { poste: e.target.value })} className={cellSelect}>
              {POSTES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select value={r.app ?? ""} aria-label={`App pour ${r.pattern}`} onChange={(e) => void vendorRulesStore.update(r.id, { app: e.target.value || null })} className={cellSelect}>
              <option value="">–</option>
              {dash.apps.map((a) => (
                <option key={a.key} value={a.key}>{a.name}</option>
              ))}
            </select>
            <button type="button" aria-label={`Supprimer la règle ${r.pattern}`} onClick={() => void vendorRulesStore.remove(r.id)} className="grid size-6 place-items-center rounded-md text-faint hover:text-bad">
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
