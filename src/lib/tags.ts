"use client";

import type { CSSProperties } from "react";
import { tagColorsStore } from "@/lib/data";
import { useRows } from "@/lib/store";

/** Les couleurs proposées pour un label. */
export const TAG_PALETTE = [
  { name: "Bleu", color: "#3b82f6" }, { name: "Violet", color: "#8b5cf6" }, { name: "Rose", color: "#ec4899" }, { name: "Rouge", color: "#ef4444" },
  { name: "Ambre", color: "#f59e0b" }, { name: "Vert", color: "#10b981" }, { name: "Cyan", color: "#06b6d4" }, { name: "Ardoise", color: "#64748b" },
] as const;
const PRESET: Record<string, string> = { sophia: "#8b5cf6", micabo: "#f59e0b", unswipe: "#ec4899", runvik: "#10b981", atala: "#3b82f6" };

/** Sans choix enregistré : la couleur du label connu, sinon une couleur stable tirée de son nom. */
export function defaultTagColor(name: string): string {
  const key = name.trim().toLowerCase();
  if (PRESET[key]) return PRESET[key];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length].color;
}

/** Rend la fonction « label → couleur », à jour en direct. */
export function useTagColors(): (name: string) => string {
  const rows = useRows(tagColorsStore);
  return (name) => rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase())?.color ?? defaultTagColor(name);
}

export function setTagColor(name: string, color: string) {
  return tagColorsStore.upsert({ name, color, updated_at: new Date().toISOString() });
}

/** La pastille d'un label : fond doux et texte dans sa couleur, lisible en clair comme en sombre. */
export const tagChipStyle = (color: string): CSSProperties => ({
  background: `color-mix(in oklab, ${color} 16%, transparent)`,
  color: `color-mix(in oklab, ${color} 62%, var(--foreground))`,
});
/** La carte d'une tâche, teintée par son premier label : un voile de couleur et un liseré. */
export const tagCardStyle = (color: string, done: boolean): CSSProperties => ({
  background: `linear-gradient(105deg, color-mix(in oklab, ${color} ${done ? 5 : 13}%, transparent), color-mix(in oklab, ${color} ${done ? 2 : 5}%, transparent))`,
  boxShadow: `inset 3px 0 0 color-mix(in oklab, ${color} ${done ? 35 : 85}%, transparent), inset 0 0 0 1px color-mix(in oklab, ${color} ${done ? 8 : 18}%, transparent)`,
});
