"use client";

import { useMemo, useState } from "react";
import { ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Board, type ColumnDef } from "@/components/planner/board";
import { useQuickCreate } from "@/components/planner/quick-add";
import { moveToBucket, usePlanner } from "@/components/planner/use-planner";
import { MONTHS, bucketRank, cap, dayKey, isLate, isoWeek, monday, monthKey, weekKey, weekRange, yearKey } from "@/lib/dates";
import type { Item } from "@/lib/types";

type StripKey = "inbox" | "week" | "month" | "year" | "life";
const DEFAULT_OPEN: Record<StripKey, boolean> = { inbox: true, week: true, month: false, year: false, life: false };
const KEY = "qg-horizons";

// Comme Timestripe : Aujourd'hui en grand, puis des bandes qu'on ouvre.
export default function HorizonsPage() {
  const { today, setOpenItem } = useView();
  const { roots, kidsOf, commentsOf, inBucket } = usePlanner();
  const create = useQuickCreate();
  // Page rendue uniquement dans le navigateur : on peut relire le choix gardé sur l'appareil.
  const [open, setOpen] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved) return { ...DEFAULT_OPEN, ...saved } as Record<StripKey, boolean>;
    } catch {}
    return DEFAULT_OPEN;
  });
  function toggle(k: StripKey) {
    setOpen((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const todayKey = dayKey(today);
  const late = useMemo(
    () => roots.filter((i) => !i.done && isLate(i.bucket, today)).sort((a, b) => bucketRank(a.bucket) - bucketRank(b.bucket)),
    [roots, today],
  );

  const strips: { key: StripKey; bucket: string; label: string; title: string; sub?: string }[] = [
    { key: "inbox", bucket: "inbox", label: "Inbox", title: "Inbox", sub: "À trier" },
    { key: "week", bucket: weekKey(today), label: "Semaine", title: "Cette semaine", sub: `S${isoWeek(today)[1]} · ${weekRange(monday(today))}` },
    { key: "month", bucket: monthKey(today), label: "Mois", title: "Ce mois", sub: `${cap(MONTHS[today.getMonth()])} ${today.getFullYear()}` },
    { key: "year", bucket: yearKey(today), label: "Année", title: "Cette année", sub: String(today.getFullYear()) },
    { key: "life", bucket: "life", label: "Vie", title: "Vie", sub: "Le long terme" },
  ];

  const columns: ColumnDef[] = [
    {
      id: todayKey,
      title: "Aujourd'hui",
      subtitle: `${today.getDate()} ${MONTHS[today.getMonth()]}`,
      now: true,
      wide: true,
      items: [...late, ...inBucket(todayKey)],
      lateCount: late.length,
      onAdd: (text) => void create(text, { bucket: todayKey }),
      addId: "add-today",
    },
    ...strips.map((s) => ({
      id: s.bucket,
      title: s.title,
      subtitle: s.sub,
      items: inBucket(s.bucket),
      collapsed: !open[s.key],
      stripLabel: s.label,
      onToggle: () => toggle(s.key),
      onAdd: (text: string) => void create(text, { bucket: s.bucket }),
    })),
  ];

  function onDrop(item: Item, bucket: string, sortOrder: number) {
    moveToBucket(item, bucket, sortOrder, kidsOf.get(item.id) ?? []);
  }

  return (
    <>
      <ViewHeader title="Horizons" sub="Clique sur une bande pour l'ouvrir. Glisse une tâche d'une colonne à l'autre." />
      <Board columns={columns} kidsOf={kidsOf} commentsOf={commentsOf} onDrop={onDrop} onOpen={(i) => setOpenItem(i.id)} />
    </>
  );
}
