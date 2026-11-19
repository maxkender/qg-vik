"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PersonAvatar } from "@/components/person-avatar";
import { commentsStore, profilesStore } from "@/lib/data";
import { ago } from "@/lib/pages";
import { useRows } from "@/lib/store";

const GAP = 8;

/** Les fils ouverts d'une page, posés dans la marge à la hauteur du passage commenté. */
export function useMarginThreads(pageId: string) {
  const comments = useRows(commentsStore);
  return useMemo(() => {
    const mine = comments.filter((c) => c.page_id === pageId);
    return mine
      .filter((c) => !c.parent_id && !c.resolved_at && c.block_id)
      .map((c) => ({ root: c, replies: mine.filter((r) => r.parent_id === c.id).length }));
  }, [comments, pageId]);
}

export function MarginComments({ threads, onOpen }: { threads: ReturnType<typeof useMarginThreads>; onOpen: (blockId: string) => void }) {
  const profiles = useRows(profilesStore);
  const box = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<Record<string, number>>({});

  useEffect(() => {
    const el = box.current;
    const article = el?.parentElement?.querySelector("article");
    if (!el || !article) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const origin = el.getBoundingClientRect().top;
        const wanted = threads
          .map((t) => ({ id: t.root.id, y: (document.querySelector(`.qg-editor [data-id="${t.root.block_id}"]`)?.getBoundingClientRect().top ?? Infinity) - origin }))
          .filter((w) => Number.isFinite(w.y))
          .sort((a, b) => a.y - b.y);
        // Deux commentaires proches ne se chevauchent pas : le second descend.
        const next: Record<string, number> = {};
        let floor = 0;
        for (const w of wanted) {
          const y = Math.max(w.y, floor);
          next[w.id] = y;
          floor = y + (el.querySelector<HTMLElement>(`[data-thread="${w.id}"]`)?.offsetHeight ?? 72) + GAP;
        }
        setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(article);
    const mutation = new MutationObserver(place);
    mutation.observe(article, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [threads]);

  return (
    <aside ref={box} aria-label="Commentaires dans la marge" className="relative w-[250px] shrink-0 max-xl:hidden">
      {threads.map(({ root, replies }) => {
        const author = profiles.find((p) => p.id === root.created_by);
        const top = tops[root.id];
        return (
          <button
            key={root.id}
            type="button"
            data-thread={root.id}
            onClick={() => onOpen(root.block_id!)}
            style={{ top: top ?? 0, visibility: top === undefined ? "hidden" : "visible" }}
            className="glass absolute right-4 left-0 rounded-xl p-2.5 text-left transition-colors duration-100 hover:border-line-strong"
          >
            <span className="flex items-center gap-2">
              <PersonAvatar who={author?.short ?? "both"} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] leading-tight font-semibold">{author?.name ?? "Quelqu'un"}</span>
                <span className="num block text-[10.5px] text-faint">{ago(root.created_at)}</span>
              </span>
            </span>
            <span className="mt-1.5 line-clamp-3 block text-[12.5px] leading-snug">{root.body}</span>
            {replies > 0 && <span className="mt-1 block text-[11.5px] text-muted-foreground">{replies} réponse{replies > 1 ? "s" : ""}</span>}
          </button>
        );
      })}
    </aside>
  );
}
