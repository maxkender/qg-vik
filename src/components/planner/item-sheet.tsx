"use client";

import Link from "next/link";
import { useView } from "@/components/app/view-state";
import { PageIcon } from "@/components/pages/page-icon";
import { Comments } from "@/components/comments";
import { AddLine, EditableTitle, Tick } from "@/components/planner/item-card";
import { BucketPicker, Field, OwnerPicker, CategoryPicker, PrioPicker } from "@/components/planner/task-form";
import { useMe } from "@/components/session-provider";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { itemsStore, pagesStore, profilesStore } from "@/lib/data";
import { isLate } from "@/lib/dates";
import { byOrder, createItem, toggleDone } from "@/lib/items";
import { ago, createPage, livePages, pageHref, pageTitle } from "@/lib/pages";
import { useRows } from "@/lib/store";

/** Panneau d'une tâche : titre, description, urgence, personne, échéance, sous-objectifs, commentaires. */
export function ItemSheet() {
  const me = useMe();
  const { openItem, setOpenItem, today } = useView();
  const items = useRows(itemsStore);
  const profiles = useRows(profilesStore);
  const item = items.find((i) => i.id === openItem);
  const kids = item ? items.filter((i) => i.parent_id === item.id).sort(byOrder) : [];
  const pages = useRows(pagesStore);
  const pageList = livePages(pages).sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), "fr"));
  const linked = pageList.find((p) => p.id === item?.page_id);
  const author = profiles.find((p) => p.id === item?.created_by)?.name;

  return (
    <Sheet open={Boolean(item)} onOpenChange={(o) => !o && setOpenItem(null)}>
      <SheetContent className="glass-strong w-full gap-0 overflow-y-auto border-0 p-5 sm:max-w-lg">
        <SheetTitle className="sr-only">Détail de la tâche</SheetTitle>
        <SheetDescription className="sr-only">Titre, description, urgence, personne, échéance, sous-objectifs et commentaires</SheetDescription>
        {item && (
          <div className="flex flex-col gap-5 pt-6">
            <div className="flex items-start gap-2.5">
              <Tick checked={item.done} onChange={() => void toggleDone(item)} label="Fait" />
              <EditableTitle value={item.title} done={item.done} onSave={(title) => void itemsStore.update(item.id, { title })} className="font-heading text-[20px] leading-7 font-semibold tracking-[-0.01em]" />
            </div>
            {!item.done && isLate(item.bucket, today) && <p className="-mt-3 pl-[27px] text-[12.5px] font-semibold text-bad">En retard</p>}

            <Field title="Description">
              <textarea
                key={item.id + (item.notes ?? "")}
                defaultValue={item.notes ?? ""}
                placeholder="Le contexte, ce qui est attendu, les liens utiles…"
                aria-label="Description"
                onKeyDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const el = e.currentTarget;
                  const v = el.value.trim();
                  if (v !== (item.notes ?? "")) void itemsStore.update(item.id, { notes: v || null }).then((ok) => { if (!ok) el.value = item.notes ?? ""; });
                }}
                className="min-h-28 w-full resize-y rounded-xl border border-line bg-glass p-3 text-[13.5px] leading-relaxed outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong [field-sizing:content]"
              />
            </Field>
            <Field title="Page liée">
              {linked ? (
                <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <PageIcon icon={linked.icon} className="size-4 shrink-0 text-muted-foreground" />
                  <Link href={pageHref(linked.id)} onClick={() => setOpenItem(null)} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">{pageTitle(linked)}</Link>
                  <button type="button" onClick={() => void itemsStore.update(item.id, { page_id: null })} className="text-[12px] text-muted-foreground hover:text-foreground">Retirer</button>
                </div>
              ) : (
                <select
                  value=""
                  aria-label="Relier à une page"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    void itemsStore.update(item.id, { page_id: v === "new" ? createPage({ title: item.title, created_by: me.id }).id : v });
                  }}
                  className="h-9 w-full rounded-lg border border-line bg-glass px-2.5 text-[13px] text-muted-foreground outline-none focus:border-line-strong"
                >
                  <option value="">Relier à une page…</option>
                  <option value="new">+ Nouvelle page pour cette tâche</option>
                  {pageList.map((p) => (
                    <option key={p.id} value={p.id}>{pageTitle(p)}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field title="Catégorie"><CategoryPicker value={item.category} onChange={(category) => void itemsStore.update(item.id, { category })} /></Field>
            <Field title="Urgence"><PrioPicker value={item.prio} onChange={(prio) => void itemsStore.update(item.id, { prio })} /></Field>
            <Field title="Assignée à"><OwnerPicker value={item.owner} onChange={(owner) => void itemsStore.update(item.id, { owner })} /></Field>
            <Field title="Échéance">
              <BucketPicker
                value={item.bucket}
                onChange={(bucket) => {
                  void itemsStore.update(item.id, { bucket });
                  kids.forEach((k) => void itemsStore.update(k.id, { bucket }));
                }}
              />
            </Field>

            <Field title={`Sous-objectifs${kids.length ? ` · ${kids.filter((k) => k.done).length}/${kids.length}` : ""}`}>
              <div className="flex flex-col">
                {kids.map((k) => (
                  <div key={k.id} className="flex items-start gap-2 py-1">
                    <Tick small checked={k.done} onChange={() => void toggleDone(k)} label="Fait" />
                    <EditableTitle value={k.title} done={k.done} className="text-[13.5px] leading-5" onSave={(title) => void itemsStore.update(k.id, { title })} />
                  </div>
                ))}
                <AddLine small placeholder="Ajouter un sous-objectif…" onAdd={(title) => void createItem({ title, bucket: item.bucket, owner: item.owner, parent_id: item.id, created_by: me.id })} />
              </div>
            </Field>

            <Field title="Commentaires"><Comments target={{ itemId: item.id }} /></Field>
            <p className="text-[11.5px] text-faint">Créée {author ? `par ${author} ` : ""}{ago(item.created_at)}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
