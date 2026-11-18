"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { FileUp, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { ViewHeader } from "@/components/app/shell";
import { Bars, Panel, type Serie } from "@/components/dashboard/charts";
import { expenseRulesStore, expensesStore } from "@/lib/data";
import { readBankExport, type BankLine } from "@/lib/csv";
import { MONTHS, MONTHS_SHORT, cap, isoDate } from "@/lib/dates";
import { big, eur, shortDate } from "@/lib/format";
import { newId, useRows } from "@/lib/store";
import type { AppKey, Expense, ExpenseKind, ExpenseRule } from "@/lib/types";
import { cn } from "@/lib/utils";

const APPS: { key: AppKey; label: string; color: string }[] = [
  { key: "sophia", label: "Sophia", color: "var(--viz-1)" },
  { key: "micabo", label: "Micabo", color: "var(--viz-4)" },
  { key: "unswipe", label: "Unswipe", color: "var(--viz-5)" },
  { key: "runvik", label: "Runvik", color: "var(--viz-3)" },
  { key: "commun", label: "Commun", color: "var(--viz-other)" },
];
const APP_LABEL = Object.fromEntries(APPS.map((a) => [a.key, a.label])) as Record<AppKey, string>;
const KINDS: { key: ExpenseKind; label: string }[] = [
  { key: "api", label: "API" },
  { key: "abonnement", label: "Abonnement" },
  { key: "posteurs", label: "Posteurs" },
  { key: "materiel", label: "Matériel" },
  { key: "admin", label: "Admin" },
  { key: "pub", label: "Pub" },
  { key: "transfert", label: "Transfert" },
  { key: "autre", label: "Autre" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.key, k.label])) as Record<ExpenseKind, string>;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Première règle dont le motif apparaît (en mot entier) dans le nom du fournisseur. */
function matchRule(vendor: string, rules: ExpenseRule[]): ExpenseRule | undefined {
  const v = norm(vendor);
  return rules.find((r) => {
    const p = norm(r.pattern).trim();
    if (!p) return false;
    return new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(v);
  });
}

const field = "h-9 min-w-0 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";
const cellSelect = "h-7 max-w-full rounded-md border border-transparent bg-transparent px-1 text-[12.5px] outline-none transition-colors duration-100 hover:border-line focus:border-line-strong";

export default function ExpensesPage() {
  const expenses = useRows(expensesStore);
  const rulesRaw = useRows(expenseRulesStore);
  const rules = useMemo(() => [...rulesRaw].sort((a, b) => a.sort_order - b.sort_order), [rulesRaw]);
  const [month, setMonth] = useState<string>("all");
  const [app, setApp] = useState<AppKey | "all">("all");
  const [limit, setLimit] = useState(60);

  const months = useMemo(() => [...new Set(expenses.map((e) => e.date.slice(0, 7)))].sort().reverse(), [expenses]);
  const monthLabel = (m: string) => `${cap(MONTHS[Number(m.slice(5, 7)) - 1])} ${m.slice(0, 4)}`;

  const inPeriod = useMemo(() => expenses.filter((e) => month === "all" || e.date.startsWith(month)), [expenses, month]);
  const shown = useMemo(
    () => inPeriod.filter((e) => app === "all" || e.app === app).sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount),
    [inPeriod, app],
  );

  const sum = (list: Expense[]) => list.reduce((a, e) => a + Number(e.amount), 0);
  const total = sum(shown);
  const byKind = (k: ExpenseKind) => sum(shown.filter((e) => e.kind === k));

  // Par app : total et part d'API.
  const perApp = APPS.map((a) => {
    const list = inPeriod.filter((e) => e.app === a.key);
    const api = list.filter((e) => e.kind === "api");
    const vendors = new Map<string, number>();
    api.forEach((e) => vendors.set(e.vendor, (vendors.get(e.vendor) ?? 0) + Number(e.amount)));
    return { ...a, total: sum(list), api: sum(api), apiVendors: [...vendors.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4) };
  });
  const maxApp = Math.max(...perApp.map((a) => a.total), 1);

  const vendors = useMemo(() => {
    const map = new Map<string, { total: number; n: number }>();
    shown.forEach((e) => {
      const v = map.get(e.vendor) ?? { total: 0, n: 0 };
      v.total += Number(e.amount);
      v.n++;
      map.set(e.vendor, v);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 12);
  }, [shown]);
  const maxVendor = Math.max(...vendors.map(([, v]) => v.total), 1);

  // Par mois, empilé par app.
  const { monthly, monthlySeries } = useMemo(() => {
    const ms = [...new Set(expenses.map((e) => e.date.slice(0, 7)))].sort().slice(-8);
    const used = APPS.filter((a) => expenses.some((e) => e.app === a.key));
    const series: Serie[] = used.map((a) => ({ key: a.key, label: a.label, color: a.color }));
    const data = ms.map((m) => {
      const row: Record<string, string | number> = { label: cap(MONTHS_SHORT[Number(m.slice(5, 7)) - 1]) };
      used.forEach((a) => (row[a.key] = Math.round(sum(expenses.filter((e) => e.date.startsWith(m) && e.app === a.key)))));
      return row;
    });
    return { monthly: data, monthlySeries: series };
  }, [expenses]);

  const unsorted = expenses.filter((e) => e.app === "commun" && e.kind === "autre").length;

  function applyRules() {
    let n = 0;
    expenses.forEach((e) => {
      const r = matchRule(e.vendor, rules);
      if (!r) return;
      const patch: Partial<Expense> = {};
      if (r.app && e.app === "commun") patch.app = r.app;
      if (r.kind && e.kind === "autre") patch.kind = r.kind;
      if (r.category && !e.category) patch.category = r.category;
      if (Object.keys(patch).length) {
        n++;
        void expensesStore.update(e.id, patch);
      }
    });
    toast(n ? `${n} dépense${n > 1 ? "s" : ""} rangée${n > 1 ? "s" : ""}` : "Rien de nouveau à ranger");
  }

  const empty = expensesStore.loaded && expenses.length === 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Dépenses" sub="D'où part l'argent : par app, par fournisseur, et ce que coûtent les API.">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Période" className={field}>
          <option value="all">Toute la période</option>
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <select value={app} onChange={(e) => setApp(e.target.value as AppKey | "all")} aria-label="App" className={field}>
          <option value="all">Toutes les apps</option>
          {APPS.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
      </ViewHeader>

      <div className="flex flex-col gap-3 px-4 pb-16 md:px-6">
        <Importer rules={rules} existing={expenses} highlight={empty} />

        {!empty && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Total" value={eur(total)} note={`${shown.length} ligne${shown.length > 1 ? "s" : ""}`} hero />
              <Tile label="API" value={eur(byKind("api"))} note={total ? `${Math.round((byKind("api") / total) * 100)} % du total` : undefined} />
              <Tile label="Posteurs" value={eur(byKind("posteurs"))} note={total ? `${Math.round((byKind("posteurs") / total) * 100)} % du total` : undefined} />
              <Tile label="Abonnements" value={eur(byKind("abonnement"))} note={total ? `${Math.round((byKind("abonnement") / total) * 100)} % du total` : undefined} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Coût par app" caption="Total de la période, et dedans la part des API">
                <ul className="flex flex-col gap-3.5">
                  {perApp.map((a) => (
                    <li key={a.key}>
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <button type="button" onClick={() => setApp(app === a.key ? "all" : a.key)} className="inline-flex items-center gap-2 font-medium hover:underline">
                          <span className="size-2.5 rounded-[3px]" style={{ background: a.color }} aria-hidden />
                          {a.label}
                        </button>
                        <span className="num">
                          {eur(a.total)}
                          <span className="ml-2 text-[11.5px] text-muted-foreground">dont API {eur(a.api)}</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="relative h-full rounded-full" style={{ width: `${(a.total / maxApp) * 100}%`, background: a.color, opacity: 0.45 }}>
                          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: a.total ? `${(a.api / a.total) * 100}%` : 0, background: a.color, opacity: 1 }} />
                        </div>
                      </div>
                      {a.apiVendors.length > 0 && (
                        <p className="mt-1 text-[11.5px] text-muted-foreground">
                          API : {a.apiVendors.map(([v, t]) => `${v} ${eur(t)}`).join(" · ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {unsorted > 0 && (
                  <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-muted-foreground">
                    <span className="num">{unsorted}</span> dépense{unsorted > 1 ? "s" : ""} sans app ni type. Range-les dans le tableau, ou crée une règle plus bas.
                  </p>
                )}
              </Panel>
              <Panel title="Par mois et par app" caption="Les 8 derniers mois">
                {monthly.length ? (
                  <Bars label="Dépenses par mois et par app" data={monthly} x="label" format={big} stacked series={monthlySeries} height={240} />
                ) : (
                  <p className="text-muted-foreground">Pas encore de données.</p>
                )}
              </Panel>
            </div>

            <Panel title="Par fournisseur" caption="Les 12 plus gros sur la sélection">
              <ul className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
                {vendors.map(([v, d]) => (
                  <li key={v} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="truncate">{v} <span className="num text-[11px] text-faint">×{d.n}</span></span>
                      <span className="num shrink-0">{eur(d.total)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${(d.total / maxVendor) * 100}%`, background: "var(--viz-1)" }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Toutes les dépenses" caption="Change l'app ou le type directement dans la ligne">
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[12px] text-muted-foreground">
                      <th className="border-b border-line px-2 py-1.5 font-medium">Date</th>
                      <th className="border-b border-line px-2 py-1.5 font-medium">Fournisseur</th>
                      <th className="border-b border-line px-2 py-1.5 font-medium">App</th>
                      <th className="border-b border-line px-2 py-1.5 font-medium">Type</th>
                      <th className="border-b border-line px-2 py-1.5 text-right font-medium">Montant</th>
                      <th className="border-b border-line" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, limit).map((e) => (
                      <tr key={e.id} className="group border-b border-line last:border-0 hover:bg-glass">
                        <td className="num px-2 py-1.5 text-[12px] whitespace-nowrap text-muted-foreground">{shortDate(e.date)}/{e.date.slice(2, 4)}</td>
                        <td className="max-w-[280px] px-2 py-1.5">
                          <p className="truncate font-medium">{e.vendor}</p>
                          {e.label && <p className="truncate text-[11.5px] text-faint">{e.label}</p>}
                        </td>
                        <td className="px-1 py-1.5">
                          <select value={e.app} aria-label={`App de ${e.vendor}`} onChange={(ev) => void expensesStore.update(e.id, { app: ev.target.value as AppKey })} className={cellSelect}>
                            {APPS.map((a) => (
                              <option key={a.key} value={a.key}>{a.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1.5">
                          <select value={e.kind} aria-label={`Type de ${e.vendor}`} onChange={(ev) => void expensesStore.update(e.id, { kind: ev.target.value as ExpenseKind })} className={cellSelect}>
                            {KINDS.map((k) => (
                              <option key={k.key} value={k.key}>{k.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="num px-2 py-1.5 text-right whitespace-nowrap">{eur(Number(e.amount), 2)}</td>
                        <td className="w-8 py-1.5 pr-1">
                          <button
                            type="button"
                            aria-label={`Supprimer ${e.vendor}`}
                            onClick={() => void expensesStore.remove(e.id)}
                            className="grid size-6 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shown.length > limit && (
                <button type="button" onClick={() => setLimit((l) => l + 200)} className="mt-3 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Voir plus ({shown.length - limit} restantes)
                </button>
              )}
            </Panel>
          </>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <AddExpense rules={rules} />
          <Rules rules={rules} onApply={applyRules} />
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, note, hero }: { label: string; value: string; note?: string; hero?: boolean }) {
  return (
    <div className="glass flex min-w-0 flex-col gap-1 rounded-2xl p-4">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className={cn("font-heading leading-tight font-extrabold tracking-[-0.02em] tabular-nums", hero ? "text-[30px]" : "text-[24px]")}>{value}</p>
      <p className="text-[11.5px] text-faint">{note ?? " "}</p>
    </div>
  );
}

function toExpense(l: BankLine, rules: ExpenseRule[], source: Expense["source"]): Expense {
  const r = matchRule(l.vendor, rules);
  const now = new Date().toISOString();
  return {
    id: newId(),
    date: l.date,
    vendor: l.vendor,
    label: l.label,
    amount: l.amount,
    currency: l.currency,
    category: r?.category ?? null,
    kind: r?.kind ?? "autre",
    app: r?.app ?? "commun",
    source,
    external_id: l.external_id,
    note: null,
    created_at: now,
    updated_at: now,
  };
}

/** Import d'un export CSV de la banque : lu dans le navigateur, rien n'est envoyé ailleurs que dans la base du QG. */
function Importer({ rules, existing, highlight }: { rules: ExpenseRule[]; existing: Expense[]; highlight: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ lines: BankLine[]; skipped: number; dupes: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function read(file: File) {
    setError(null);
    const res = readBankExport(await file.text());
    if (res.error) return setError(res.error);
    const known = new Set(existing.map((e) => e.external_id).filter(Boolean));
    const knownLoose = new Set(existing.map((e) => `${e.date}|${norm(e.vendor)}|${Number(e.amount).toFixed(2)}`));
    const fresh = res.lines.filter((l) => (l.external_id ? !known.has(l.external_id) : !knownLoose.has(`${l.date}|${norm(l.vendor)}|${l.amount.toFixed(2)}`)));
    setPending({ lines: fresh, skipped: res.skipped, dupes: res.lines.length - fresh.length, name: file.name });
  }
  async function confirm() {
    if (!pending) return;
    const lines = pending.lines;
    setPending(null);
    for (const l of lines) await expensesStore.insert(toExpense(l, rules, "qonto"));
    toast(`${lines.length} dépense${lines.length > 1 ? "s" : ""} importée${lines.length > 1 ? "s" : ""}`);
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) void read(f);
      }}
      className={cn(
        "rounded-2xl border border-dashed p-4 transition-colors duration-100 sm:p-5",
        over ? "border-now bg-now-soft" : "border-line-strong",
        highlight && "py-10 text-center",
      )}
    >
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          // On vide le champ pour pouvoir rechoisir le même fichier.
          e.target.value = "";
          if (f) void read(f);
        }}
      />
      {pending ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-[13.5px]">
            <b>{pending.name}</b> : <span className="num">{pending.lines.length}</span> nouvelle{pending.lines.length > 1 ? "s" : ""} dépense{pending.lines.length > 1 ? "s" : ""} pour{" "}
            <span className="num">{eur(pending.lines.reduce((a, l) => a + l.amount, 0))}</span>
            {pending.dupes > 0 && <> · <span className="num">{pending.dupes}</span> déjà importée{pending.dupes > 1 ? "s" : ""}</>}
            {pending.skipped > 0 && <> · <span className="num">{pending.skipped}</span> ligne{pending.skipped > 1 ? "s" : ""} illisible{pending.skipped > 1 ? "s" : ""}</>}
          </p>
          <button type="button" onClick={() => setPending(null)} className="h-9 rounded-lg border border-line px-3 text-[13px] text-muted-foreground">Annuler</button>
          <button type="button" disabled={!pending.lines.length} onClick={() => void confirm()} className="h-9 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-40">Importer</button>
        </div>
      ) : (
        <div className={cn("flex flex-wrap items-center gap-3", highlight && "flex-col")}>
          <FileUp className={cn("shrink-0 text-muted-foreground", highlight ? "size-7" : "size-5")} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={cn("font-medium", highlight ? "text-[16px]" : "text-[13.5px]")}>
              {highlight ? "Aucune dépense pour l'instant" : "Importer un export de la banque"}
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              Dans Qonto : Transactions → Exporter → CSV. Glisse le fichier ici. Les lignes déjà importées sont reconnues, les règles rangent le reste.
            </p>
          </div>
          <button type="button" onClick={() => input.current?.click()} className="h-9 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background">
            Choisir un fichier
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
    </section>
  );
}

function AddExpense({ rules }: { rules: ExpenseRule[] }) {
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const vendor = String(f.get("vendor") ?? "").trim();
    const amount = Number(String(f.get("amount") ?? "").replace(",", "."));
    if (!vendor || !Number.isFinite(amount) || amount <= 0) return;
    const base = toExpense({ date: String(f.get("date")), vendor, label: null, amount, currency: "EUR", external_id: null }, rules, "manual");
    const app = String(f.get("app"));
    const kind = String(f.get("kind"));
    void expensesStore.insert({ ...base, app: app === "auto" ? base.app : (app as AppKey), kind: kind === "auto" ? base.kind : (kind as ExpenseKind) });
    e.currentTarget.reset();
  }
  return (
    <Panel title="Ajouter une dépense à la main">
      <form onSubmit={add} className="grid grid-cols-2 gap-2">
        <input name="vendor" required placeholder="Fournisseur (ex. Anthropic)" aria-label="Fournisseur" className={cn(field, "col-span-2")} />
        <input name="amount" required inputMode="decimal" placeholder="Montant en €" aria-label="Montant en euros" className={field} />
        <input name="date" type="date" required defaultValue={isoDate(new Date())} aria-label="Date" className={field} />
        <select name="app" aria-label="App" className={field} defaultValue="auto">
          <option value="auto">App : selon les règles</option>
          {APPS.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
        <select name="kind" aria-label="Type" className={field} defaultValue="auto">
          <option value="auto">Type : selon les règles</option>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>{k.label}</option>
          ))}
        </select>
        <button type="submit" className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-foreground text-[13px] font-semibold text-background">
          <Plus className="size-4" aria-hidden /> Ajouter
        </button>
      </form>
    </Panel>
  );
}

function Rules({ rules, onApply }: { rules: ExpenseRule[]; onApply: () => void }) {
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pattern = String(f.get("pattern") ?? "").trim();
    if (!pattern) return;
    const app = String(f.get("app"));
    const kind = String(f.get("kind"));
    void expenseRulesStore.insert({
      id: newId(),
      pattern,
      category: null,
      app: app ? (app as AppKey) : null,
      kind: kind ? (kind as ExpenseKind) : null,
      // Les règles ajoutées à la main passent avant celles de départ.
      sort_order: Math.min(0, ...rules.map((r) => r.sort_order)) - 1,
      created_at: new Date().toISOString(),
    });
    e.currentTarget.reset();
  }
  return (
    <Panel
      title="Règles de rangement"
      caption="« Si le fournisseur contient… alors c'est telle app, tel type. » Appliquées à l'import."
      action={
        <button type="button" onClick={onApply} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground hover:border-line-strong hover:text-foreground">
          <Wand2 className="size-3.5" aria-hidden /> Appliquer
        </button>
      }
    >
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <input name="pattern" required placeholder="Contient… (ex. openai)" aria-label="Le fournisseur contient" className={cn(field, "flex-[1_1_140px]")} />
        <select name="app" aria-label="App" className={field} defaultValue="">
          <option value="">App : –</option>
          {APPS.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
        <select name="kind" aria-label="Type" className={field} defaultValue="">
          <option value="">Type : –</option>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>{k.label}</option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background">Ajouter</button>
      </form>
      <ul className="max-h-64 divide-y divide-line overflow-y-auto">
        {rules.map((r) => (
          <li key={r.id} className="group flex items-center gap-2 py-1.5 text-[13px]">
            <span className="num min-w-0 flex-1 truncate">{r.pattern}</span>
            <select value={r.app ?? ""} aria-label={`App pour ${r.pattern}`} onChange={(e) => void expenseRulesStore.update(r.id, { app: (e.target.value || null) as AppKey | null })} className={cellSelect}>
              <option value="">App : –</option>
              {APPS.map((a) => (
                <option key={a.key} value={a.key}>{APP_LABEL[a.key]}</option>
              ))}
            </select>
            <select value={r.kind ?? ""} aria-label={`Type pour ${r.pattern}`} onChange={(e) => void expenseRulesStore.update(r.id, { kind: (e.target.value || null) as ExpenseKind | null })} className={cellSelect}>
              <option value="">Type : –</option>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>{KIND_LABEL[k.key]}</option>
              ))}
            </select>
            <button type="button" aria-label={`Supprimer la règle ${r.pattern}`} onClick={() => void expenseRulesStore.remove(r.id)} className="grid size-6 place-items-center rounded-md text-faint hover:text-bad">
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
