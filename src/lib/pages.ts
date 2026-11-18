"use client";

import {
  BookOpen, Compass, FileText, Flag, Lightbulb, ListChecks, Megaphone, NotebookPen, Rocket, Target, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { pagesStore } from "@/lib/data";
import { newId } from "@/lib/store";
import type { PageRow } from "@/lib/types";

/** Icônes proposées pour une page (Lucide, pas d'emoji). */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  file: FileText, notebook: NotebookPen, book: BookOpen, idea: Lightbulb, target: Target, rocket: Rocket,
  checklist: ListChecks, people: Users, money: Wallet, megaphone: Megaphone, compass: Compass, flag: Flag,
};
export const pageIcon = (icon: string | null | undefined): LucideIcon => PAGE_ICONS[icon ?? "file"] ?? FileText;
export const pageTitle = (p: Pick<PageRow, "title"> | undefined) => p?.title.trim() || "Sans titre";
export const pageHref = (id: string) => `/pages?id=${id}`;

export function createPage(input: { parent_id?: string | null; title?: string; created_by: string }): PageRow {
  const now = new Date().toISOString();
  const page: PageRow = {
    id: newId(),
    parent_id: input.parent_id ?? null,
    title: input.title ?? "",
    icon: null,
    content: [],
    sort_order: Date.now(),
    favorite: false,
    archived_at: null,
    created_by: input.created_by,
    updated_by: input.created_by,
    created_at: now,
    updated_at: now,
  };
  void pagesStore.insert(page);
  return page;
}

export const livePages = (pages: PageRow[]) => pages.filter((p) => !p.archived_at);
export const childrenOf = (pages: PageRow[], parent: string | null) =>
  livePages(pages).filter((p) => p.parent_id === parent).sort((a, b) => a.sort_order - b.sort_order);

/** Du plus haut parent jusqu'à la page. */
export function breadcrumb(pages: PageRow[], id: string): PageRow[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: PageRow[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out;
}

/** Il y a 2 min, hier, 12 nov. */
export function ago(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return "hier";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
