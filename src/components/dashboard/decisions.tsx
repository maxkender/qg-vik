"use client";

import { useMemo, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Panel } from "@/components/dashboard/charts";
import { useMe } from "@/components/session-provider";
import { decisionsStore } from "@/lib/data";
import { isoDate } from "@/lib/dates";
import { shortDate } from "@/lib/format";
import { newId, useRows } from "@/lib/store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- décisions
const DOMAINS = ["OS", "Recrutement", "Paie", "Contenu", "Apps", "Admin"];
const field = "h-9 min-w-0 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";

export function Decisions() {
  const me = useMe();
  const rows = useRows(decisionsStore);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)), [rows]);

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim();
    if (!title) return;
    void decisionsStore.insert({
      id: newId(),
      date: isoDate(new Date()),
      title,
      why: String(f.get("why") ?? "").trim() || null,
      domain: String(f.get("domain") ?? "") || null,
      created_at: new Date().toISOString(),
      created_by: me.id,
    });
    e.currentTarget.reset();
  }

  return (
    <Panel>
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <input name="title" required placeholder="Nouvelle décision…" aria-label="Décision" className={cn(field, "flex-[2_1_240px]")} />
        <input name="why" placeholder="Pourquoi" aria-label="Pourquoi" className={cn(field, "flex-[2_1_240px]")} />
        <select name="domain" aria-label="Domaine" className={cn(field, "flex-none")} defaultValue="OS">
          {DOMAINS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-foreground px-4 text-[13.5px] font-semibold text-background">
          Ajouter
        </button>
      </form>
      {sorted.length === 0 && <p className="text-muted-foreground">Aucune décision pour l&apos;instant.</p>}
      <ul className="divide-y divide-line">
        {sorted.map((d) => (
          <li key={d.id} className="group grid grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-3 py-3">
            <span className="num pt-0.5 text-[12px] text-muted-foreground">{shortDate(d.date)}</span>
            <div className="min-w-0">
              <p className="font-semibold">{d.title}</p>
              {d.why && <p className="mt-0.5 text-[13px] text-muted-foreground">{d.why}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              {d.domain && <span className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">{d.domain}</span>}
              <button
                type="button"
                aria-label={`Supprimer la décision « ${d.title} »`}
                onClick={() => {
                  if (window.confirm("Supprimer cette décision ?")) void decisionsStore.remove(d.id);
                }}
                className="grid size-6 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
