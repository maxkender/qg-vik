"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { ViewHeader, WhoSwitch } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { categoryOf } from "@/lib/categories";
import { itemsStore } from "@/lib/data";
import { cap, isoDate, longDate } from "@/lib/dates";
import { OWNER_NAME, toggleDone } from "@/lib/items";
import { useRows } from "@/lib/store";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE = { max: "bg-max-soft text-max", adrien: "bg-adrien-soft text-adrien", both: "bg-both-soft text-both" } as const;

// Toutes les tâches faites, de la plus récente à la plus ancienne. On peut en remettre une à faire.
export default function ArchivesPage() {
  const { sees, today, setOpenItem } = useView();
  const items = useRows(itemsStore);
  const [q, setQ] = useState("");

  const days = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const done = items
      .filter((i) => i.done && !i.parent_id && sees(i.owner) && (!needle || `${i.title} ${i.notes ?? ""} ${(i.tags ?? []).join(" ")}`.toLowerCase().includes(needle)))
      .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
    const groups = new Map<string, Item[]>();
    for (const i of done) {
      const key = i.done_at ? isoDate(new Date(i.done_at)) : "";
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    return { total: done.length, groups: [...groups.entries()] };
  }, [items, sees, q]);

  const label = (key: string) => {
    if (!key) return "Date inconnue";
    if (key === isoDate(today)) return "Aujourd'hui";
    const d = new Date(`${key}T12:00:00`);
    return cap(longDate(d)) + (d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : "");
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Archives" eyebrow={<><span className="num">{days.total}</span> tâche{days.total > 1 ? "s" : ""} faite{days.total > 1 ? "s" : ""}</>}>
        <WhoSwitch className="w-[220px] max-md:w-full" />
      </ViewHeader>
      <div className="mx-auto flex max-w-[860px] flex-col gap-3 px-4 pb-24 md:px-6">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-glass px-2.5 focus-within:border-line-strong">
          <Search className="size-3.5 shrink-0 text-faint" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Chercher dans les archives…" aria-label="Chercher dans les archives" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
        </label>
        {days.total === 0 && itemsStore.loaded && <p className="py-10 text-center text-[13.5px] text-muted-foreground">Aucune tâche faite pour l&apos;instant.</p>}
        {days.groups.map(([key, list]) => (
          <section key={key} className="glass rounded-2xl p-4 sm:p-5">
            <h2 className="font-sans text-[14.5px] font-semibold tracking-normal">
              {label(key)} <span className="num ml-1 text-[12px] font-medium text-faint">{list.length}</span>
            </h2>
            <ul className="mt-1.5 divide-y divide-line">
              {list.map((i) => {
                const category = categoryOf(i.category);
                return (
                  <li key={i.id} className="flex items-center gap-2.5 py-2">
                    <button type="button" onClick={() => setOpenItem(i.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[14px] text-muted-foreground line-through decoration-faint">{i.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
                        <span className={cn("rounded-md px-1.5 text-[11.5px] leading-[18px] font-semibold", TONE[i.owner])}>{OWNER_NAME[i.owner]}</span>
                        {category && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold tracking-[0.06em] uppercase">
                            <span className="size-1.5 rounded-full" style={{ background: category.color }} aria-hidden />
                            {category.label}
                          </span>
                        )}
                        {(i.tags ?? []).map((t) => <span key={t} className="rounded-md border border-line px-1.5 leading-[17px]">{t}</span>)}
                      </span>
                    </button>
                    <button type="button" onClick={() => void toggleDone(i)} title="Remettre à faire" aria-label={`Remettre à faire : ${i.title}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground">
                      <RotateCcw className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => window.confirm(`Supprimer définitivement « ${i.title} » ?`) && void itemsStore.remove(i.id)}
                      title="Supprimer"
                      aria-label={`Supprimer : ${i.title}`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-faint transition-colors duration-100 hover:bg-bad-soft hover:text-bad"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
