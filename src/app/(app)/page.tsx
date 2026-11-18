"use client";

import { useMemo } from "react";
import { WhoSwitch, ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Board, type ColumnDef } from "@/components/planner/board";
import { QuickAdd, useQuickCreate } from "@/components/planner/quick-add";
import { usePlanner } from "@/components/planner/use-planner";
import { useMe } from "@/components/session-provider";
import { itemsStore } from "@/lib/data";
import type { Item, Prio } from "@/lib/types";

const COLUMNS: { prio: Prio; title: string; sub: string; dot: string }[] = [
  { prio: "urgent", title: "Urgent", sub: "Ce qui doit partir aujourd'hui ou demain", dot: "bg-bad" },
  { prio: "normal", title: "À faire", sub: "Cette semaine, sans urgence", dot: "bg-info" },
  { prio: "later", title: "Plus tard", sub: "Quand on aura le temps", dot: "bg-faint" },
];

// Écran d'accueil : trois colonnes de priorité.
export default function TodoPage() {
  const me = useMe();
  const { who } = useView();
  const { all, roots, kidsOf, commentsOf } = usePlanner();
  const create = useQuickCreate();

  const open = useMemo(() => roots.filter((i) => !i.done), [roots]);
  // Le « Salut » parle toujours de mes tâches, quel que soit le filtre.
  const mine = useMemo(
    () => all.filter((i) => !i.parent_id && !i.done && (i.owner === me.short || i.owner === "both")),
    [all, me.short],
  );
  const myUrgent = mine.filter((i) => i.prio === "urgent").length;

  const columns: ColumnDef[] = COLUMNS.map((c) => ({
    id: c.prio,
    title: c.title,
    subtitle: c.sub,
    dot: c.dot,
    showCount: true,
    wide: true,
    items: open.filter((i) => i.prio === c.prio),
    onAdd: (text) => void create(text, { prio: c.prio }),
    addId: `add-${c.prio}`,
  }));

  function onDrop(item: Item, columnId: string, sortOrder: number) {
    void itemsStore.update(item.id, { prio: columnId as Prio, sort_order: sortOrder });
  }

  return (
    <>
      <ViewHeader
        eyebrow={
          <>
            Salut {me.nick} · <span className="text-now">{myUrgent} urgent{myUrgent > 1 ? "s" : ""}</span> pour toi,{" "}
            <span className="num">{mine.length}</span> en tout
          </>
        }
        title="À faire"
        sub={who === "all" ? "Toutes les tâches. Glisse une carte pour changer sa priorité." : "Glisse une carte d'une colonne à l'autre pour changer sa priorité."}
      >
        <WhoSwitch className="w-[220px]" />
      </ViewHeader>
      <div className="shrink-0 px-4 pb-4 md:px-6">
        <QuickAdd />
      </div>
      <Board columns={columns} kidsOf={kidsOf} commentsOf={commentsOf} showHorizon onDrop={onDrop} />
    </>
  );
}
