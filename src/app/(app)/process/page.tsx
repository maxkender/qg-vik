"use client";

import { useMemo, useState } from "react";
import { MotionConfig } from "motion/react";
import { ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Panel } from "@/components/dashboard/charts";
import { ProcessFlow, ProcessList } from "@/components/process/flow";
import { processesStore, routinesStore } from "@/lib/data";
import { useRows } from "@/lib/store";
import type { Routine } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const WHO_BAR: Record<Routine["who"], string> = {
  max: "border-l-max",
  adrien: "border-l-adrien",
  os: "border-l-info",
  both: "border-l-both",
};
const LEGEND: [string, string][] = [
  ["bg-max", "Max"],
  ["bg-adrien", "Adrien"],
  ["bg-info", "OS (automatique)"],
  ["bg-both", "Les deux"],
];

function Chip({ r }: { r: Routine }) {
  return (
    <div className={cn("rounded-lg border-l-[3px] bg-muted px-2.5 py-1.5 text-[12.5px] leading-snug", WHO_BAR[r.who])}>
      {r.title}
      {r.sub && <span className="mt-0.5 block text-[11px] text-muted-foreground">{r.sub}</span>}
    </div>
  );
}

export default function ProcessPage() {
  const { today } = useView();
  const routines = useRows(routinesStore);
  const processesRaw = useRows(processesStore);
  const processes = useMemo(() => [...processesRaw].sort((a, b) => a.sort_order - b.sort_order), [processesRaw]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = processes.find((p) => p.id === picked) ?? processes[0];

  const sorted = useMemo(() => [...routines].sort((a, b) => a.sort_order - b.sort_order), [routines]);
  const todayIdx = (today.getDay() + 6) % 7; // 0 = lundi

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ViewHeader title="Process" />
        <div className="flex min-w-0 flex-col gap-3 px-4 pb-16 md:px-6 [&>*]:min-w-0">
          {/* ------------------------------------------------ la semaine type */}
          <h2 className="text-[20px] font-semibold">La semaine type</h2>
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <div className="grid min-w-[1080px] grid-cols-7 gap-2 md:min-w-[860px]">
              {DAY_NAMES.map((name, i) => (
                <div key={name} className={cn("glass flex min-h-[120px] flex-col gap-1.5 rounded-xl p-2.5", i === todayIdx && "border-now/60")}>
                  <p className={cn("text-[13px] font-semibold", i === todayIdx && "text-now")}>{name}</p>
                  {sorted.filter((r) => r.day === i + 1).map((r) => (
                    <Chip key={r.id} r={r} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            <span className="self-center pr-1 text-[12.5px] text-muted-foreground">Tous les jours :</span>
            {sorted.filter((r) => r.day === null).map((r) => (
              <Chip key={r.id} r={r} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {LEGEND.map(([tone, label]) => (
              <li key={label} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-[3px]", tone)} aria-hidden />
                {label}
              </li>
            ))}
          </ul>

          {/* ---------------------------------------------- comment ça marche */}
          <h2 className="mt-6 text-[20px] font-semibold">Comment ça marche</h2>
          <div role="tablist" aria-label="Process" className="flex flex-wrap gap-1.5">
            {processes.map((p, i) => (
              <button
                key={p.id}
                role="tab"
                type="button"
                aria-selected={current?.id === p.id}
                onClick={() => setPicked(p.id)}
                className={cn(
                  "h-9 rounded-xl border px-3 text-[13px] font-medium transition-colors duration-100",
                  current?.id === p.id ? "border-line-strong bg-accent text-foreground" : "border-line text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="num mr-1.5 text-faint">{i + 1}</span>
                {p.title}
              </button>
            ))}
          </div>

          {current && (
            <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
              <Panel title={current.title} caption={current.meta}>
                <div className="hidden md:block">
                  <ProcessFlow process={current} />
                </div>
                <div className="md:hidden">
                  <ProcessList process={current} />
                </div>
              </Panel>
              {current.rules.length > 0 && (
                <Panel title="Règles à retenir">
                  <dl className="flex flex-col gap-3 text-[13px]">
                    {current.rules.map(([k, v]) => (
                      <div key={k}>
                        <dt className="font-semibold">{k}</dt>
                        <dd className="text-muted-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
              )}
            </div>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
