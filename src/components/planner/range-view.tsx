"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Board, type ColumnDef } from "@/components/planner/board";
import { useQuickCreate } from "@/components/planner/quick-add";
import { moveToBucket, usePlanner } from "@/components/planner/use-planner";
import { DAYS, MONTHS, addDays, addMonths, cap, dayKey, isoWeek, monday, monthKey, weekKey, weekRange } from "@/lib/dates";
import type { Item } from "@/lib/types";

export type RangeKind = "jours" | "semaines" | "mois" | "annees";
const TITLES: Record<RangeKind, string> = { jours: "Jours", semaines: "Semaines", mois: "Mois", annees: "Années" };
// Nombre de colonnes dont on avance à chaque clic sur ‹ ou ›.
const STEP: Record<RangeKind, number> = { jours: 7, semaines: 6, mois: 6, annees: 5 };

type Slot = { bucket: string; title: string; subtitle?: string; now: boolean };

function slots(kind: RangeKind, today: Date, offset: number): Slot[] {
  const out: Slot[] = [];
  const shift = offset * STEP[kind];
  if (kind === "jours") {
    for (let i = -1; i < 8; i++) {
      const d = addDays(today, i + shift);
      const bucket = dayKey(d);
      out.push({ bucket, title: cap(DAYS[d.getDay()]), subtitle: `${d.getDate()} ${MONTHS[d.getMonth()]}`, now: bucket === dayKey(today) });
    }
  } else if (kind === "semaines") {
    for (let i = -1; i < 7; i++) {
      const m = addDays(monday(today), (i + shift) * 7);
      const bucket = weekKey(m);
      const [y, w] = isoWeek(m);
      out.push({ bucket, title: `S${w}, ${y}`, subtitle: weekRange(m), now: bucket === weekKey(today) });
    }
  } else if (kind === "mois") {
    for (let i = -1; i < 7; i++) {
      const d = addMonths(today, i + shift);
      const bucket = monthKey(d);
      out.push({ bucket, title: cap(MONTHS[d.getMonth()]), subtitle: String(d.getFullYear()), now: bucket === monthKey(today) });
    }
  } else {
    for (let i = -1; i < 6; i++) {
      const y = today.getFullYear() + i + shift;
      out.push({ bucket: `y:${y}`, title: String(y), now: y === today.getFullYear() });
    }
    out.push({ bucket: "life", title: "Vie", subtitle: "Le long terme", now: false });
  }
  return out;
}

/** Jours, Semaines, Mois, Années : des colonnes de temps qui défilent, celle en cours en orange. */
export function RangeView({ kind }: { kind: RangeKind }) {
  const { today, setOpenItem } = useView();
  const { kidsOf, commentsOf, inBucket } = usePlanner();
  const create = useQuickCreate();
  const [offset, setOffset] = useState(0);

  const columns: ColumnDef[] = slots(kind, today, offset).map((s) => ({
    id: s.bucket,
    title: s.title,
    subtitle: s.subtitle,
    now: s.now,
    items: inBucket(s.bucket),
    onAdd: (text) => void create(text, { bucket: s.bucket }),
  }));

  function onDrop(item: Item, bucket: string, sortOrder: number) {
    moveToBucket(item, bucket, sortOrder, kidsOf.get(item.id) ?? []);
  }

  const btn = "grid h-[26px] place-items-center rounded-[7px] text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground";
  return (
    <>
      <ViewHeader title={TITLES[kind]}>
        <div className="flex items-center rounded-[10px] border border-line bg-glass p-[3px]">
          <button type="button" aria-label="Précédent" onClick={() => setOffset((o) => o - 1)} className={`${btn} w-7`}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setOffset(0)} disabled={offset === 0} className={`${btn} px-2.5 text-[12.5px] font-medium disabled:opacity-50`}>
            Aujourd&apos;hui
          </button>
          <button type="button" aria-label="Suivant" onClick={() => setOffset((o) => o + 1)} className={`${btn} w-7`}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </ViewHeader>
      <Board columns={columns} kidsOf={kidsOf} commentsOf={commentsOf} onDrop={onDrop} onOpen={(i) => setOpenItem(i.id)} />
    </>
  );
}
