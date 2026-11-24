"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection,
  useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronsRightLeft, GripVertical, Hourglass } from "lucide-react";
import { AddLine, ItemCard } from "@/components/planner/item-card";
import { orderBetween } from "@/lib/items";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ColumnDef = {
  id: string;
  title: ReactNode;
  subtitle?: string;
  /** Colonne « maintenant » : en orange. */
  now?: boolean;
  wide?: boolean;
  /** Tâches de la colonne, déjà triées. */
  items: Item[];
  /** Les N premières tâches sont « en retard » (colonne Aujourd'hui). */
  lateCount?: number;
  onAdd?: (title: string) => void;
  addId?: string;
  /** Bande verticale repliée (Horizons). */
  collapsed?: boolean;
  stripLabel?: string;
  onToggle?: () => void;
  /** Une ligne de séparation dans la colonne (« Plus tard »), placée avant la tâche n° `index`. Elle se glisse comme une tâche. */
  divider?: { label: string; index: number };
  /** Petit point de couleur devant le titre. */
  dot?: string;
  showCount?: boolean;
};

type Props = {
  columns: ColumnDef[];
  kidsOf: Map<string, Item[]>;
  commentsOf?: Map<string, number>;
  showHorizon?: boolean;
  /** Toutes les colonnes tiennent dans la largeur ; sur téléphone elles s'empilent. */
  fit?: boolean;
  /** Une carte a été déposée dans une colonne, à cette position. `below` : sous la ligne de séparation. */
  onDrop: (item: Item, columnId: string, sortOrder: number, below?: boolean) => void;
  /** La ligne de séparation a été déplacée : les tâches au-dessus, les tâches en dessous. */
  onDivide?: (columnId: string, above: Item[], below: Item[]) => void;
  onOpen?: (item: Item) => void;
};

const COL = "col:";
const DIV = "div:";

// On vise d'abord ce qui est sous le pointeur ; une carte l'emporte sur sa colonne.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const list = hits.length ? hits : rectIntersection(args);
  const cards = list.filter((c) => !String(c.id).startsWith(COL));
  return cards.length ? cards : list;
};

export function Board({ columns, kidsOf, commentsOf, showHorizon, fit, onDrop, onDivide, onOpen }: Props) {
  const [active, setActive] = useState<Item | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const index = useMemo(() => {
    const byId = new Map<string, { item: Item; col: string }>();
    columns.forEach((c) => c.items.forEach((item) => byId.set(item.id, { item, col: c.id })));
    return byId;
  }, [columns]);

  const columnOf = (overId: string | number | undefined): string | null => {
    if (overId === undefined) return null;
    const id = String(overId);
    return id.startsWith(COL) ? id.slice(COL.length) : id.startsWith(DIV) ? id.slice(DIV.length) : (index.get(id)?.col ?? null);
  };

  function onDragStart(e: DragStartEvent) {
    setActive(index.get(String(e.active.id))?.item ?? null);
  }
  function onDragOver(e: DragOverEvent) {
    setOverCol(columnOf(e.over?.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    setOverCol(null);
    const activeId = String(e.active.id);
    const colId = columnOf(e.over?.id);
    // La ligne de séparation : on la pose avant ou après la tâche survolée, selon le sens du geste.
    if (activeId.startsWith(DIV)) {
      const col = columns.find((c) => c.id === activeId.slice(DIV.length));
      const hovered = col?.items.findIndex((i) => i.id === String(e.over?.id)) ?? -1;
      if (!col?.divider || colId !== col.id || hovered < 0) return;
      const cut = hovered >= col.divider.index ? hovered + 1 : hovered;
      if (cut !== col.divider.index) onDivide?.(col.id, col.items.slice(0, cut), col.items.slice(cut));
      return;
    }
    const src = index.get(activeId);
    if (!src || !colId || !e.over) return;
    const target = columns.find((c) => c.id === colId);
    if (!target) return;
    if (target.divider) {
      // Lâchée dans le vide de la colonne : on regarde si c'est plus bas que la ligne de séparation.
      const line = document.querySelector(`[data-divider="${target.id}"]`)?.getBoundingClientRect();
      const card = e.active.rect.current.translated;
      const under = Boolean(line && card && card.top + card.height / 2 > line.top);
      return void dropAroundDivider(src, target, String(e.over.id), under);
    }

    // Les tâches faites restent en bas : on range parmi les tâches pas faites.
    const open = target.items.filter((i) => !i.done && i.id !== src.item.id);
    const overId = String(e.over.id);
    let at = open.length;
    if (!overId.startsWith(COL) && overId !== src.item.id) {
      const pos = open.findIndex((i) => i.id === overId);
      if (pos >= 0) {
        // Dans la même colonne, en descendant, on se place après la carte survolée.
        const from = target.items.findIndex((i) => i.id === src.item.id);
        const to = target.items.findIndex((i) => i.id === overId);
        at = src.col === colId && from >= 0 && from < to ? pos + 1 : pos;
      }
    } else if (overId === src.item.id) {
      return;
    }
    if (src.col === colId && overId.startsWith(COL)) return; // lâchée dans le vide de sa propre colonne
    onDrop(src.item, colId, orderBetween(open[at - 1]?.sort_order, open[at]?.sort_order));
  }

  // Colonne coupée en deux par une ligne : la tâche prend la zone (au-dessus ou en dessous) de l'endroit où on la lâche.
  function dropAroundDivider(src: { item: Item; col: string }, target: ColumnDef, overId: string, underLine: boolean) {
    const cut = target.divider!.index;
    const without = (list: Item[]) => list.filter((i) => i.id !== src.item.id);
    const above = without(target.items.slice(0, cut)), under = without(target.items.slice(cut));
    const wasBelow = src.col === target.id && target.items.findIndex((i) => i.id === src.item.id) >= cut;
    let below = false, at = above.length;
    if (overId === src.item.id) return;
    if (overId.startsWith(DIV)) {
      // Sur la ligne elle-même : on la traverse. Venue d'ailleurs, la tâche reste au-dessus.
      below = src.col === target.id && !wasBelow;
      at = below ? 0 : above.length;
    } else if (overId.startsWith(COL)) {
      // Dans le vide : sous la ligne, la tâche part à la fin de « plus tard » ; sinon à la fin du haut.
      below = underLine;
      at = below ? under.length : above.length;
      if (src.col === target.id && wasBelow === below) return;
    } else {
      const from = target.items.findIndex((i) => i.id === src.item.id);
      const to = target.items.findIndex((i) => i.id === overId);
      if (to < 0) return;
      below = to >= cut;
      const zone = below ? under : above;
      const pos = zone.findIndex((i) => i.id === overId);
      at = src.col === target.id && from >= 0 && from < to ? pos + 1 : pos;
    }
    const zone = below ? under : above;
    onDrop(src.item, target.id, orderBetween(zone[at - 1]?.sort_order, zone[at]?.sort_order), below);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActive(null);
        setOverCol(null);
      }}
    >
      <div className={cn("flex min-h-0 flex-1 border-t border-line", fit ? "max-md:flex-col md:overflow-hidden" : "snap-x snap-mandatory overflow-x-auto md:snap-none")}>
        {columns.map((c) =>
          c.collapsed ? (
            <Strip key={c.id} col={c} over={overCol === c.id && active !== null} />
          ) : (
            <Column
              key={c.id}
              col={c}
              fit={fit}
              over={overCol === c.id && active !== null}
              kidsOf={kidsOf}
              commentsOf={commentsOf}
              showHorizon={showHorizon}
              onOpen={onOpen}
            />
          ),
        )}
      </div>
      <DragOverlay dropAnimation={{ duration: 140, easing: "ease-out" }}>
        {active ? (
          <div className="w-[min(320px,80vw)]">
            <ItemCard item={active} kids={kidsOf.get(active.id) ?? []} showHorizon={showHorizon} showPrio={!showHorizon} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  col, over, kidsOf, commentsOf, showHorizon, fit, onOpen,
}: {
  fit?: boolean;
  col: ColumnDef;
  over: boolean;
  kidsOf: Map<string, Item[]>;
  commentsOf?: Map<string, number>;
  showHorizon?: boolean;
  onOpen?: (item: Item) => void;
}) {
  const { setNodeRef } = useDroppable({ id: COL + col.id });
  const late = col.lateCount ?? 0;
  const openCount = col.divider ? col.divider.index : col.items.filter((i) => !i.done).length;
  const ids = col.items.map((i) => i.id);
  if (col.divider) ids.splice(col.divider.index, 0, DIV + col.id);

  return (
    <section
      aria-label={typeof col.title === "string" ? col.title : undefined}
      className={cn(
        "flex min-w-0 shrink-0 snap-start flex-col border-r border-line transition-colors duration-100",
        fit ? "w-full max-md:border-r-0 max-md:border-b md:w-auto md:min-w-0 md:flex-1" : col.wide ? "w-[88vw] md:w-auto md:min-w-[340px] md:max-w-[640px] md:flex-[1_1_420px]" : "w-[82vw] sm:w-[300px]",
        over && "bg-glass",
      )}
    >
      <header className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="min-w-0">
          <h2 className={cn("flex items-center gap-2 leading-tight font-semibold tracking-[-0.01em]", fit ? "text-[16px] xl:text-[19px]" : "text-[19px]", col.now && "text-now")}>
            {col.dot && <span className={cn("size-2 shrink-0 rounded-full", col.dot)} aria-hidden />}
            <span className="truncate">{col.title}</span>
            {col.showCount && <span className="num text-[12px] font-medium text-faint">{openCount}</span>}
          </h2>
          {col.subtitle && <p className={cn("mt-0.5 truncate text-[13px]", col.now ? "text-now/80" : "text-muted-foreground")}>{col.subtitle}</p>}
        </div>
        {col.onToggle && (
          <button
            type="button"
            onClick={col.onToggle}
            aria-label="Replier la colonne"
            title="Replier"
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-faint transition-colors duration-100 hover:bg-accent hover:text-foreground"
          >
            <ChevronsRightLeft className="size-3.5" aria-hidden />
          </button>
        )}
      </header>
      <div ref={setNodeRef} className={cn("flex flex-1 flex-col gap-px px-2", fit ? "min-h-[72px] pb-4 md:min-h-[140px] md:overflow-y-auto md:pb-10" : "min-h-[140px] overflow-y-auto pb-10")}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {col.items.map((item, i) => (
            <div key={item.id} className="contents">
              {col.divider && i === col.divider.index && (
                <>
                  {col.onAdd && <AddLine onAdd={col.onAdd} id={col.addId} />}
                  <Divider id={DIV + col.id} col={col.id} label={col.divider.label} count={col.items.length - col.divider.index} />
                </>
              )}
              {late > 0 && i === 0 && (
                <p className="px-2 pt-1 pb-0.5 text-[11px] font-semibold tracking-[0.08em] text-bad uppercase">
                  En retard · <span className="num">{late}</span>
                </p>
              )}
              {late > 0 && i === late && (
                <p className="px-2 pt-2.5 pb-0.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">Aujourd&apos;hui</p>
              )}
              <SortableCard
                item={item}
                muted={Boolean(col.divider && i >= col.divider.index)}
                columnId={col.id}
                kids={kidsOf.get(item.id) ?? []}
                comments={commentsOf?.get(item.id) ?? 0}
                showHorizon={showHorizon}
                onOpen={onOpen}
              />
            </div>
          ))}
          {col.divider && col.divider.index >= col.items.length && (
            <>
              {col.onAdd && <AddLine onAdd={col.onAdd} id={col.addId} />}
              <Divider id={DIV + col.id} col={col.id} label={col.divider.label} count={0} />
            </>
          )}
        </SortableContext>
        {col.onAdd && !col.divider && <AddLine onAdd={col.onAdd} id={col.addId} />}
      </div>
    </section>
  );
}

/** La ligne « Plus tard » : elle se glisse comme une tâche, et tout ce qui est dessous est remis à plus tard. */
function Divider({ id, col, label, count }: { id: string; col: string; label: string; count: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-divider={col}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group/div mt-3 mb-1 flex h-9 shrink-0 cursor-grab touch-manipulation items-center gap-2 rounded-lg border border-line-strong bg-muted px-2.5 outline-none select-none transition-colors duration-100 hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing", isDragging && "relative z-10 border-foreground/60 shadow-lg")}
      {...attributes}
      {...listeners}
      role="separator"
      aria-roledescription="séparation déplaçable"
      aria-label={`${label} : ${count} tâche${count > 1 ? "s" : ""} en dessous`}
      title="Glisse cette ligne, ou une tâche de part et d'autre"
    >
      <Hourglass className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-[12.5px] font-semibold whitespace-nowrap">{label}</span>
      <span className="num text-[12px] text-muted-foreground">{count}</span>
      <GripVertical className="ml-auto size-3.5 shrink-0 text-faint transition-colors duration-100 group-hover/div:text-muted-foreground" aria-hidden />
    </div>
  );
}

function SortableCard({
  item, columnId, kids, comments, showHorizon, onOpen, muted,
}: {
  /** Sous la ligne « Plus tard » : la carte s'efface un peu. */
  muted?: boolean;
  item: Item;
  columnId: string;
  kids: Item[];
  comments: number;
  showHorizon?: boolean;
  onOpen?: (item: Item) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { columnId },
    disabled: editing,
  });
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation rounded-[10px] outline-none transition-opacity duration-100 focus-visible:ring-2 focus-visible:ring-ring", muted && "opacity-55 hover:opacity-100 focus-within:opacity-100", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
      role="group"
      aria-roledescription="tâche déplaçable"
    >
      <ItemCard item={item} kids={kids} comments={comments} showHorizon={showHorizon} showPrio={!showHorizon} onEditing={setEditing} onOpen={onOpen} />
    </div>
  );
}

/** Bande verticale repliée (Inbox, Semaine, Mois, Année, Vie). On peut y déposer une carte. */
function Strip({ col, over }: { col: ColumnDef; over: boolean }) {
  const { setNodeRef } = useDroppable({ id: COL + col.id });
  const count = col.items.filter((i) => !i.done).length;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={col.onToggle}
      title={`Ouvrir ${col.stripLabel ?? ""}`}
      aria-label={`Ouvrir la colonne ${col.stripLabel ?? ""}${count ? `, ${count} tâches` : ""}`}
      className={cn(
        "flex w-[46px] shrink-0 snap-start flex-col items-center justify-center gap-3 border-r border-line text-muted-foreground transition-colors duration-100 hover:bg-glass hover:text-foreground",
        over && "bg-now-soft text-now",
      )}
    >
      <span className="rotate-180 text-[12px] font-semibold tracking-[0.14em] uppercase [writing-mode:vertical-rl]">{col.stripLabel}</span>
      <span className="num text-[11px] text-faint">{count || ""}</span>
    </button>
  );
}
