"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ellipsis, Plus, Star, Trash2 } from "lucide-react";
import { PageIcon } from "@/components/pages/page-icon";
import { useMe } from "@/components/session-provider";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pagesStore } from "@/lib/data";
import { ago, childrenOf, createPage, deletePage, isFolder, moveTargets, pageHref, pageTitle } from "@/lib/pages";
import type { PageRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Le menu « … » d'une page : sous-page, ranger, supprimer. */
export function PageMenu({ page, pages, className, onDeleted }: { page: PageRow; pages: PageRow[]; className?: string; onDeleted?: () => void }) {
  const me = useMe();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Actions sur ${pageTitle(page)}`} className={cn("grid size-7 place-items-center rounded-lg text-muted-foreground outline-none transition-colors duration-100 hover:bg-accent hover:text-foreground", className)}>
        <Ellipsis className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => router.push(pageHref(createPage({ parent_id: page.id, created_by: me.id }).id))}>
          <Plus aria-hidden /> {isFolder(page) ? "Nouvelle page dedans" : "Nouvelle sous-page"}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Ranger dans…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-60 overflow-y-auto">
            <DropdownMenuItem disabled={!page.parent_id} onSelect={() => void pagesStore.update(page.id, { parent_id: null })}>Tout en haut</DropdownMenuItem>
            {moveTargets(pages, page.id).map(({ page: target, depth }) => (
              <DropdownMenuItem key={target.id} disabled={target.id === page.parent_id} onSelect={() => void pagesStore.update(page.id, { parent_id: target.id })} style={{ paddingLeft: 8 + depth * 12 }}>
                <PageIcon icon={target.icon} /> <span className="truncate">{pageTitle(target)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            deletePage(pages, page);
            onDeleted?.();
          }}
        >
          <Trash2 aria-hidden /> Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Une page ou un dossier, en carte. */
export function PageCard({ page, pages, by }: { page: PageRow; pages: PageRow[]; by?: string }) {
  const kids = childrenOf(pages, page.id).length;
  const folder = isFolder(page);
  return (
    <div className="glass group relative rounded-2xl transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong">
      <Link href={pageHref(page.id)} className="flex flex-col gap-3 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={cn("grid size-9 place-items-center rounded-xl", folder ? "bg-now-soft text-now" : "bg-muted text-muted-foreground")}><PageIcon icon={page.icon} className="size-[18px]" /></span>
        <span>
          <span className="flex items-center gap-1.5 text-[15px] font-semibold">
            <span className="truncate">{pageTitle(page)}</span>
            {page.favorite && <Star className="size-3.5 shrink-0 fill-warn text-warn" aria-label="Favori" />}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {folder ? `${kids} élément${kids > 1 ? "s" : ""}` : `${by ? `${by} · ` : ""}${ago(page.updated_at)}${kids ? ` · ${kids} sous-page${kids > 1 ? "s" : ""}` : ""}`}
          </span>
        </span>
      </Link>
      <PageMenu page={page} pages={pages} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100" />
    </div>
  );
}
