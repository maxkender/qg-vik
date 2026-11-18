"use client";

import { itemsStore } from "@/lib/data";
import type { Category } from "@/lib/categories";
import type { Owner } from "@/lib/members";
import { newId } from "@/lib/store";
import type { Item, Prio } from "@/lib/types";

export const PRIO_LABEL: Record<Prio, string> = { urgent: "Urgent", normal: "À faire", later: "Plus tard" };
export const OWNER_LABEL: Record<Owner, string> = { max: "Max", adrien: "Adrien", both: "Les deux" };
export const OWNER_NAME: Record<Owner, string> = { max: "Maximilien", adrien: "Adrien", both: "Les deux" };
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
  return itemsStore.update(item.id, { done, done_at: done ? new Date().toISOString() : null });
}

/** Position entre deux voisins (pour ranger une carte sans renuméroter les autres). */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1000;
  if (after !== undefined) return after - 1000;
  return Date.now();
}
