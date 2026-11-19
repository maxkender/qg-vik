"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenCheck, ChevronRight, Ellipsis, FolderPlus, Link2, MessageSquare, Plus, Send, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Comments } from "@/components/comments";
import { MarginComments, useMarginThreads } from "@/components/pages/margin-comments";
import { PageCard } from "@/components/pages/page-card";
import { PageIcon } from "@/components/pages/page-icon";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { commentsStore, pagesStore, profilesStore, readsStore } from "@/lib/data";
import { MEMBERS, type Who } from "@/lib/members";
import { PAGE_ICONS, ago, breadcrumb, childrenOf, createPage, deletePage, isFolder, moveTargets, pageHref, pageTitle } from "@/lib/pages";
import { newId, useRows } from "@/lib/store";
import type { PageRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const PageEditor = dynamic(() => import("@/components/pages/editor"), {
  ssr: false,
  loading: () => <p className="py-6 text-[14px] text-faint">Ouverture du document…</p>,
});

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}
const useIsDark = () => useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains("dark"), () => true);

const iconBtn = "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground";

export function PageView({ id }: { id: string }) {
  const me = useMe();
  const router = useRouter();
  const dark = useIsDark();
  const pages = useRows(pagesStore);
  const comments = useRows(commentsStore);
  const reads = useRows(readsStore);
  const profiles = useRows(profilesStore);
  const page = pages.find((p) => p.id === id);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState<{ blockId: string; quote: string } | null>(null);
  const threads = useMarginThreads(id);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const titleTimer = useRef<number | null>(null);

  const other: Who = me.short === "max" ? "adrien" : "max";
  const openThreads = comments.filter((c) => c.page_id === id && !c.parent_id && !c.resolved_at).length;
  const myUnread = useMemo(() => reads.filter((r) => r.page_id === id && r.for_who === me.short && !r.read_at), [reads, id, me.short]);
  const sentToOther = reads.filter((r) => r.page_id === id && r.for_who === other).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  // Ouvrir la page = l'avoir lue.
  useEffect(() => {
    myUnread.forEach((r) => void readsStore.update(r.id, { read_at: new Date().toISOString() }));
  }, [myUnread]);

  // Le titre suit les modifications de l'autre personne tant qu'on n'est pas en train de l'écrire.
  useEffect(() => {
    const el = titleRef.current;
    if (el && page && document.activeElement !== el && el.value !== page.title) el.value = page.title;
  }, [page]);

  if (!page || page.archived_at) {
    return (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <div>
          <p className="text-[15px] text-muted-foreground">{pagesStore.loaded ? "Cette page n'existe plus." : "Ouverture…"}</p>
          {pagesStore.loaded && <Link href="/pages" className="mt-3 inline-block text-[13.5px] underline underline-offset-4">Toutes les pages</Link>}
        </div>
      </div>
    );
  }
  const trail = breadcrumb(pages, page.id);
  const kids = childrenOf(pages, page.id);
  const editorName = profiles.find((p) => p.id === page.updated_by)?.name;
  const go = (pid: string) => router.push(pageHref(pid));
  const touch = { updated_by: me.id, updated_at: new Date().toISOString() };

  function send(note: string) {
    void readsStore.insert({ id: newId(), page_id: page!.id, for_who: other, note: note.trim() || null, sent_by: me.id, created_at: new Date().toISOString(), read_at: null });
    toast(`Envoyé à ${MEMBERS[other].nick}`, { description: "Le document est dans sa liste « À lire »." });
  }
  function copyLink() {
    void navigator.clipboard.writeText(window.location.origin + pageHref(page!.id)).then(
      () => toast("Lien copié"),
      () => toast.error("Impossible de copier le lien"),
    );
  }
  function jump(blockId: string) {
    const el = document.querySelector<HTMLElement>(`.qg-editor [data-id="${blockId}"]`);
    if (!el) return toast("Ce passage a été supprimé.");
    setCommentsOpen(false);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("qg-flash");
    void el.offsetWidth;
    el.classList.add("qg-flash");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ------------------------------------------------------- barre du haut */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-3 md:px-4">
        <nav aria-label="Fil d'Ariane" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-[13px] text-muted-foreground">
          <Link href="/pages" className="shrink-0 rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground">Pages</Link>
          {trail.map((p, i) => (
            <span key={p.id} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />
              {i === trail.length - 1 ? (
                <span className="truncate px-1.5 py-1 text-foreground" aria-current="page">{pageTitle(p)}</span>
              ) : (
                <Link href={pageHref(p.id)} className="truncate rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground">{pageTitle(p)}</Link>
              )}
            </span>
          ))}
        </nav>

        {sentToOther && (
          <span className="hidden items-center gap-1 text-[12px] text-faint lg:inline-flex" title={`Envoyé ${ago(sentToOther.created_at)}`}>
            <BookOpenCheck className="size-3.5" aria-hidden />
            {sentToOther.read_at ? `Lu par ${MEMBERS[other].nick}` : `À lire pour ${MEMBERS[other].nick}`}
          </span>
        )}
        <SendPopover other={other} onSend={send} />
        <button type="button" onClick={copyLink} className={iconBtn} title="Copier le lien" aria-label="Copier le lien">
          <Link2 className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => setCommentsOpen(true)} className={cn(iconBtn, "w-auto gap-1.5 px-2")} aria-label={`Commentaires, ${openThreads} fil ouvert`}>
          <MessageSquare className="size-4" aria-hidden />
          {openThreads > 0 && <span className="num text-[12px]">{openThreads}</span>}
        </button>
        <button
          type="button"
          onClick={() => void pagesStore.update(page.id, { favorite: !page.favorite })}
          className={iconBtn}
          aria-pressed={page.favorite}
          title={page.favorite ? "Retirer des favoris" : "Mettre en favori"}
          aria-label={page.favorite ? "Retirer des favoris" : "Mettre en favori"}
        >
          <Star className={cn("size-4", page.favorite && "fill-warn text-warn")} aria-hidden />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className={iconBtn} aria-label="Plus d'actions">
            <Ellipsis className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => go(createPage({ parent_id: page.id, created_by: me.id }).id)}>
              <Plus aria-hidden /> Nouvelle sous-page
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Ranger dans…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 w-60 overflow-y-auto">
                <DropdownMenuItem disabled={!page.parent_id} onSelect={() => void pagesStore.update(page.id, { parent_id: null })}>
                  Tout en haut
                </DropdownMenuItem>
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
                router.push(page.parent_id ? pageHref(page.parent_id) : "/pages");
              }}
            >
              <Trash2 aria-hidden /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* --------------------------------------------------------- le document */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full justify-center">
        <article className="w-full max-w-[780px] min-w-0 px-5 pt-10 pb-40 md:px-12 md:pt-16">
          <Popover>
            <PopoverTrigger className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground" aria-label="Changer l'icône de la page">
              <PageIcon icon={page.icon} className="size-6" />
            </PopoverTrigger>
            <PopoverContent align="start" className="glass-strong w-auto rounded-2xl border-0 p-2">
              <div className="grid grid-cols-6 gap-1">
                {Object.entries(PAGE_ICONS).map(([key, I]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={`Icône ${key}`}
                    aria-pressed={(page.icon ?? "file") === key}
                    onClick={() => void pagesStore.update(page.id, { icon: key })}
                    className={cn("grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground", (page.icon ?? "file") === key && "bg-accent text-now")}
                  >
                    <I className="size-[18px]" aria-hidden />
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <textarea
            ref={titleRef}
            defaultValue={page.title}
            rows={1}
            placeholder="Sans titre"
            aria-label="Titre de la page"
            autoFocus={!page.title}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                // L'éditeur peut encore être en train de s'ouvrir : on insiste un instant.
                let tries = 0;
                const focusEditor = () => {
                  const el = document.querySelector<HTMLElement>(".qg-editor [contenteditable=true]");
                  if (el) el.focus();
                  else if (tries++ < 30) window.setTimeout(focusEditor, 100);
                };
                focusEditor();
              }
            }}
            onChange={(e) => {
              const title = e.currentTarget.value.replace(/\n/g, " ");
              if (titleTimer.current) window.clearTimeout(titleTimer.current);
              titleTimer.current = window.setTimeout(() => void pagesStore.update(page.id, { title, ...touch }), 400);
            }}
            className="mt-5 w-full resize-none bg-transparent font-heading text-[clamp(2rem,5vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.025em] outline-none placeholder:text-faint [field-sizing:content]"
          />
          {isFolder(page) ? (
            <>
              <div className="mt-4 mb-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => go(createPage({ parent_id: page.id, created_by: me.id }).id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background">
                  <Plus className="size-4" aria-hidden /> Nouvelle page
                </button>
                <button type="button" onClick={() => go(createPage({ parent_id: page.id, folder: true, created_by: me.id }).id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground">
                  <FolderPlus className="size-4" aria-hidden /> Sous-dossier
                </button>
              </div>
              {kids.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {kids.map((k) => <PageCard key={k.id} page={k} pages={pages} by={profiles.find((p) => p.id === k.updated_by)?.name} />)}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-[13.5px] text-muted-foreground">Dossier vide.</p>
              )}
            </>
          ) : (
            <>
          <p className="mt-2 mb-6 flex items-center gap-2 text-[12.5px] text-faint">
            {editorName && <PersonAvatar who={profiles.find((p) => p.id === page.updated_by)?.short ?? "both"} size="xs" />}
            Modifié {editorName ? `par ${editorName} ` : ""}{ago(page.updated_at)}
          </p>

          <PageEditor
            page={page}
            dark={dark}
            onNavigate={go}
            onComment={(blockId, quote) => {
              setDraft({ blockId, quote });
              setCommentsOpen(true);
            }}
          />

          {kids.length > 0 && (
            <section className="mt-12 border-t border-line pt-5">
              <h2 className="mb-2 font-sans text-[12px] font-semibold tracking-[0.08em] text-faint uppercase">Sous-pages</h2>
              <ul className="flex flex-col">
                {kids.map((k) => <SubPage key={k.id} page={k} />)}
              </ul>
            </section>
          )}
            </>
          )}
        </article>
        {threads.length > 0 && !isFolder(page) && (
          <MarginComments threads={threads} onOpen={(blockId) => { jump(blockId); setCommentsOpen(true); }} />
        )}
        </div>
      </div>

      <Sheet open={commentsOpen} onOpenChange={(o) => { setCommentsOpen(o); if (!o) setDraft(null); }}>
        <SheetContent className="glass-strong w-full gap-0 overflow-y-auto border-0 p-5 sm:max-w-md">
          <SheetTitle className="mb-4 text-[17px] font-semibold">Commentaires</SheetTitle>
          <SheetDescription className="sr-only">Fils de commentaires de la page</SheetDescription>
          <Comments target={{ pageId: page.id }} draft={draft} onDraftDone={() => setDraft(null)} onJump={jump} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SubPage({ page }: { page: PageRow }) {
  return (
    <li>
      <Link href={pageHref(page.id)} className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14.5px] font-medium transition-colors duration-100 hover:bg-accent">
        <PageIcon icon={page.icon} className="size-4 text-muted-foreground" />
        {pageTitle(page)}
      </Link>
    </li>
  );
}

/** « Envoyer à Adrien » : met le document dans sa liste À lire, avec un mot facultatif. */
function SendPopover({ other, onSend }: { other: Who; onSend: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const nick = MEMBERS[other].nick;
  const submit = () => {
    onSend(note);
    setNote("");
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-2.5 text-[12.5px] font-semibold text-background transition-opacity duration-100 hover:opacity-85">
        <Send className="size-3.5" aria-hidden />
        <span className="max-sm:sr-only">Envoyer à {nick}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass-strong w-72 rounded-2xl border-0 p-3">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold">
          <PersonAvatar who={other} size="xs" /> À lire pour {nick}
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Le document apparaît dans sa liste « À lire », avec un compteur dans son menu.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Un mot pour l'accompagner (facultatif)"
          aria-label="Mot d'accompagnement"
          rows={2}
          className="mt-2.5 w-full resize-none rounded-lg border border-line bg-glass p-2 text-[13px] outline-none placeholder:text-faint focus:border-line-strong"
        />
        <button type="button" onClick={submit} className="mt-2 h-9 w-full rounded-lg bg-foreground text-[13px] font-semibold text-background">
          Envoyer à {nick}
        </button>
      </PopoverContent>
    </Popover>
  );
}
