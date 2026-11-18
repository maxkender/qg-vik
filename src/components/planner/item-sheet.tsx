"use client";

import { useView } from "@/components/app/view-state";
import { Comments } from "@/components/comments";
import { EditableTitle, Tick } from "@/components/planner/item-card";
import { PersonAvatar } from "@/components/person-avatar";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { itemsStore } from "@/lib/data";
import { bucketLabel } from "@/lib/dates";
import { OWNER_LABEL, PRIO_LABEL, toggleDone } from "@/lib/items";
import { useRows } from "@/lib/store";

/** Panneau de détail d'une tâche : notes et commentaires. */
export function ItemSheet() {
  const { openItem, setOpenItem, today } = useView();
  const items = useRows(itemsStore);
  const item = items.find((i) => i.id === openItem);

  return (
    <Sheet open={Boolean(item)} onOpenChange={(o) => !o && setOpenItem(null)}>
      <SheetContent className="glass-strong w-full gap-0 overflow-y-auto border-0 p-5 sm:max-w-md">
        <SheetTitle className="sr-only">Détail de la tâche</SheetTitle>
        <SheetDescription className="sr-only">Notes et commentaires de la tâche</SheetDescription>
        {item && (
          <div className="flex flex-col gap-5 pt-6">
            <div className="flex items-start gap-2.5">
              <Tick checked={item.done} onChange={() => void toggleDone(item)} label="Fait" />
              <EditableTitle value={item.title} done={item.done} onSave={(title) => void itemsStore.update(item.id, { title })} className="text-[17px] leading-6 font-semibold" />
            </div>
            <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5"><PersonAvatar who={item.owner} size="xs" /> {OWNER_LABEL[item.owner]}</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5">{PRIO_LABEL[item.prio]}</span>
              <span className="num rounded-md bg-muted px-1.5 py-0.5">{bucketLabel(item.bucket, today)}</span>
            </p>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">Notes</span>
              <textarea
                key={item.id + (item.notes ?? "")}
                defaultValue={item.notes ?? ""}
                placeholder="Contexte, liens, détails…"
                onKeyDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v !== (item.notes ?? "")) void itemsStore.update(item.id, { notes: v || null });
                }}
                className="min-h-24 w-full resize-y rounded-xl border border-line bg-glass p-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong [field-sizing:content]"
              />
            </label>
            <div>
              <p className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">Commentaires</p>
              <Comments target={{ itemId: item.id }} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
