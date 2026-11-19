"use client";

import { itemsStore } from "@/lib/data";
import type { Category } from "@/lib/categories";
import type { Owner } from "@/lib/members";
import { newId } from "@/lib/store";
import { addDays, addMonths, dayKey, monthKey, parseBucket, weekKey } from "@/lib/dates";
import type { Item, Prio, RepeatRule } from "@/lib/types";

export const PRIO_LABEL: Record<Prio, string> = { urgent: "Urgent", normal: "À faire", later: "Plus tard" };
export const OWNER_LABEL: Record<Owner, string> = { max: "Max", adrien: "Adrien", both: "Les deux" };
export const OWNER_NAME: Record<Owner, string> = { max: "Maximilien", adrien: "Adrien", both: "Les deux" };
export const REPEAT_LABEL: Record<RepeatRule, string> = {
  daily: "Tous les jours", weekdays: "Du lundi au vendredi", weekly: "Chaque semaine", biweekly: "Toutes les 2 semaines", monthly: "Chaque mois",
};

/** L'horizon de la prochaine occurrence d'une tâche qui se répète. */
export function nextBucket(bucket: string, rule: RepeatRule): string {
  const { kind, start } = parseBucket(bucket);
  if (!start) return bucket;
  if (kind === "d") {
    if (rule === "monthly") return dayKey(addMonths(start, 1));
    let next = addDays(start, rule === "weekly" ? 7 : rule === "biweekly" ? 14 : 1);
    if (rule === "weekdays") while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
    return dayKey(next);
  }
  if (kind === "w") return rule === "monthly" ? weekKey(addDays(start, 28)) : weekKey(addDays(start, rule === "biweekly" ? 14 : 7));
  if (kind === "m") return monthKey(addMonths(start, 1));
  return bucket;
}

/** Lien Meet valide : une adresse https. */
export const cleanMeetUrl = (v: string): string | null => {
  const t = v.trim();
  if (!t) return null;
  return /^https:\/\/\S+$/.test(t) ? t : /^meet\.google\.com\/\S+$/.test(t) ? `https://${t}` : null;
};

export const nextOwner = (o: Owner): Owner => (o === "both" ? "max" : o === "max" ? "adrien" : "both");
export const nextPrio = (p: Prio): Prio => (p === "normal" ? "urgent" : p === "urgent" ? "later" : "normal");

/** Ordre d'affichage : pas fait d'abord, puis l'ordre choisi à la main. */
export const byOrder = (a: Item, b: Item) =>
  Number(a.done) - Number(b.done) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

export function createItem(input: {
  title: string;
  notes?: string | null;
  bucket: string;
  owner: Owner;
  prio?: Prio;
  category?: Category | null;
  at_time?: string | null;
  meet_url?: string | null;
  repeat_rule?: RepeatRule | null;
  parent_id?: string | null;
  created_by: string;
  sort_order?: number;
}): Item {
  const now = new Date().toISOString();
  const item: Item = {
    id: newId(),
    title: input.title,
    notes: input.notes ?? null,
    bucket: input.bucket,
    owner: input.owner,
    prio: input.prio ?? "normal",
    category: input.category ?? null,
    page_id: null,
    at_time: input.at_time ?? null,
    meet_url: input.meet_url ?? null,
    repeat_rule: input.repeat_rule ?? null,
    parent_id: input.parent_id ?? null,
    done: false,
    done_at: null,
    sort_order: input.sort_order ?? Date.now(),
    created_at: now,
    created_by: input.created_by,
    updated_at: now,
  };
  void itemsStore.insert(item);
  return item;
}

export function toggleDone(item: Item) {
  const done = !item.done;
  // Une tâche qui se répète : la cocher crée la suivante (une seule fois).
  if (done && item.repeat_rule && !item.parent_id) {
    const bucket = nextBucket(item.bucket, item.repeat_rule);
    const exists = itemsStore.getSnapshot().some((i) => !i.done && i.id !== item.id && i.title === item.title && i.repeat_rule === item.repeat_rule && i.bucket === bucket);
    if (!exists && bucket !== item.bucket) {
      const now = new Date().toISOString();
      void itemsStore.insert({ ...item, id: newId(), bucket, done: false, done_at: null, sort_order: Date.now(), created_at: now, updated_at: now });
    }
  }
  return itemsStore.update(item.id, { done, done_at: done ? new Date().toISOString() : null });
}

/** Position entre deux voisins (pour ranger une carte sans renuméroter les autres). */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1000;
  if (after !== undefined) return after - 1000;
  return Date.now();
}
