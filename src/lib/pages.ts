"use client";

import {
  BookOpen, Compass, FileText, Flag, Folder, Lightbulb, ListChecks, Megaphone, NotebookPen, Rocket, Target, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { pagesStore } from "@/lib/data";
import { newId } from "@/lib/store";
import type { PageRow } from "@/lib/types";

/** Icônes proposées pour une page (Lucide, pas d'emoji). */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  file: FileText, folder: Folder, notebook: NotebookPen, book: BookOpen, idea: Lightbulb, target: Target, rocket: Rocket,
  checklist: ListChecks, people: Users, money: Wallet, megaphone: Megaphone, compass: Compass, flag: Flag,
};
export const pageIcon = (icon: string | null | undefined): LucideIcon => PAGE_ICONS[icon ?? "file"] ?? FileText;
export const pageTitle = (p: Pick<PageRow, "title"> | undefined) => p?.title.trim() || "Sans titre";
export const pageHref = (id: string) => `/pages?id=${id}`;

/** Un dossier est une page à l'icône « dossier » : il range d'autres pages et peut aussi contenir du texte. */
export const isFolder = (p: Pick<PageRow, "icon">) => p.icon === "folder";

export function createPage(input: { parent_id?: string | null; title?: string; folder?: boolean; icon?: string; content?: unknown[]; created_by: string }): PageRow {
  const now = new Date().toISOString();
  const page: PageRow = {
    id: newId(),
    parent_id: input.parent_id ?? null,
    title: input.title ?? (input.folder ? "Nouveau dossier" : ""),
    icon: input.folder ? "folder" : (input.icon ?? null),
    content: input.content ?? [],
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

// Les enregistrements en attente, pour qu'une page soit en base avant ce qui pointe vers elle.
const saving = new Map<string, Promise<boolean>>();
/** Comme createPage, mais on peut attendre que la page soit enregistrée (et son parent avant elle). */
export function createPageSaved(input: Parameters<typeof createPage>[0]): { page: PageRow; saved: Promise<boolean> } {
  const now = new Date().toISOString();
  const page: PageRow = {
    id: newId(), parent_id: input.parent_id ?? null, title: input.title ?? (input.folder ? "Nouveau dossier" : ""), icon: input.folder ? "folder" : (input.icon ?? null),
    content: input.content ?? [], sort_order: Date.now(), favorite: false, archived_at: null, created_by: input.created_by, updated_by: input.created_by, created_at: now, updated_at: now,
  };
  const parent = page.parent_id ? saving.get(page.parent_id) : undefined;
  const saved = (parent ?? Promise.resolve(true)).then(() => pagesStore.insert(page));
  saving.set(page.id, saved);
  void saved.finally(() => saving.delete(page.id));
  return { page, saved };
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

/** Les endroits où l'on peut ranger une page : tout sauf elle-même et ce qu'elle contient. */
export function moveTargets(pages: PageRow[], id: string): { page: PageRow; depth: number }[] {
  const out: { page: PageRow; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) =>
    childrenOf(pages, parent).forEach((p) => {
      if (p.id === id) return;
      out.push({ page: p, depth });
      walk(p.id, depth + 1);
    });
  walk(null, 0);
  return out;
}

/** Supprime une page et tout ce qu'elle contient. Un bouton « Annuler » la fait revenir. */
export function deletePage(pages: PageRow[], page: PageRow) {
  const ids: string[] = [];
  const collect = (id: string) => {
    ids.push(id);
    childrenOf(pages, id).forEach((k) => collect(k.id));
  };
  collect(page.id);
  const at = new Date().toISOString();
  ids.forEach((id) => void pagesStore.update(id, { archived_at: at }));
  toast(`« ${pageTitle(page)} » supprimé${ids.length > 1 ? ` avec ${ids.length - 1} page${ids.length > 2 ? "s" : ""}` : ""}`, {
    action: { label: "Annuler", onClick: () => ids.forEach((id) => void pagesStore.update(id, { archived_at: null })) },
  });
}

/** Le dossier « Réunions », créé à la première utilisation. */
export function meetingsFolder(pages: PageRow[], created_by: string): string {
  const found = childrenOf(pages, null).find((p) => isFolder(p) && p.title.trim().toLowerCase() === "réunions");
  return found ? found.id : createPageSaved({ folder: true, title: "Réunions", created_by }).page.id;
}

/** Un compte rendu de réunion prêt à remplir, rangé dans « Réunions ». */
export function createMeetingNotes(pages: PageRow[], input: { title: string; date: string; created_by: string }): { page: PageRow; saved: Promise<boolean> } {
  const h = (text: string) => ({ type: "heading", props: { level: 2 }, content: text });
  return createPageSaved({
    parent_id: meetingsFolder(pages, input.created_by),
    title: `${input.title} · ${input.date}`,
    icon: "notebook",
    created_by: input.created_by,
    content: [
      h("Présents"), { type: "paragraph", content: "Maximilien, Adrien" },
      h("Ordre du jour"), { type: "bulletListItem", content: "" },
      h("Décisions"), { type: "bulletListItem", content: "" },
      h("Actions"), { type: "checkListItem", content: "" },
    ],
  });
}
