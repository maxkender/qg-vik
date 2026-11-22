"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Lock, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/dashboard/charts";
import { useMe } from "@/components/session-provider";
import { CATEGORY_NAME, FEED_SOURCE_NAME, SOURCE_NAME, since, type AppTodo, type FeedbackItem, type ReplyDraft } from "@/lib/agent/types";
import { appTodosStore, draftsStore, faqStore, feedbackStore, syncStateStore, topicsStore } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { createItem, itemSaved } from "@/lib/items";
import { newId, useRows } from "@/lib/store";
import type { AppRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY = 864e5;
const field = "min-w-0 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";
const chip = (on: boolean) => cn("h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors duration-100", on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground");
const one = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const STATUT: Record<AppTodo["statut"], string> = { a_faire: "À faire", en_cours: "En cours", fait: "Fait", refuse: "Refusé" };

/** Une source en panne ou pas encore branchée : on le dit, on n'affiche pas de zéro. */
export function SourceNotice({ sources }: { sources: string[] }) {
  const states = useRows(syncStateStore);
  const lines = sources.flatMap((s) => {
    const st = states.find((x) => x.source === s);
    if (st?.error && st.error_since) return [`${SOURCE_NAME[s]} : source indisponible depuis ${since(st.error_since)}`];
    return st?.last_ok_at ? [] : [`${SOURCE_NAME[s]} : non branchée`];
  });
  if (!syncStateStore.loaded || !lines.length) return null;
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-2.5 text-[12.5px] text-muted-foreground">{lines.join(" · ")}</p>;
}

function Rating({ store, items, now }: { store: "app_store" | "play"; items: FeedbackItem[]; now: number }) {
  const rated = items.filter((i) => i.source === store && i.note);
  const mean = (from: number, to: number) => {
    const list = rated.filter((i) => { const t = new Date(i.recu_le).getTime(); return t >= now - from * DAY && t < now - to * DAY; });
    return list.length ? list.reduce((a, i) => a + i.note!, 0) / list.length : null;
  };
  const m7 = mean(7, 0), m30 = mean(30, 0), before = mean(14, 7);
  const trend = m7 !== null && before !== null ? m7 - before : null;
  const month = rated.filter((i) => new Date(i.recu_le).getTime() >= now - 30 * DAY);
  return (
    <Panel title={store === "app_store" ? "App Store" : "Google Play"}>
      {m30 === null ? (
        <p className="text-[13px] text-faint">aucun avis sur 30 jours</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-[12px] text-muted-foreground">7 jours</p>
            <p className="num mt-1 flex items-center gap-1.5 text-[24px] leading-none font-medium">{m7 === null ? <span className="text-[13px] text-faint">aucun avis</span> : <>{one(m7)} <Star className="size-4 fill-current" aria-hidden /></>}</p>
            {trend !== null && Math.abs(trend) >= 0.05 && (
              <p className={cn("num mt-1.5 inline-flex items-center gap-0.5 text-[11.5px]", trend > 0 ? "text-good" : "text-bad")}>
                {trend > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}{trend > 0 ? "+" : "−"}{one(Math.abs(trend))} <span className="ml-0.5 font-sans text-muted-foreground">vs 7 j d&apos;avant</span>
              </p>
            )}
          </div>
          <div>
            <p className="text-[12px] text-muted-foreground">30 jours</p>
            <p className="num mt-1 flex items-center gap-1.5 text-[24px] leading-none font-medium">{one(m30)} <Star className="size-4 fill-current" aria-hidden /></p>
          </div>
          <ul className="min-w-40 flex-1 space-y-1" aria-label="Avis par étoile sur 30 jours">
            {[5, 4, 3, 2, 1].map((n) => {
              const count = month.filter((i) => i.note === n).length;
              return (
                <li key={n} className="num flex items-center gap-2 text-[11.5px] text-muted-foreground">
                  <span className="w-3">{n}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground" style={{ width: `${(count / month.length) * 100}%` }} /></span>
                  <span className="w-7 text-right">{count}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** Le brouillon de réponse d'un retour : Envoyer (ou Publier), Modifier, Ignorer. */
function DraftBox({ draft }: { draft: ReplyDraft }) {
  const [text, setText] = useState(draft.texte);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const verb = draft.canal === "gmail" ? "Envoyer" : "Publier";
  async function send() {
    if (!window.confirm(draft.canal === "gmail" ? "Envoyer ce mail à l'utilisateur ?" : "Publier cette réponse sous l'avis ?")) return;
    setBusy(true);
    const res = await fetch("/api/agent/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft_id: draft.id, texte: text }) }).then(async (r) => ({ ok: r.ok, body: (await r.json()) as { error?: string } })).catch(() => ({ ok: false, body: { error: "Envoi impossible." } }));
    setBusy(false);
    if (!res.ok) return void toast.error(res.body.error ?? "Envoi impossible.");
    void draftsStore.load();
    toast(draft.canal === "gmail" ? "Mail envoyé" : "Réponse publiée");
  }
  if (draft.statut !== "brouillon") return <p className="mt-2 text-[12px] text-muted-foreground">{draft.statut === "envoye" ? `Réponse ${draft.canal === "gmail" ? "envoyée" : "publiée"} le ${shortDate(draft.updated_at.slice(0, 10))}` : "Brouillon ignoré"}</p>;
  return (
    <div className="mt-2 rounded-xl border border-line bg-glass p-3">
      {editing ? <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} aria-label="Réponse" className={cn(field, "w-full py-2")} /> : <p className="text-[13px] whitespace-pre-wrap">{text}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !text.trim()} onClick={() => void send()} className="h-8 rounded-lg bg-foreground px-3 text-[12.5px] font-semibold text-background disabled:opacity-40">{busy ? "…" : verb}</button>
        <button type="button" onClick={() => { if (editing) void draftsStore.update(draft.id, { texte: text }); setEditing((v) => !v); }} className="h-8 rounded-lg border border-line px-3 text-[12.5px] font-medium hover:border-line-strong">{editing ? "Enregistrer" : "Modifier"}</button>
        <button type="button" onClick={() => void draftsStore.update(draft.id, { statut: "ignore" })} className="h-8 rounded-lg px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">Ignorer</button>
      </div>
    </div>
  );
}

function Faq({ app }: { app: AppRow }) {
  const rows = useRows(faqStore).filter((f) => !f.app_slug || f.app_slug === app.slug).sort((a, b) => a.sort_order - b.sort_order);
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const question = String(f.get("q") ?? "").trim(), reponse = String(f.get("r") ?? "").trim();
    if (!question || !reponse) return;
    void faqStore.insert({ id: newId(), app_slug: app.slug, question, reponse, langue: "fr", sort_order: Date.now() });
    e.currentTarget.reset();
  }
  return (
    <Panel title="FAQ" caption="Les brouillons de réponse s'appuient dessus.">
      <ul className="divide-y divide-line">
        {rows.map((f) => (
          <li key={f.id} className="group/faq flex gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <input defaultValue={f.question} aria-label="Question" onBlur={(e) => e.target.value.trim() && e.target.value !== f.question && void faqStore.update(f.id, { question: e.target.value.trim() })} className="w-full bg-transparent text-[13.5px] font-medium outline-none" />
              <textarea defaultValue={f.reponse} aria-label="Réponse" rows={2} onBlur={(e) => e.target.value.trim() && e.target.value !== f.reponse && void faqStore.update(f.id, { reponse: e.target.value.trim() })} className="mt-0.5 w-full resize-none bg-transparent text-[13px] text-muted-foreground outline-none" />
              {!f.app_slug && <span className="text-[11px] text-faint">toutes les apps</span>}
            </div>
            <button type="button" aria-label={`Supprimer « ${f.question} »`} onClick={() => window.confirm("Supprimer cette question ?") && void faqStore.remove(f.id)} className="grid size-7 shrink-0 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover/faq:opacity-100 hover:text-bad focus-visible:opacity-100"><Trash2 className="size-3.5" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex flex-wrap gap-2">
        <input name="q" placeholder={`Question propre à ${app.name}`} aria-label="Nouvelle question" className={cn(field, "h-9 flex-1")} />
        <input name="r" placeholder="Réponse" aria-label="Réponse" className={cn(field, "h-9 flex-[2]")} />
        <button type="submit" aria-label="Ajouter" className="grid size-9 place-items-center rounded-lg border border-line hover:border-line-strong"><Plus className="size-4" aria-hidden /></button>
      </form>
    </Panel>
  );
}

export function SupportTab({ app }: { app: AppRow }) {
  const me = useMe();
  const [now] = useState(() => Date.now());
  const all = useRows(feedbackStore);
  const items = useMemo(() => all.filter((i) => i.app_slug === app.slug).sort((a, b) => b.recu_le.localeCompare(a.recu_le)), [all, app.slug]);
  const topics = useRows(topicsStore);
  const todos = useRows(appTodosStore).filter((t) => t.app_slug === app.slug);
  const drafts = useRows(draftsStore);
  const [cat, setCat] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [limit, setLimit] = useState(15);

  const urgent = todos.filter((t) => t.type === "urgent" && t.statut !== "fait" && t.statut !== "refuse").sort((a, b) => b.nombre - a.nombre);
  const ideas = todos.filter((t) => t.type === "proposition" && t.statut !== "refuse" && t.statut !== "fait").sort((a, b) => b.nombre - a.nombre);
  const shown = items.filter((i) => i.classe_le && (!cat || i.categorie === cat) && (!src || i.source === src));
  const waiting = items.filter((i) => !i.classe_le && !i.erreur).length;

  function toTask(t: AppTodo) {
    const quotes = topics.find((x) => x.id === t.topic_id)?.exemples.slice(0, 2).map((e) => `« ${e.citation} »`) ?? [];
    const item = createItem({ title: `${app.name} : ${t.titre}`, notes: [t.raison, ...quotes].filter(Boolean).join("\n"), owner: me.short, bucket: "inbox", category: "produit", app_slug: app.slug, created_by: me.id });
    void itemSaved(item.id).then((ok) => ok && appTodosStore.update(t.id, { statut: "en_cours", item_id: item.id }));
    toast("Tâche créée", { description: "Elle est dans la fiche de l'app et dans À faire." });
  }
  const StatusSelect = ({ t }: { t: AppTodo }) => (
    <select value={t.statut} aria-label="Statut" onChange={(e) => void appTodosStore.update(t.id, { statut: e.target.value as AppTodo["statut"] })} className="h-7 shrink-0 cursor-pointer rounded-md border border-line bg-transparent px-1.5 text-[12px] outline-none">
      {Object.entries(STATUT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 pb-24 md:px-6 [&>*]:min-w-0">
      <SourceNotice sources={["gmail:support", "app_store", "play", "fal"]} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Rating store="app_store" items={items} now={now} />
        <Rating store="play" items={items} now={now} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Panel title={<>Urgent {urgent.length > 0 && <span className="num ml-1 rounded-md bg-bad-soft px-1.5 py-0.5 text-[12px] text-bad">{urgent.length}</span>}</>}>
          {urgent.length ? (
            <ul className="divide-y divide-line">
              {urgent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium">{t.titre}</span><span className="block text-[12.5px] text-muted-foreground">{t.raison}</span></span>
                  <StatusSelect t={t} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Rien d&apos;urgent.</p>
          )}
        </Panel>
        <Panel title="Propositions" caption="Les demandes des utilisateurs, de la plus fréquente à la plus rare.">
          {ideas.length ? (
            <ul className="divide-y divide-line">
              {ideas.map((t) => (
                <li key={t.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 text-[13.5px] font-medium">{t.titre} <span className="num ml-1 font-normal text-muted-foreground">× {t.nombre}</span></span>
                    {t.item_id ? <StatusSelect t={t} /> : (
                      <>
                        <button type="button" onClick={() => toTask(t)} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-line px-2 text-[12px] font-medium hover:border-line-strong"><Plus className="size-3.5" aria-hidden /> Tâche</button>
                        <button type="button" onClick={() => void appTodosStore.update(t.id, { statut: "refuse" })} className="h-7 shrink-0 rounded-md px-1.5 text-[12px] text-muted-foreground hover:text-foreground">Refuser</button>
                      </>
                    )}
                  </div>
                  {topics.find((x) => x.id === t.topic_id)?.exemples.slice(0, 2).map((e) => <p key={e.id} className="mt-1 text-[12.5px] text-muted-foreground">« {e.citation} »</p>)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Aucune proposition pour l&apos;instant.</p>
          )}
        </Panel>
      </div>

      <Panel title="Derniers retours" caption={waiting ? `${waiting} retour${waiting > 1 ? "s" : ""} en attente de classement.` : undefined}>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
          <div className="flex flex-wrap gap-1">
            <button type="button" aria-pressed={!cat} onClick={() => setCat(null)} className={chip(!cat)}>Tout</button>
            {Object.entries(CATEGORY_NAME).map(([k, v]) => <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={chip(cat === k)}>{v}</button>)}
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(FEED_SOURCE_NAME).map(([k, v]) => <button key={k} type="button" aria-pressed={src === k} onClick={() => setSrc(src === k ? null : k)} className={chip(src === k)}>{v}</button>)}
          </div>
        </div>
        <ul className="divide-y divide-line">
          {shown.slice(0, limit).map((i) => {
            const draft = drafts.find((d) => d.feedback_id === i.id);
            return (
              <li key={i.id} className="py-3">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                  <span className="num">{shortDate(i.recu_le.slice(0, 10))}</span>
                  <span>{FEED_SOURCE_NAME[i.source]}</span>
                  {i.note && <span className="num inline-flex items-center gap-0.5">{i.note} <Star className="size-3 fill-current" aria-hidden /></span>}
                  {i.categorie && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{CATEGORY_NAME[i.categorie]}</span>}
                  {i.gravite === "urgent" && <span className="rounded-md bg-bad-soft px-1.5 py-0.5 text-[11px] font-semibold text-bad">Urgent</span>}
                  {i.langue && <span className="num uppercase">{i.langue}</span>}
                  {i.pays && <span>{i.pays}</span>}
                  {i.url && <a href={i.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 hover:text-foreground">{i.source === "mail" ? "Ouvrir le mail" : "Voir l'avis"} <ExternalLink className="size-3" aria-hidden /></a>}
                </p>
                <p className="mt-1 text-[13.5px]">{i.resume ?? i.titre}</p>
                {i.citation && <p className="mt-0.5 text-[12.5px] text-muted-foreground">« {i.citation} »</p>}
                {draft && <DraftBox draft={draft} />}
              </li>
            );
          })}
        </ul>
        {!shown.length && <p className="text-[13px] text-muted-foreground">Aucun retour classé.</p>}
        {shown.length > limit && <button type="button" onClick={() => setLimit((n) => n + 30)} className="mt-2 text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">Voir plus ({shown.length - limit})</button>}
      </Panel>

      <Faq app={app} />
      <Panel title="Envoi automatique" caption="Construit, mais désactivé. Jamais pour un remboursement, du juridique, la presse, un partenariat, un mail agressif ou une réponse peu sûre.">
        <ul className="flex flex-wrap gap-2">
          {["Questions", "Abonnement : annuler ou restaurer"].map((label) => (
            <li key={label} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-muted-foreground"><Lock className="size-3.5" aria-hidden /> {label} <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold">désactivé</span></li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
