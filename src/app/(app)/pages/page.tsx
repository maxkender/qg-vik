"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderPlus, Plus, Star } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { PageView } from "@/components/pages/page-view";
import { useMe } from "@/components/session-provider";
import { pagesStore, profilesStore } from "@/lib/data";
import { ago, childrenOf, createPage, livePages, pageHref, pageTitle } from "@/lib/pages";
import { PageIcon } from "@/components/pages/page-icon";
import { useRows } from "@/lib/store";
import type { PageRow } from "@/lib/types";

export default function PagesRoute() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  return id ? <PageView key={id} id={id} /> : <PagesIndex />;
}

function Card({ page, kids, by }: { page: PageRow; kids: number; by?: string }) {
  return (
    <Link href={pageHref(page.id)} className="glass group flex flex-col gap-3 rounded-2xl p-4 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong">
      <span className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground"><PageIcon icon={page.icon} className="size-[18px]" /></span>
        {page.favorite && <Star className="size-4 fill-warn text-warn" aria-label="Favori" />}
      </span>
      <span>
        <span className="block truncate text-[15px] font-semibold">{pageTitle(page)}</span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
          {by ? `${by} · ` : ""}{ago(page.updated_at)}{kids ? ` · ${kids} sous-page${kids > 1 ? "s" : ""}` : ""}
        </span>
      </span>
    </Link>
  );
}

function PagesIndex() {
  const me = useMe();
  const router = useRouter();
  const pages = useRows(pagesStore);
  const profiles = useRows(profilesStore);
  const live = useMemo(() => livePages(pages), [pages]);
  const roots = childrenOf(pages, null);
  const recent = useMemo(() => [...live].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6), [live]);
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.name;
  const create = () => router.push(pageHref(createPage({ created_by: me.id }).id));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Pages">
        <button type="button" onClick={() => router.push(pageHref(createPage({ folder: true, created_by: me.id }).id))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground">
          <FolderPlus className="size-4" aria-hidden /> Dossier
        </button>
        <button type="button" onClick={create} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background">
          <Plus className="size-4" aria-hidden /> Nouvelle page
        </button>
      </ViewHeader>
      <div className="flex flex-col gap-3 px-4 pb-16 md:px-6">
        {pagesStore.loaded && live.length === 0 && (
          <button type="button" onClick={create} className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center transition-colors duration-100 hover:bg-glass">
            <p className="text-[16px] font-semibold">Aucune page pour l&apos;instant</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Crée la première : un compte rendu, un guide, une idée à creuser.</p>
          </button>
        )}
        {recent.length > 0 && (
          <>
            <h2 className="text-[20px] font-semibold">Modifiées récemment</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recent.map((p) => <Card key={p.id} page={p} kids={childrenOf(pages, p.id).length} by={nameOf(p.updated_by)} />)}
            </div>
            <h2 className="mt-6 text-[20px] font-semibold">Toutes les pages</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {roots.map((p) => <Card key={p.id} page={p} kids={childrenOf(pages, p.id).length} by={nameOf(p.updated_by)} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
