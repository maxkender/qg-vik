"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Eye, FileImage, FileText, History, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/dashboard/charts";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { documentLogStore, documentsStore, profilesStore } from "@/lib/data";
import { isoDate } from "@/lib/dates";
import { shortDate } from "@/lib/format";
import { ago } from "@/lib/pages";
import { newId, useRows } from "@/lib/store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DOC_CATEGORIES, type DocCategory, type DocLog, type DocRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const BUCKET = "documents";
const LINK_SECONDS = 300; // les liens signés expirent au bout de 5 minutes
const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const HINT: Record<DocCategory, string> = {
  "Société": "Kbis, statuts, PV d'AG, registre des bénéficiaires effectifs",
  "Fiscal & social": "attestations URSSAF, déclarations TVA, liasses fiscales",
  Banque: "RIB Qonto",
  Contrats: "comptable, prestataires, Ruul, Upwork",
  "Apps & stores": "contrats Apple / Google, DUNS",
  Juridique: "CGU, politiques de confidentialité, marques",
  Assurances: "contrats et attestations",
};
const field = "h-9 w-full min-w-0 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";

const daysUntil = (iso: string) => Math.round((new Date(iso + "T00:00:00").getTime() - new Date(isoDate(new Date()) + "T00:00:00").getTime()) / 864e5);
export const expiryState = (d: Pick<DocRow, "expires_at">): "expired" | "soon" | null =>
  !d.expires_at ? null : daysUntil(d.expires_at) < 0 ? "expired" : daysUntil(d.expires_at) <= 30 ? "soon" : null;

function guessCategory(name: string): DocCategory {
  const n = name.toLowerCase();
  if (/kbis|statut|pv|proc[eè]s|b[ée]n[ée]ficiaire|domiciliation/.test(n)) return "Société";
  if (/urssaf|tva|liasse|fiscal|imp[oô]t|social/.test(n)) return "Fiscal & social";
  if (/rib|iban|banque|qonto/.test(n)) return "Banque";
  if (/contrat|ruul|upwork|comptable|prestat/.test(n)) return "Contrats";
  if (/apple|google|duns|store/.test(n)) return "Apps & stores";
  if (/cgu|confidentialit|marque|juridique/.test(n)) return "Juridique";
  if (/assurance/.test(n)) return "Assurances";
  return "Société";
}
const addMonths = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
};

type Draft = { key: string; file: File; name: string; category: DocCategory; doc_date: string; expires_at: string; notes: string };

export function Documents() {
  const me = useMe();
  const docs = useRows(documentsStore);
  const logs = useRows(documentLogStore);
  const profiles = useRows(profilesStore);
  const input = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ doc: DocRow; url: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const who = (id: string | null) => profiles.find((p) => p.id === id);
  const byCategory = useMemo(() => DOC_CATEGORIES.map((c) => ({ c, list: docs.filter((d) => d.category === c).sort((a, b) => (b.doc_date ?? b.created_at).localeCompare(a.doc_date ?? a.created_at)) })), [docs]);
  const alerts = docs.filter((d) => expiryState(d)).length;

  const log = (doc: Pick<DocRow, "id" | "name">, action: DocLog["action"], keepId = true) =>
    void documentLogStore.insert({ id: newId(), document_id: keepId ? doc.id : null, document_name: doc.name, action, actor: me.id, at: new Date().toISOString() });

  function addFiles(files: FileList | File[]) {
    const ok = [...files].filter((f) => ACCEPT.includes(f.type));
    if (ok.length < [...files].length) toast.error("Seuls les PDF et les images (PNG, JPG, WebP) sont acceptés.");
    setDrafts((d) => [
      ...d,
      ...ok.map((file) => {
        const name = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim();
        return { key: newId(), file, name, category: guessCategory(name), doc_date: "", expires_at: "", notes: "" };
      }),
    ]);
  }
  const patch = (key: string, p: Partial<Draft>) =>
    setDrafts((list) =>
      list.map((d) => {
        if (d.key !== key) return d;
        const next = { ...d, ...p };
        // Un Kbis sert tant qu'il a moins de 3 mois : on propose la date d'expiration.
        if (p.doc_date && /kbis/i.test(next.name) && !d.expires_at) next.expires_at = addMonths(p.doc_date, 3);
        return next;
      }),
    );

  async function save(d: Draft) {
    if (!d.name.trim()) return;
    setBusy(d.key);
    const id = newId();
    const ext = (d.file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
    const path = `${id}/document${ext}`;
    const { error } = await supabaseBrowser().storage.from(BUCKET).upload(path, d.file, { contentType: d.file.type, upsert: false });
    if (error) {
      toast.error("Le fichier n'a pas pu être envoyé.", { description: error.message });
      setBusy(null);
      return;
    }
    const row: DocRow = {
      id, name: d.name.trim(), category: d.category, doc_date: d.doc_date || null, expires_at: d.expires_at || null, notes: d.notes.trim() || null,
      path, mime: d.file.type, size: d.file.size, alerted_for: null, added_by: me.id, created_at: new Date().toISOString(),
    };
    if (await documentsStore.insert(row)) {
      log(row, "ajouté");
      setDrafts((list) => list.filter((x) => x.key !== d.key));
    } else {
      // La fiche a été refusée : on ne laisse pas le fichier orphelin.
      await supabaseBrowser().storage.from(BUCKET).remove([path]);
    }
    setBusy(null);
  }

  async function signed(doc: DocRow, download: boolean) {
    const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(doc.path, LINK_SECONDS, download ? { download: `${doc.name}${doc.path.match(/\.[a-z0-9]+$/i)?.[0] ?? ""}` } : undefined);
    if (error || !data) {
      toast.error("Lien impossible à créer.", { description: "Reconnecte-toi si ta session a plus de 12 heures." });
      return null;
    }
    return data.signedUrl;
  }
  async function open(doc: DocRow) {
    const url = await signed(doc, false);
    if (!url) return;
    log(doc, "ouvert");
    setPreview({ doc, url });
  }
  async function download(doc: DocRow) {
    const url = await signed(doc, true);
    if (!url) return;
    log(doc, "téléchargé");
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.click();
  }
  async function remove(doc: DocRow) {
    setConfirm(null);
    const { error } = await supabaseBrowser().storage.from(BUCKET).remove([doc.path]);
    if (error) return void toast.error("Le fichier n'a pas pu être supprimé.");
    log(doc, "supprimé", false);
    void documentsStore.remove(doc.id);
  }

  const iconBtn = "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground";

  return (
    <>
      <Panel
        title="Documents"
        caption={<>Stockage privé. Chaque ouverture passe par un lien qui expire au bout de 5 minutes{alerts > 0 && <> · <span className="font-semibold text-warn">{alerts} à renouveler</span></>}</>}
        action={
          <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground hover:border-line-strong hover:text-foreground">
            <History className="size-3.5" aria-hidden /> Journal
          </button>
        }
      >
        <input ref={input} type="file" multiple accept={ACCEPT.join(",")} hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
          className={cn("flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4 transition-colors duration-100", over ? "border-now bg-now-soft" : "border-line-strong")}
        >
          <Upload className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 text-[13.5px]">
            <span className="font-medium">Glisse un PDF ou une image ici</span>
            <span className="block text-[12.5px] text-muted-foreground">25 Mo maximum par fichier. Jamais de document contenant un mot de passe.</span>
          </p>
          <button type="button" onClick={() => input.current?.click()} className="h-9 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background">Choisir un fichier</button>
        </div>

        {drafts.map((d) => (
          <form key={d.key} onSubmit={(e) => { e.preventDefault(); void save(d); }} className="mt-3 grid gap-2 rounded-xl border border-line bg-glass p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1fr_1fr]">
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-[11.5px] text-muted-foreground">Nom · {d.file.name}</span>
              <input value={d.name} required onChange={(e) => patch(d.key, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-muted-foreground">Catégorie</span>
              <select value={d.category} onChange={(e) => patch(d.key, { category: e.target.value as DocCategory })} className={field}>
                {DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-muted-foreground">Date du document</span>
              <input type="date" value={d.doc_date} onChange={(e) => patch(d.key, { doc_date: e.target.value })} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-muted-foreground">Expire le (facultatif)</span>
              <input type="date" value={d.expires_at} onChange={(e) => patch(d.key, { expires_at: e.target.value })} className={field} />
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="sr-only">Notes</span>
              <input value={d.notes} placeholder="Notes (facultatif)" onChange={(e) => patch(d.key, { notes: e.target.value })} onKeyDown={(e) => e.stopPropagation()} className={field} />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDrafts((l) => l.filter((x) => x.key !== d.key))} className="h-9 rounded-lg border border-line px-3 text-[13px] text-muted-foreground">Annuler</button>
              <button type="submit" disabled={busy === d.key} className="h-9 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-50">{busy === d.key ? "Envoi…" : "Ajouter"}</button>
            </div>
          </form>
        ))}

        {showLog && (
          <div className="mt-4 rounded-xl border border-line p-3">
            <p className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">Journal des accès</p>
            {logs.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Rien pour l&apos;instant.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto text-[13px]">
                {[...logs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200).map((l) => (
                  <li key={l.id} className="flex items-center gap-2 py-1.5">
                    <PersonAvatar who={who(l.actor)?.short ?? "both"} size="xs" />
                    <span className="min-w-0 flex-1 truncate">
                      {who(l.actor)?.name ?? "Quelqu'un"} a <b className="font-semibold">{l.action}</b> « {l.document_name} »
                    </span>
                    <span className="num shrink-0 text-[11.5px] text-faint">{new Date(l.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-2">
          {byCategory.map(({ c, list }) => (
            <section key={c} className="min-w-0">
              <h4 className="flex items-baseline gap-2 font-sans text-[13.5px] font-semibold tracking-normal">
                {c} <span className="num text-[11.5px] font-normal text-faint">{list.length || ""}</span>
              </h4>
              {list.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-faint">{HINT[c]}</p>
              ) : (
                <ul className="mt-1.5 divide-y divide-line">
                  {list.map((doc) => {
                    const state = expiryState(doc);
                    const Icon = doc.mime?.startsWith("image/") ? FileImage : FileText;
                    return (
                      <li key={doc.id} className="group flex items-start gap-2.5 py-2">
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <button type="button" onClick={() => void open(doc)} className="block max-w-full truncate text-left text-[13.5px] font-medium hover:underline">{doc.name}</button>
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
                            {doc.doc_date && <span className="num">{shortDate(doc.doc_date)}/{doc.doc_date.slice(2, 4)}</span>}
                            {doc.expires_at && (
                              <span className={cn("num rounded-full px-1.5", state === "expired" ? "bg-bad-soft font-semibold text-bad" : state === "soon" ? "bg-warn-soft font-semibold text-warn" : "")}>
                                {state === "expired" ? "expiré le " : state === "soon" ? "expire bientôt · " : "expire le "}
                                {shortDate(doc.expires_at)}/{doc.expires_at.slice(2, 4)}
                              </span>
                            )}
                            <span>ajouté par {who(doc.added_by)?.name ?? "?"} {ago(doc.created_at)}</span>
                          </p>
                          {doc.notes && <p className="mt-0.5 text-[12px] text-muted-foreground">{doc.notes}</p>}
                          {confirm === doc.id && (
                            <p className="mt-1 flex items-center gap-2 text-[12px] text-bad">
                              Supprimer définitivement ?
                              <button type="button" autoFocus onClick={() => void remove(doc)} className="rounded-md bg-bad px-2 py-0.5 font-semibold text-white">Oui</button>
                              <button type="button" onClick={() => setConfirm(null)} className="rounded-md border border-line-strong px-2 py-0.5 text-muted-foreground">Non</button>
                            </p>
                          )}
                        </div>
                        <button type="button" onClick={() => void open(doc)} className={iconBtn} aria-label={`Aperçu de ${doc.name}`} title="Aperçu"><Eye className="size-4" aria-hidden /></button>
                        <button type="button" onClick={() => void download(doc)} className={iconBtn} aria-label={`Télécharger ${doc.name}`} title="Télécharger"><Download className="size-4" aria-hidden /></button>
                        <button type="button" onClick={() => setConfirm(doc.id)} className={cn(iconBtn, "hover:text-bad")} aria-label={`Supprimer ${doc.name}`} title="Supprimer"><Trash2 className="size-4" aria-hidden /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      </Panel>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent showCloseButton={false} className="glass-strong flex h-[88dvh] w-[min(96vw,1000px)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 sm:max-w-none">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <DialogTitle className="min-w-0 flex-1 truncate font-sans text-[14px] font-semibold tracking-normal">{preview?.doc.name}</DialogTitle>
            <DialogDescription className="sr-only">Aperçu du document, lien valable 5 minutes</DialogDescription>
            {preview && <button type="button" onClick={() => void download(preview.doc)} className={iconBtn} aria-label="Télécharger"><Download className="size-4" aria-hidden /></button>}
            <button type="button" onClick={() => setPreview(null)} className={iconBtn} aria-label="Fermer"><X className="size-4" aria-hidden /></button>
          </div>
          {preview &&
            (preview.doc.mime?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.doc.name} className="min-h-0 flex-1 object-contain" />
            ) : (
              <iframe src={preview.url} title={preview.doc.name} className="min-h-0 flex-1 bg-white" />
            ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
