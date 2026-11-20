"use client";

import { memo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, Check, ChevronDown, CornerDownRight, Ellipsis, Repeat, Video, Maximize2, MessageSquare, Plus, Trash2 } from "lucide-react";
import { LinkedSummary } from "@/components/planner/item-links";
import { tagCardStyle, tagChipStyle, useTagColors } from "@/lib/tags";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import { useView } from "@/components/app/view-state";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { itemsStore, profilesStore } from "@/lib/data";
import { useRows } from "@/lib/store";
import { addDays, addMonths, bucketLabel, dayKey, isLate, monday, monthKey, weekKey, yearKey } from "@/lib/dates";
import { categoryOf, CATEGORIES } from "@/lib/categories";
import { byOrder, createItem, nextOwner, OWNER_LABEL, OWNER_NAME, PRIO_LABEL, REPEAT_LABEL, toggleDone } from "@/lib/items";
import type { Owner } from "@/lib/members";
import type { Item, Prio } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Case à cocher ronde-carrée du QG. */
export function Tick({ checked, onChange, label, small }: { checked: boolean; onChange: () => void; label: string; small?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "mt-[2px] grid shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors duration-100",
        small ? "size-[15px]" : "size-[17px]",
        checked ? "border-good bg-good text-background" : "border-line-strong hover:border-muted-foreground",
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3.5} aria-hidden />}
    </button>
  );
}

/** Titre modifiable sur place : Entrée valide, Échap annule. */
export function EditableTitle({
  value, onSave, done, className, onEditing, placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  done?: boolean;
  className?: string;
  onEditing?: (editing: boolean) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      e.currentTarget.textContent = value;
      e.currentTarget.blur();
    }
  }
  return (
    <div
      ref={ref}
      role="textbox"
      aria-label="Titre"
      aria-multiline="false"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onFocus={() => onEditing?.(true)}
      onBlur={(e) => {
        onEditing?.(false);
        const next = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (next && next !== value) onSave(next);
        else e.currentTarget.textContent = value;
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "min-w-0 flex-1 cursor-text rounded-[5px] leading-[21px] break-words outline-none focus:bg-accent",
        "empty:before:text-faint empty:before:content-[attr(data-placeholder)]",
        done && "text-faint line-through",
        className,
      )}
    >
      {value}
    </div>
  );
}

const OWNER_TONE: Record<Owner, string> = {
  max: "bg-max-soft text-max",
  adrien: "bg-adrien-soft text-adrien",
  both: "bg-both-soft text-both",
};

export function moveTargets(today: Date): [string, string][] {
  return [
    ["Aujourd'hui", dayKey(today)],
    ["Demain", dayKey(addDays(today, 1))],
    ["Cette semaine", weekKey(today)],
    ["Semaine prochaine", weekKey(addDays(monday(today), 7))],
    ["Ce mois", monthKey(today)],
    ["Mois prochain", monthKey(addMonths(today, 1))],
    ["Cette année", yearKey(today)],
    ["Vie", "life"],
    ["Inbox", "inbox"],
  ];
}

type Props = {
  item: Item;
  kids: Item[];
  comments?: number;
  /** Afficher l'horizon (« S47 », « Aujourd'hui ») sous le titre. */
  showHorizon?: boolean;
  /** Afficher l'urgence sur la carte (inutile quand la colonne la dit déjà). */
  showPrio?: boolean;
  /** Afficher « en retard » même sans l'horizon. */
  showLate?: boolean;
  dragging?: boolean;
  onEditing?: (editing: boolean) => void;
  onOpen?: (item: Item) => void;
};

export const ItemCard = memo(function ItemCard({ item, kids, comments = 0, showHorizon, showPrio = true, showLate, dragging, onEditing, onOpen }: Props) {
  const me = useMe();
  const { today } = useView();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  const category = categoryOf(item.category);
  const colorOf = useTagColors();
  const creator = useRows(profilesStore).find((p) => p.id === item.created_by);
  // Créée par l'un pour l'autre (et pas pour soi ni pour les deux).
  const assigner = creator && item.owner !== "both" && creator.short !== item.owner ? creator : null;
  const tint = !dragging && item.tags?.length ? tagCardStyle(colorOf(item.tags[0]), item.done) : undefined;
  const late = !item.done && isLate(item.bucket, today);
  const doneKids = kids.filter((k) => k.done).length;
  const sorted = [...kids].sort(byOrder);

  function addKid(title: string) {
    createItem({ title, bucket: item.bucket, owner: item.owner, parent_id: item.id, created_by: me.id });
  }
  function remove() {
    // Les sous-objectifs partent avec (suppression en cascade dans la base).
    kids.forEach((k) => void itemsStore.remove(k.id));
    void itemsStore.remove(item.id);
  }

  return (
    <div
      // Un clic dans le blanc de la carte (hors titre, case et boutons) ouvre le détail.
      onClick={(e) => {
        if (!onOpen || dragging || e.defaultPrevented) return;
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label, [role=textbox], [role=checkbox], [role=menu], [role=alertdialog]")) return;
        if (window.getSelection()?.toString()) return;
        onOpen(item);
      }}
      style={tint}
      className={cn(
        "group/card relative rounded-[10px] px-2 py-[7px] transition-colors duration-100",
        onOpen && "cursor-pointer",
        tint && "my-0.5 hover:brightness-[0.98] dark:hover:brightness-110",
        "hover:bg-glass",
        dragging && "glass-strong cursor-grabbing shadow-2xl",
      )}
    >
      <div className="flex items-start gap-2">
        <Tick checked={item.done} onChange={() => void toggleDone(item)} label={item.done ? "Marquer comme pas fait" : "Marquer comme fait"} />
        {/* Le titre n'occupe que la largeur de son texte : le blanc à côté ouvre le détail. */}
        <div className="min-w-0 flex-1">
          <EditableTitle
            value={item.title}
            done={item.done}
            className="w-fit max-w-full"
            onSave={(title) => void itemsStore.update(item.id, { title })}
            onEditing={onEditing}
          />
        </div>
        {/* Les boutons flottent au survol : ils ne prennent pas de place au titre. Sur téléphone ils restent visibles. */}
        <div className="flex shrink-0 gap-0.5 md:absolute md:top-1 md:right-1 md:rounded-md md:bg-background md:px-0.5 md:opacity-0 md:shadow-[0_0_0_1px_var(--line)] md:transition-opacity md:duration-100 md:group-hover/card:opacity-100 md:focus-within:opacity-100 md:has-[[data-state=open]]:opacity-100">
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(item)}
            aria-label="Ouvrir la tâche"
            title="Ouvrir : description, urgence, commentaires"
            className="mt-[1px] grid size-5 shrink-0 place-items-center rounded-md text-faint outline-none hover:text-foreground"
          >
            <Maximize2 className="size-3.5" aria-hidden />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Actions"
            className="mt-[1px] grid size-5 shrink-0 place-items-center rounded-md text-faint outline-none hover:text-foreground"
          >
            <Ellipsis className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {onOpen && (
              <DropdownMenuItem onSelect={() => onOpen(item)}>
                <Maximize2 aria-hidden /> Ouvrir la tâche
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                setOpen(true);
                window.setTimeout(() => addRef.current?.focus(), 80);
              }}
            >
              <Plus aria-hidden /> Ajouter un sous-objectif
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Catégorie</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {CATEGORIES.map((c) => (
                  <DropdownMenuItem key={c.key} disabled={c.key === item.category} onSelect={() => void itemsStore.update(item.id, { category: c.key })}>
                    <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden /> {c.label}
                  </DropdownMenuItem>
                ))}
                {item.category && <DropdownMenuItem onSelect={() => void itemsStore.update(item.id, { category: null })}>Aucune</DropdownMenuItem>}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Priorité</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {(Object.keys(PRIO_LABEL) as Prio[]).map((p) => (
                  <DropdownMenuItem key={p} disabled={p === item.prio} onSelect={() => void itemsStore.update(item.id, { prio: p })}>
                    {PRIO_LABEL[p]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Personne</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {(Object.keys(OWNER_LABEL) as Owner[]).map((o) => (
                  <DropdownMenuItem key={o} disabled={o === item.owner} onSelect={() => void itemsStore.update(item.id, { owner: o })}>
                    <PersonAvatar who={o} size="xs" /> {OWNER_LABEL[o]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Déplacer vers</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuLabel>Horizon</DropdownMenuLabel>
                {moveTargets(today).map(([label, bucket]) => (
                  <DropdownMenuItem
                    key={bucket}
                    disabled={bucket === item.bucket}
                    onSelect={() => {
                      void itemsStore.update(item.id, { bucket, sort_order: Date.now() });
                      kids.forEach((k) => void itemsStore.update(k.id, { bucket }));
                    }}
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[25px] text-[11.5px] text-faint">
        <button
          type="button"
          onClick={() => void itemsStore.update(item.id, { owner: nextOwner(item.owner) })}
          title="Changer la personne"
          aria-label={`Personne : ${OWNER_NAME[item.owner]}. Cliquer pour changer.`}
          className={cn("rounded-md px-1.5 text-[12px] leading-[20px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", OWNER_TONE[item.owner], item.done && "opacity-50")}
        >
          {OWNER_NAME[item.owner]}
        </button>
        {/* Une tâche donnée par l'autre : on le voit tout de suite. */}
        {assigner && (
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 text-[11.5px] leading-[20px] font-medium", item.done ? "text-faint" : "bg-now-soft text-now")} title={`Ajoutée par ${assigner.name}`}>
            <CornerDownRight className="size-3" aria-hidden /> par {assigner.name}
          </span>
        )}
        {category && (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full" style={{ background: category.color }} aria-hidden />
            {category.label}
          </span>
        )}
        {showPrio && !item.done && item.prio !== "normal" && (
          <span className={cn("text-[10.5px] font-semibold tracking-[0.06em] uppercase", item.prio === "urgent" ? "text-bad" : "text-now")}>{item.prio === "urgent" ? "Urgent" : "En cours"}</span>
        )}
        {(item.tags ?? []).map((tag) => (
          <span key={tag} className={cn("rounded-md px-1.5 text-[11px] leading-[19px] font-semibold", item.done && "opacity-60")} style={tagChipStyle(colorOf(tag))}>{tag}</span>
        ))}
        {(showHorizon || late || showLate) && (
          <span className={cn("inline-flex items-center gap-1", late ? "font-semibold text-bad" : "text-muted-foreground")} title="Échéance">
            <CalendarDays className="size-3" aria-hidden />
            <span className="num">{late && "en retard · "}{bucketLabel(item.bucket, today)}</span>
          </span>
        )}
        {item.at_time && <span className="num text-foreground">{item.at_time.replace(":", "h")}</span>}
        {item.repeat_rule && <Repeat className="size-3" aria-label={REPEAT_LABEL[item.repeat_rule]} />}
        {item.meet_url && !item.done && (
          <a href={item.meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-foreground px-1.5 text-[11.5px] leading-[20px] font-semibold text-background">
            <Video className="size-3" aria-hidden /> Meet
          </a>
        )}
        <LinkedSummary itemId={item.id} />
        {kids.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-0.5 rounded transition-colors duration-100 hover:text-foreground"
          >
            <span className="num">{doneKids}/{kids.length}</span>&nbsp;sous-objectifs
            <ChevronDown className={cn("size-3 transition-transform duration-100", open && "rotate-180")} aria-hidden />
          </button>
        )}
        {comments > 0 && onOpen && (
          <button type="button" onClick={() => onOpen(item)} className="inline-flex items-center gap-1 hover:text-foreground">
            <MessageSquare className="size-3" aria-hidden />
            <span className="num">{comments}</span>
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="mt-1.5 flex items-center gap-2 pl-[25px] text-[12px] text-bad" role="alertdialog" aria-label="Confirmer la suppression">
          {kids.length ? `Supprimer avec ses ${kids.length} sous-objectifs ?` : "Supprimer ?"}
          <button type="button" autoFocus onClick={remove} className="rounded-md bg-bad px-2 py-0.5 font-semibold text-white">
            Oui
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-line-strong px-2 py-0.5 text-muted-foreground">
            Non
          </button>
        </div>
      )}

      {open && (
        <div className="mt-1.5 ml-[8px] flex flex-col gap-0.5 border-l border-line pl-[14px]">
          {sorted.map((k) => (
            <div key={k.id} className="group/kid flex items-start gap-2 rounded-md py-[3px] pr-1">
              <Tick small checked={k.done} onChange={() => void toggleDone(k)} label={k.done ? "Marquer comme pas fait" : "Marquer comme fait"} />
              <EditableTitle
                value={k.title}
                done={k.done}
                className="text-[13px] leading-[19px]"
                onSave={(title) => void itemsStore.update(k.id, { title })}
                onEditing={onEditing}
              />
              <button
                type="button"
                aria-label="Supprimer le sous-objectif"
                onClick={() => void itemsStore.remove(k.id)}
                className="mt-[1px] grid size-[18px] shrink-0 place-items-center rounded text-faint opacity-0 transition-opacity duration-100 group-hover/kid:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100"
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
            </div>
          ))}
          <AddLine inputRef={addRef} placeholder="Ajouter un sous-objectif…" onAdd={addKid} small />
        </div>
      )}
    </div>
  );
});

/** Ligne « Ajouter… » en bas d'une colonne ou d'une liste de sous-objectifs. */
export function AddLine({
  onAdd, placeholder = "Ajouter…", inputRef, small, id,
}: {
  onAdd: (title: string) => void;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  small?: boolean;
  id?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", small ? "py-[3px]" : "px-2 py-[7px]")}>
      <span className={cn("shrink-0 rounded-[6px] border-[1.5px] border-dashed border-line-strong", small ? "size-[15px]" : "size-[17px]")} aria-hidden />
      <input
        ref={inputRef}
        id={id}
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            const v = e.currentTarget.value.trim();
            if (v) {
              onAdd(v);
              e.currentTarget.value = "";
            }
          }
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        className={cn("min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint", small && "text-[13px]")}
      />
    </div>
  );
}
