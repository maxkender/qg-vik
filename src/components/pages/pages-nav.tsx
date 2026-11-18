"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpenCheck, ChevronRight, Files, Plus } from "lucide-react";
import { useMe } from "@/components/session-provider";
import { pagesStore, readsStore } from "@/lib/data";
import { breadcrumb, childrenOf, createPage, pageHref, pageTitle } from "@/lib/pages";
import { PageIcon } from "@/components/pages/page-icon";
import { useRows } from "@/lib/store";
import type { PageRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const row = "group flex h-8 items-center gap-1.5 rounded-lg pr-1 text-[13.5px] font-medium transition-colors duration-100";

/** Section « Pages » du rail : À lire, puis l'arborescence des documents. */
export function PagesNav() {
  return (
    <Suspense fallback={null}>
      <PagesNavInner />
    </Suspense>
  );
}

function PagesNavInner() {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const currentId = useSearchParams().get("id");
  const pages = useRows(pagesStore);
  const reads = useRows(readsStore);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const unread = reads.filter((r) => r.for_who === me.short && !r.read_at && pages.some((p) => p.id === r.page_id && !p.archived_at)).length;
  const onPages = pathname === "/pages";
  // Les parents de la page ouverte sont dépliés d'office.
  const ancestors = new Set(onPages && currentId ? breadcrumb(pages, currentId).map((p) => p.id) : []);
  const isOpen = (id: string) => toggled[id] ?? ancestors.has(id);
  const roots = childrenOf(pages, null);

  function Node({ page, depth }: { page: PageRow; depth: number }) {
    const kids = childrenOf(pages, page.id);
    const active = onPages && currentId === page.id;
    const open = isOpen(page.id);
    return (
      <li key={page.id}>
        <div className={cn(row, active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")} style={{ paddingLeft: 4 + depth * 12 }}>
          <button
            type="button"
            aria-label={open ? "Replier" : "Déplier"}
            aria-expanded={open}
            onClick={() => setToggled((t) => ({ ...t, [page.id]: !open }))}
            className={cn("grid size-5 shrink-0 place-items-center rounded text-faint hover:text-foreground", kids.length === 0 && "invisible")}
          >
            <ChevronRight className={cn("size-3.5 transition-transform duration-100", open && "rotate-90")} aria-hidden />
          </button>
          <Link href={pageHref(page.id)} aria-current={active ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-2 outline-none">
            <PageIcon icon={page.icon} className={cn("size-4 shrink-0", active ? "text-now" : "text-faint")} />
            <span className="truncate">{pageTitle(page)}</span>
          </Link>
          <button
            type="button"
            aria-label={`Nouvelle sous-page dans ${pageTitle(page)}`}
            title="Nouvelle sous-page"
            onClick={() => {
              setToggled((t) => ({ ...t, [page.id]: true }));
              router.push(pageHref(createPage({ parent_id: page.id, created_by: me.id }).id));
            }}
            className="grid size-6 shrink-0 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>
        {open && kids.length > 0 && <ul>{kids.map((k) => Node({ page: k, depth: depth + 1 }))}</ul>}
      </li>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-2 pt-3 pb-1">
        <p className="text-[10.5px] font-semibold tracking-[0.1em] text-faint uppercase">Pages</p>
        <button
          type="button"
          aria-label="Nouvelle page"
          title="Nouvelle page"
          onClick={() => router.push(pageHref(createPage({ created_by: me.id }).id))}
          className="grid size-5 place-items-center rounded text-faint transition-colors duration-100 hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
      <Link
        href="/a-lire"
        aria-current={pathname === "/a-lire" ? "page" : undefined}
        className={cn(row, "gap-2.5 px-2", pathname === "/a-lire" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
      >
        <BookOpenCheck className={cn("size-4 shrink-0", pathname === "/a-lire" ? "text-now" : "text-faint")} aria-hidden />
        <span className="flex-1">À lire</span>
        {unread > 0 && <span className="num rounded-md bg-now-soft px-1.5 text-[11px] leading-[18px] text-now">{unread}</span>}
      </Link>
      <Link
        href="/pages"
        aria-current={onPages && !currentId ? "page" : undefined}
        className={cn(row, "gap-2.5 px-2", onPages && !currentId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
      >
        <Files className={cn("size-4 shrink-0", onPages && !currentId ? "text-now" : "text-faint")} aria-hidden />
        Toutes les pages
      </Link>
      <ul>{roots.map((p) => Node({ page: p, depth: 0 }))}</ul>
    </>
  );
}
