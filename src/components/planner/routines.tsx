"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, Link2, Plus, Repeat, X } from "lucide-react";
import { useView } from "@/components/app/view-state";
import { Tick } from "@/components/planner/item-card";
import { useMe } from "@/components/session-provider";
import { routineChecksStore, routinesStore } from "@/lib/data";
import { DAYS, cap, isoDate } from "@/lib/dates";
import { OWNER_NAME } from "@/lib/items";
import type { Owner } from "@/lib/members";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";
import { newId, useRows } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TONE: Record<Owner, string> = { max: "bg-max-soft text-max", adrien: "bg-adrien-soft text-adrien", both: "bg-both-soft text-both" };
const field = "h-8 rounded-lg border border-line bg-glass px-2 text-[12.5px] outline-none focus:border-line-strong";

/**
 * Les habitudes du jour, en haut de la to-do : ce qu'on fait chaque lundi, chaque jeudi, ou tous les jours.
 * Ce sont les lignes de la « semaine type » (page Process). On les coche pour la journée ; demain elles reviennent.
 */
export function TodayRoutines() {
  const me = useMe();
  const { today, sees } = useView();
  const routines = useRows(routinesStore);
  const checks = useRows(routineChecksStore);
  const [adding, setAdding] = useState(false);
  // Replié ou non : le choix est gardé sur l'appareil.
  const [folded, setFolded] = useState(() => {
    try {
      // Sur téléphone, replié par défaut : la to-do reste en vue.
      return (localStorage.getItem("qg-habitudes") ?? (window.innerWidth < 768 ? "repliees" : "ouvertes")) === "repliees";
    } catch {
      return false;
    }
  });
  function fold() {
    setFolded((v) => {
      try {
        localStorage.setItem("qg-habitudes", v ? "ouvertes" : "repliees");
      } catch {}
      return !v;
    });
  }
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<"day" | "daily">("day");
  const [who, setWho] = useState<Owner>(me.short);

  const weekday = ((today.getDay() + 6) % 7) + 1; // 1 = lundi
  const date = isoDate(today);
  // Ce que l'OS fait tout seul n'est pas une chose à faire.
  const mine = routines
    .filter((r) => r.who !== "os" && (r.day === null || r.day === weekday) && sees(r.who))
    .sort((a, b) => Number(a.day === null) - Number(b.day === null) || a.sort_order - b.sort_order);
  const checkOf = (id: string) => checks.find((c) => c.routine_id === id && c.date === date);
  const left = mine.filter((r) => !checkOf(r.id)).length;

  function toggle(id: string) {
    const check = checkOf(id);
    if (check) void routineChecksStore.remove(check.id);
    else void routineChecksStore.insert({ id: newId(), routine_id: id, date, checked_by: me.id, created_at: new Date().toISOString() });
  }
  /** Le lien direct d'une habitude : la page où elle se fait. Vide = on l'enlève. */
  function setLink(id: string, name: string, current?: string | null) {
    const typed = window.prompt(`Lien direct pour « ${name} » (laisse vide pour l'enlever)`, current ?? "https://");
    if (typed === null) return;
    const value = typed.trim();
    if (!value || value === "https://") return void routinesStore.update(id, { url: null });
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    if (containsSecret(url)) return void toast.error(SECRET_MESSAGE);
    void routinesStore.update(id, { url });
  }
  function add() {
    const t = title.trim();
    if (!t) return;
    if (containsSecret(t)) return void toast.error(SECRET_MESSAGE);
    void routinesStore.insert({ id: newId(), day: when === "daily" ? null : weekday, title: t, sub: null, who, sort_order: Date.now() });
    setTitle("");
    setAdding(false);
  }

  if (!mine.length && !adding) {
    return (
      <button type="button" onClick={() => setAdding(true)} className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
        <Repeat className="size-3.5" aria-hidden /> Ajouter une habitude du {DAYS[today.getDay()]}
      </button>
    );
  }
  return (
    <section aria-label="Habitudes du jour" className="glass rounded-2xl px-4 py-2.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={fold} aria-expanded={!folded} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Repeat className="size-3.5 shrink-0 text-faint" aria-hidden />
          <h2 className="truncate font-sans text-[13px] font-semibold tracking-normal">Comme chaque {DAYS[today.getDay()]}</h2>
          <span className="num shrink-0 text-[12px] text-faint">{left ? `${left} à faire` : "tout est fait"}</span>
          <ChevronDown className={cn("size-3.5 shrink-0 text-faint transition-transform duration-100", !folded && "rotate-180")} aria-hidden />
        </button>
        <button type="button" onClick={() => { setAdding((v) => !v); if (folded) fold(); }} aria-label="Ajouter une habitude" title="Ajouter une habitude" className="grid size-6 place-items-center rounded-md text-faint hover:bg-accent hover:text-foreground">
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
      {!folded && <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {mine.map((r) => {
          const done = Boolean(checkOf(r.id));
          return (
            <li key={r.id} className="group flex items-start gap-2">
              <Tick checked={done} onChange={() => toggle(r.id)} label={done ? `${r.title} : marquer comme pas fait` : `${r.title} : marquer comme fait`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={cn("text-[13.5px] leading-[21px]", done && "text-faint line-through")}>{r.title}</span>
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" title={r.url} className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md bg-foreground px-1.5 text-[11px] font-semibold text-background">
                      Ouvrir <ArrowUpRight className="size-3" aria-hidden />
                    </a>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-faint">
                  <span className={cn("rounded-md px-1.5 text-[11px] leading-[17px] font-semibold", TONE[r.who as Owner], done && "opacity-50")}>{OWNER_NAME[r.who as Owner]}</span>
                  {r.sub}
                  {r.day === null && <span>tous les jours</span>}
                </span>
              </span>
              <button type="button" onClick={() => setLink(r.id, r.title, r.url)} aria-label={`Lien direct de l'habitude ${r.title}`} title={r.url ? "Changer le lien direct" : "Ajouter un lien direct"} className="grid size-6 shrink-0 place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 max-md:opacity-100">
                <Link2 className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => window.confirm(`Retirer « ${r.title} » des habitudes ? Elle disparaîtra aussi de la semaine type.`) && void routinesStore.remove(r.id)}
                aria-label={`Retirer l'habitude ${r.title}`}
                title="Retirer cette habitude"
                className="grid size-6 shrink-0 place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 max-md:opacity-100"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>}
      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3"
        >
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setAdding(false); }} placeholder="Nouvelle habitude, ex. Donner la liste de courses aux HM" aria-label="Nouvelle habitude" className={cn(field, "min-w-0 flex-[1_1_240px]")} />
          <select value={when} onChange={(e) => setWhen(e.target.value as "day" | "daily")} aria-label="Quand" className={field}>
            <option value="day">Chaque {DAYS[today.getDay()]}</option>
            <option value="daily">Tous les jours</option>
          </select>
          <select value={who} onChange={(e) => setWho(e.target.value as Owner)} aria-label="Pour qui" className={field}>
            {(Object.keys(OWNER_NAME) as Owner[]).map((o) => <option key={o} value={o}>{OWNER_NAME[o]}</option>)}
          </select>
          <button type="submit" disabled={!title.trim()} className="h-8 rounded-lg bg-foreground px-3 text-[12.5px] font-semibold text-background disabled:opacity-40">Ajouter</button>
        </form>
      )}
      {!adding && <p className="sr-only">{cap(DAYS[today.getDay()])}</p>}
    </section>
  );
}
