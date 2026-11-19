"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Link2, NotebookPen, X } from "lucide-react";
import { toast } from "sonner";
import { useView } from "@/components/app/view-state";
import { PageIcon } from "@/components/pages/page-icon";
import { useMe } from "@/components/session-provider";
import { itemLinksStore, pagesStore } from "@/lib/data";
import { bucketLabel, longDate, parseBucket } from "@/lib/dates";
import { createMeetingNotes, createPageSaved, livePages, pageHref, pageTitle } from "@/lib/pages";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";
import { newId, useRows } from "@/lib/store";
import type { Item, ItemLink } from "@/lib/types";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Les pages et les liens rattachés à une tâche, dans l'ordre où ils ont été ajoutés. */
export function useItemLinks(itemId: string) {
  const links = useRows(itemLinksStore);
  const pages = useRows(pagesStore);
  return links
    .filter((l) => l.item_id === itemId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((link) => ({ link, page: link.page_id ? pages.find((p) => p.id === link.page_id && !p.archived_at) : undefined }))
    .filter((l) => l.page || l.link.url);
}

/** Dans la fiche d'une tâche : autant de pages et de liens qu'on veut. */
export function ItemLinks({ item }: { item: Item }) {
  const me = useMe();
  const { today, setOpenItem } = useView();
  const pages = useRows(pagesStore);
  const linked = useItemLinks(item.id);
  const [url, setUrl] = useState("");
  const free = livePages(pages).filter((p) => !linked.some((l) => l.page?.id === p.id)).sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), "fr"));

  const add = (fields: Pick<ItemLink, "page_id" | "url">) =>
    itemLinksStore.insert({ id: newId(), item_id: item.id, title: null, created_by: me.id, created_at: new Date().toISOString(), ...fields });

  function addUrl() {
    let value = url.trim();
    if (!value) return;
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    if (containsSecret(value)) return void toast.error(SECRET_MESSAGE);
    try {
      new URL(value);
    } catch {
      return void toast.error("Ce lien n'est pas valide");
    }
    void add({ page_id: null, url: value });
    setUrl("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      {linked.map(({ link, page }) => (
        <div key={link.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
          {page ? <PageIcon icon={page.icon} className="size-4 shrink-0 text-muted-foreground" /> : <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          {page ? (
            <Link href={pageHref(page.id)} onClick={() => setOpenItem(null)} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">{pageTitle(page)}</Link>
          ) : (
            <a href={link.url!} target="_blank" rel="noreferrer" title={link.url!} className="flex min-w-0 flex-1 items-center gap-1 text-[13.5px] font-medium hover:underline">
              <span className="truncate">{link.url!.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-faint" aria-hidden />
            </a>
          )}
          <button type="button" onClick={() => void itemLinksStore.remove(link.id)} aria-label={`Retirer ${page ? pageTitle(page) : host(link.url!)}`} title="Retirer" className="grid size-6 shrink-0 place-items-center rounded-md text-faint hover:bg-accent hover:text-foreground">
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}

      <div className="flex gap-1.5">
        {item.category === "reunion" && (
          <button
            type="button"
            onClick={() => {
              const { page, saved } = createMeetingNotes(pages, { title: item.title, date: item.bucket.startsWith("d:") ? longDate(parseBucket(item.bucket).start!) : bucketLabel(item.bucket, today), created_by: me.id });
              void saved.then((ok) => ok && add({ page_id: page.id, url: null }));
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background"
          >
            <NotebookPen className="size-4" aria-hidden /> Compte rendu
          </button>
        )}
        <select
          value=""
          aria-label="Relier une page"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (v !== "new") return void add({ page_id: v, url: null });
            const { page, saved } = createPageSaved({ title: item.title, created_by: me.id });
            void saved.then((ok) => ok && add({ page_id: page.id, url: null }));
          }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-glass px-2.5 text-[13px] text-muted-foreground outline-none focus:border-line-strong"
        >
          <option value="">Relier une page…</option>
          <option value="new">+ Nouvelle page pour cette tâche</option>
          {free.map((p) => (
            <option key={p.id} value={p.id}>{pageTitle(p)}</option>
          ))}
        </select>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addUrl();
        }}
        className="flex gap-1.5"
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Coller un lien (Notion, Drive, Figma, site…)"
          aria-label="Ajouter un lien"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-line-strong"
        />
        <button type="submit" disabled={!url.trim()} className="h-9 rounded-lg border border-line px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground disabled:opacity-40">
          Ajouter
        </button>
      </form>
    </div>
  );
}

/** Sur la carte d'une tâche : la première chose reliée, et le nombre des autres. */
export function LinkedSummary({ itemId }: { itemId: string }) {
  const linked = useItemLinks(itemId);
  if (!linked.length) return null;
  const { link, page } = linked[0];
  const cls = "inline-flex max-w-[170px] items-center gap-1 text-muted-foreground hover:text-foreground hover:underline";
  return (
    <>
      {page ? (
        <Link href={pageHref(page.id)} className={cls}>
          <PageIcon icon={page.icon} className="size-3 shrink-0" />
          <span className="truncate">{pageTitle(page)}</span>
        </Link>
      ) : (
        <a href={link.url!} target="_blank" rel="noreferrer" className={cls}>
          <Link2 className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{host(link.url!)}</span>
        </a>
      )}
      {linked.length > 1 && <span className="num">+{linked.length - 1}</span>}
    </>
  );
}
