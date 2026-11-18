"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection,
  useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronsRightLeft } from "lucide-react";
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
  /** Petit point de couleur devant le titre. */
  dot?: string;
  showCount?: boolean;
};

type Props = {
  columns: ColumnDef[];
  kidsOf: Map<string, Item[]>;
  commentsOf?: Map<string, number>;
  showHorizon?: boolean;
  /** Une carte a été déposée dans une colonne, à cette position. */
  onDrop: (item: Item, columnId: string, sortOrder: number) => void;
  onOpen?: (item: Item) => void;
};

const COL = "col:";

// On vise d'abord ce qui est sous le pointeur ; une carte l'emporte sur sa colonne.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const list = hits.length ? hits : rectIntersection(args);
  const cards = list.filter((c) => !String(c.id).startsWith(COL));
  return cards.length ? cards : list;
};

export function Board({ columns, kidsOf, commentsOf, showHorizon, onDrop, onOpen }: Props) {
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
    return id.startsWith(COL) ? id.slice(COL.length) : (index.get(id)?.col ?? null);
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
    const src = index.get(String(e.active.id));
    const colId = columnOf(e.over?.id);
    if (!src || !colId || !e.over) return;
    const target = columns.find((c) => c.id === colId);
    if (!target) return;

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
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto border-t border-line md:snap-none">
        {columns.map((c) =>
          c.collapsed ? (
            <Strip key={c.id} col={c} over={overCol === c.id && active !== null} />
          ) : (
            <Column
              key={c.id}
              col={c}
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
            <ItemCard item={active} kids={kidsOf.get(active.id) ?? []} showHorizon={showHorizon} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  col, over, kidsOf, commentsOf, showHorizon, onOpen,
}: {
  col: ColumnDef;
  over: boolean;
  kidsOf: Map<string, Item[]>;
  commentsOf?: Map<string, number>;
  showHorizon?: boolean;
  onOpen?: (item: Item) => void;
}) {
  const { setNodeRef } = useDroppable({ id: COL + col.id });
  const late = col.lateCount ?? 0;
  const openCount = col.items.filter((i) => !i.done).length;

  return (
    <section
      aria-label={typeof col.title === "string" ? col.title : undefined}
      className={cn(
        "flex min-w-0 shrink-0 snap-start flex-col border-r border-line transition-colors duration-100",
        col.wide ? "w-[88vw] md:w-auto md:min-w-[340px] md:max-w-[640px] md:flex-[1_1_420px]" : "w-[82vw] sm:w-[300px]",
        over && "bg-glass",
      )}
    >
      <header className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="min-w-0">
          <h2 className={cn("flex items-center gap-2 text-[19px] leading-tight font-semibold tracking-[-0.01em]", col.now && "text-now")}>
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
      <div ref={setNodeRef} className="flex min-h-[140px] flex-1 flex-col gap-px overflow-y-auto px-2 pb-10">
        <SortableContext items={col.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {col.items.map((item, i) => (
            <div key={item.id} className="contents">
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
                columnId={col.id}
                kids={kidsOf.get(item.id) ?? []}
                comments={commentsOf?.get(item.id) ?? 0}
                showHorizon={showHorizon}
                onOpen={onOpen}
              />
            </div>
          ))}
        </SortableContext>
        {col.onAdd && <AddLine onAdd={col.onAdd} id={col.addId} />}
      </div>
    </section>
  );
}

function SortableCard({
  item, columnId, kids, comments, showHorizon, onOpen,
}: {
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
      className={cn("touch-manipulation rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
      role="group"
      aria-roledescription="tâche déplaçable"
    >
      <ItemCard item={item} kids={kids} comments={comments} showHorizon={showHorizon} onEditing={setEditing} onOpen={onOpen} />
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
