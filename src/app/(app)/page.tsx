"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Plus, Search, X } from "lucide-react";
import { WhoSwitch, ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Board, type ColumnDef } from "@/components/planner/board";
import { useQuickCreate } from "@/components/planner/quick-add";
import { usePlanner } from "@/components/planner/use-planner";
import { useMe } from "@/components/session-provider";
import { CATEGORIES, type Category } from "@/lib/categories";
import { itemsStore } from "@/lib/data";
import { dayKey, isLate, weekKey } from "@/lib/dates";
import { allTags } from "@/lib/items";
import type { Item, Prio } from "@/lib/types";

type When = "all" | "today" | "week" | "late" | "nodate";
const WHEN: [When, string][] = [["all", "Toutes les échéances"], ["today", "Aujourd'hui et en retard"], ["week", "Cette semaine"], ["late", "En retard"], ["nodate", "Sans date"]];
const DONE = "done";

const COLUMNS: { prio: Prio; title: string; dot: string }[] = [
  { prio: "urgent", title: "Urgent", dot: "bg-bad" },
  { prio: "doing", title: "En train de faire", dot: "bg-now" },
  { prio: "normal", title: "À faire", dot: "bg-info" },
];
const select = "h-9 min-w-0 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none focus:border-line-strong";

// Écran d'accueil : Urgent, En train de faire, À faire, et ce qui a été fait aujourd'hui.
export default function TodoPage() {
  const me = useMe();
  const { today, setOpenItem, setQuickAddOpen } = useView();
  const { all, roots, kidsOf, commentsOf } = usePlanner();
  const create = useQuickCreate();

  const [q, setQ] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [cat, setCat] = useState<Category | "all">("all");
  const [tag, setTag] = useState("all");
  const tags = useMemo(() => allTags(all), [all]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const todayKey = dayKey(today);
    const week = weekKey(today);
    return roots.filter((i) => {
      // Une tâche faite reste visible le jour même, puis part aux archives.
      if (i.done && (!i.done_at || new Date(i.done_at) < today)) return false;
      if (cat !== "all" && i.category !== cat) return false;
      if (tag !== "all" && !(i.tags ?? []).includes(tag)) return false;
      if (needle && !`${i.title} ${i.notes ?? ""} ${(i.tags ?? []).join(" ")}`.toLowerCase().includes(needle)) return false;
      if (i.done) return true;
      if (when === "late") return isLate(i.bucket, today);
      if (when === "today") return i.bucket === todayKey || isLate(i.bucket, today);
      if (when === "week") return i.bucket === week || (i.bucket.startsWith("d:") && weekKey(new Date(i.bucket.slice(2) + "T12:00:00")) === week);
      if (when === "nodate") return i.bucket === "inbox";
      return true;
    });
  }, [roots, q, when, cat, tag, today]);
  const open = shown.filter((i) => !i.done);
  const done = shown.filter((i) => i.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const filtered = q.trim() !== "" || when !== "all" || cat !== "all" || tag !== "all";
  // Le « Salut » parle toujours de mes tâches, quel que soit le filtre.
  const mine = useMemo(() => all.filter((i) => !i.parent_id && !i.done && (i.owner === me.short || i.owner === "both")), [all, me.short]);
  const myUrgent = mine.filter((i) => i.prio === "urgent").length;

  const todo = open.filter((i) => i.prio !== "urgent" && i.prio !== "doing" && i.prio !== "later");
  const later = open.filter((i) => i.prio === "later");

  const columns: ColumnDef[] = [
    ...COLUMNS.map((c) => ({
      id: c.prio as string,
      title: c.title,
      dot: c.dot,
      showCount: true,
      // « À faire » recueille aussi toute tâche dont la priorité ne correspond à aucune colonne,
      // puis, sous la ligne « Plus tard », celles qu'on a repoussées.
      items: c.prio === "normal" ? [...todo, ...later] : open.filter((i) => i.prio === c.prio),
      ...(c.prio === "normal" ? { divider: { label: "Plus tard", index: todo.length } } : {}),
      onAdd: (text: string) => void create(text, { prio: c.prio }),
      addId: `add-${c.prio}`,
    })),
    { id: DONE, title: "Fait aujourd'hui", dot: "bg-good", items: done },
  ];

  // La ligne « Plus tard » a été déplacée : ce qui est passé dessous devient « plus tard », ce qui est repassé dessus redevient « à faire ».
  function onDivide(_columnId: string, above: Item[], below: Item[]) {
    above.filter((i) => i.prio === "later").forEach((i) => void itemsStore.update(i.id, { prio: "normal" }));
    below.filter((i) => i.prio !== "later").forEach((i) => void itemsStore.update(i.id, { prio: "later" }));
  }

  function onDrop(item: Item, columnId: string, sortOrder: number, below?: boolean) {
    // Déposer dans « Fait aujourd'hui » coche la tâche ; l'en sortir la rouvre.
    if (columnId === DONE) return void (!item.done && itemsStore.update(item.id, { done: true, done_at: new Date().toISOString() }));
    void itemsStore.update(item.id, { prio: below ? "later" : (columnId as Prio), sort_order: sortOrder, ...(item.done ? { done: false, done_at: null } : {}) });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ViewHeader
        eyebrow={
          <>
            Salut {me.nick} · <span className="text-now">{myUrgent} urgent{myUrgent > 1 ? "s" : ""}</span> pour toi,{" "}
            <span className="num">{mine.length}</span> en tout
          </>
        }
        title="À faire"
      >
        <Link href="/archives" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground">
          <Archive className="size-3.5" aria-hidden /> Archives
        </Link>
        <WhoSwitch className="w-[220px] max-md:flex-1" />
        <button type="button" onClick={() => setQuickAddOpen(true)} aria-label="Nouvelle tâche" title="Nouvelle tâche (N)" className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity duration-100 hover:opacity-85">
          <Plus className="size-4" aria-hidden />
        </button>
      </ViewHeader>
      <div className="flex shrink-0 flex-col gap-2 px-4 pb-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-0 flex-[1_1_160px] items-center gap-2 rounded-lg border border-line bg-glass px-2.5 focus-within:border-line-strong">
            <Search className="size-3.5 shrink-0 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Filtrer…" aria-label="Filtrer les tâches" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          </label>
          <select value={cat} onChange={(e) => setCat(e.target.value as Category | "all")} aria-label="Catégorie" className={select}>
            <option value="all">Toutes les catégories</option>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Label" className={select}>
            <option value="all">Tous les labels</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={when} onChange={(e) => setWhen(e.target.value as When)} aria-label="Échéance" className={select}>
            {WHEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {filtered && (
            <button type="button" onClick={() => { setQ(""); setWhen("all"); setCat("all"); setTag("all"); }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[12.5px] text-muted-foreground hover:text-foreground">
              <X className="size-3.5" aria-hidden /> Effacer · <span className="num">{open.length}</span> tâche{open.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
      {/* Sur un écran bas, le tableau garde une hauteur utile et c'est la page qui défile. */}
      <div className="flex flex-col md:min-h-[440px] md:flex-1">
        <Board columns={columns} kidsOf={kidsOf} commentsOf={commentsOf} showHorizon fit onDrop={onDrop} onDivide={onDivide} onOpen={(i) => setOpenItem(i.id)} />
      </div>
    </div>
  );
}
