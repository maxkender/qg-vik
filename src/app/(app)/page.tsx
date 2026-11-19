"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { WhoSwitch, ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Board, type ColumnDef } from "@/components/planner/board";
import { QuickAdd, useQuickCreate } from "@/components/planner/quick-add";
import { TodayRoutines } from "@/components/planner/routines";
import { usePlanner } from "@/components/planner/use-planner";
import { useMe } from "@/components/session-provider";
import { CATEGORIES, type Category } from "@/lib/categories";
import { itemsStore } from "@/lib/data";
import { dayKey, isLate, weekKey } from "@/lib/dates";
import type { Item, Prio } from "@/lib/types";

type When = "all" | "today" | "week" | "late" | "nodate";
const WHEN: [When, string][] = [["all", "Toutes les échéances"], ["today", "Aujourd'hui et en retard"], ["week", "Cette semaine"], ["late", "En retard"], ["nodate", "Sans date"]];

const COLUMNS: { prio: Prio; title: string; dot: string }[] = [
  { prio: "urgent", title: "Urgent", dot: "bg-bad" },
  { prio: "normal", title: "À faire", dot: "bg-info" },
  { prio: "later", title: "Plus tard", dot: "bg-faint" },
];

// Écran d'accueil : trois colonnes de priorité.
export default function TodoPage() {
  const me = useMe();
  const { today, setOpenItem } = useView();
  const { all, roots, kidsOf, commentsOf } = usePlanner();
  const create = useQuickCreate();

  const [q, setQ] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [cat, setCat] = useState<Category | "all">("all");
  const open = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const todayKey = dayKey(today);
    const week = weekKey(today);
    return roots.filter((i) => {
      if (i.done) return false;
      if (cat !== "all" && i.category !== cat) return false;
      if (needle && !`${i.title} ${i.notes ?? ""}`.toLowerCase().includes(needle)) return false;
      if (when === "late") return isLate(i.bucket, today);
      if (when === "today") return i.bucket === todayKey || isLate(i.bucket, today);
      if (when === "week") return i.bucket === week || (i.bucket.startsWith("d:") && weekKey(new Date(i.bucket.slice(2) + "T12:00:00")) === week);
      if (when === "nodate") return i.bucket === "inbox";
      return true;
    });
  }, [roots, q, when, cat, today]);
  const filtered = q.trim() !== "" || when !== "all" || cat !== "all";
  // Le « Salut » parle toujours de mes tâches, quel que soit le filtre.
  const mine = useMemo(
    () => all.filter((i) => !i.parent_id && !i.done && (i.owner === me.short || i.owner === "both")),
    [all, me.short],
  );
  const myUrgent = mine.filter((i) => i.prio === "urgent").length;

  const columns: ColumnDef[] = COLUMNS.map((c) => ({
    id: c.prio,
    title: c.title,
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
      >
        <WhoSwitch className="w-[220px] max-md:w-full" />
      </ViewHeader>
      <div className="flex shrink-0 flex-col gap-2 px-4 pb-4 md:px-6">
        <TodayRoutines />
        <QuickAdd />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-0 flex-[1_1_200px] items-center gap-2 rounded-lg border border-line bg-glass px-2.5 focus-within:border-line-strong">
            <Search className="size-3.5 shrink-0 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Filtrer…" aria-label="Filtrer les tâches" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          </label>
          <select value={cat} onChange={(e) => setCat(e.target.value as Category | "all")} aria-label="Catégorie" className="h-9 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none focus:border-line-strong">
            <option value="all">Toutes les catégories</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <select value={when} onChange={(e) => setWhen(e.target.value as When)} aria-label="Échéance" className="h-9 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none focus:border-line-strong">
            {WHEN.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          {filtered && (
            <button type="button" onClick={() => { setQ(""); setWhen("all"); setCat("all"); }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[12.5px] text-muted-foreground hover:text-foreground">
              <X className="size-3.5" aria-hidden /> Effacer · <span className="num">{open.length}</span> tâche{open.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
      <Board columns={columns} kidsOf={kidsOf} commentsOf={commentsOf} showHorizon onDrop={onDrop} onOpen={(i) => setOpenItem(i.id)} />
    </>
  );
}
