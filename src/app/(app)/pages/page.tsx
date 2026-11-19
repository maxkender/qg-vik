"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderPlus, NotebookPen, Plus } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { PageCard } from "@/components/pages/page-card";
import { PageView } from "@/components/pages/page-view";
import { useMe } from "@/components/session-provider";
import { pagesStore, profilesStore } from "@/lib/data";
import { childrenOf, createMeetingNotes, createPage, isFolder, livePages, pageHref } from "@/lib/pages";
import { longDate } from "@/lib/dates";
import { useRows } from "@/lib/store";

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

function PagesIndex() {
  const me = useMe();
  const router = useRouter();
  const pages = useRows(pagesStore);
  const profiles = useRows(profilesStore);
  const live = useMemo(() => livePages(pages), [pages]);
  const roots = childrenOf(pages, null);
  const folders = roots.filter(isFolder);
  const loose = roots.filter((p) => !isFolder(p));
  const recent = useMemo(() => [...live].filter((p) => !isFolder(p)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6), [live]);
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.name;
  const create = () => router.push(pageHref(createPage({ created_by: me.id }).id));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Pages">
        <button type="button" onClick={() => router.push(pageHref(createPage({ folder: true, created_by: me.id }).id))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground">
          <FolderPlus className="size-4" aria-hidden /> Dossier
        </button>
        <button type="button" onClick={() => router.push(pageHref(createMeetingNotes(pages, { title: "Compte rendu", date: longDate(new Date()), created_by: me.id }).page.id))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground">
          <NotebookPen className="size-4" aria-hidden /> Compte rendu
        </button>
        <button type="button" onClick={create} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background">
          <Plus className="size-4" aria-hidden /> Nouvelle page
        </button>
      </ViewHeader>
      <div className="flex min-w-0 flex-col gap-3 px-4 pb-16 md:px-6 [&>*]:min-w-0">
        {pagesStore.loaded && live.length === 0 && (
          <button type="button" onClick={create} className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center transition-colors duration-100 hover:bg-glass">
            <p className="text-[16px] font-semibold">Aucune page pour l&apos;instant</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Crée la première : un compte rendu, un guide, une idée à creuser.</p>
          </button>
        )}
        {folders.length > 0 && (
          <>
            <h2 className="text-[20px] font-semibold">Dossiers</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {folders.map((p) => <PageCard key={p.id} page={p} pages={pages} />)}
            </div>
          </>
        )}
        {loose.length > 0 && (
          <>
            <h2 className={folders.length ? "mt-6 text-[20px] font-semibold" : "text-[20px] font-semibold"}>Pages</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {loose.map((p) => <PageCard key={p.id} page={p} pages={pages} by={nameOf(p.updated_by)} />)}
            </div>
          </>
        )}
        {recent.length > 0 && live.length > 6 && (
          <>
            <h2 className="mt-6 text-[20px] font-semibold">Modifiées récemment</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recent.map((p) => <PageCard key={p.id} page={p} pages={pages} by={nameOf(p.updated_by)} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
