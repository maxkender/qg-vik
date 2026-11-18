"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, FileText, Gavel, ListTodo } from "lucide-react";
import { useView } from "@/components/app/view-state";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { decisionsStore, itemsStore, linksStore, pagesStore } from "@/lib/data";
import { bucketLabel } from "@/lib/dates";
import { NAV_ALL } from "@/lib/nav";
import { livePages, pageHref, pageTitle } from "@/lib/pages";
import { PageIcon } from "@/components/pages/page-icon";
import { useRows } from "@/lib/store";

/** Recherche globale (touche /) : vues, tâches, pages, liens, décisions. */
export function SearchDialog() {
  const router = useRouter();
  const { searchOpen, setSearchOpen, setOpenItem, today } = useView();
  const items = useRows(itemsStore);
  const pages = useRows(pagesStore);
  const links = useRows(linksStore);
  const decisions = useRows(decisionsStore);

  const run = (fn: () => void) => () => {
    setSearchOpen(false);
    fn();
  };

  return (
    <CommandDialog className="glass-strong border-0 sm:max-w-xl" open={searchOpen} onOpenChange={setSearchOpen} title="Rechercher" description="Cherche une tâche, une page, un lien ou une vue">
      <Command className="bg-transparent">
      <CommandInput placeholder="Chercher une tâche, une page, un lien…" />
      <CommandList>
        <CommandEmpty>Rien trouvé.</CommandEmpty>
        <CommandGroup heading="Aller à">
          {NAV_ALL.map((n) => (
            <CommandItem key={n.href} value={`aller ${n.label}`} onSelect={run(() => router.push(n.href))}>
              <n.icon aria-hidden /> {n.label}
            </CommandItem>
          ))}
          <CommandItem value="aller pages documents" onSelect={run(() => router.push("/pages"))}>
            <FileText aria-hidden /> Pages
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Pages">
          {livePages(pages).map((p) => {
            return (
              <CommandItem key={p.id} value={`page ${pageTitle(p)} ${p.id}`} onSelect={run(() => router.push(pageHref(p.id)))}>
                <PageIcon icon={p.icon} /> {pageTitle(p)}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Tâches">
          {items.filter((i) => !i.done).map((i) => (
            <CommandItem key={i.id} value={`tâche ${i.title} ${i.id}`} onSelect={run(() => setOpenItem(i.parent_id ?? i.id))}>
              <ListTodo aria-hidden />
              <span className="min-w-0 flex-1 truncate">{i.title}</span>
              <span className="num text-[11px] text-faint">{bucketLabel(i.bucket, today)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Liens">
          {links.map((l) => (
            <CommandItem key={l.id} value={`lien ${l.title} ${l.note ?? ""} ${l.id}`} onSelect={run(() => window.open(l.url, "_blank", "noopener"))}>
              <ArrowUpRight aria-hidden /> {l.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Décisions">
          {decisions.map((d) => (
            <CommandItem key={d.id} value={`décision ${d.title} ${d.id}`} onSelect={run(() => router.push("/dashboard"))}>
              <Gavel aria-hidden /> <span className="truncate">{d.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
