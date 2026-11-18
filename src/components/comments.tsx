"use client";

import { useMemo, useState } from "react";
import { Check, CornerDownRight, RotateCcw, Send, Trash2 } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import { commentsStore, profilesStore } from "@/lib/data";
import { ago } from "@/lib/pages";
import { newId, useRows } from "@/lib/store";
import type { CommentRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type Target = { pageId: string } | { itemId: string };

/** Zone de saisie d'un commentaire : Entrée envoie, Maj+Entrée va à la ligne. */
function Composer({ onSend, placeholder, autoFocus, small }: { onSend: (body: string) => void; placeholder: string; autoFocus?: boolean; small?: boolean }) {
  const [text, setText] = useState("");
  const send = () => {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText("");
  };
  return (
    <div className={cn("flex items-end gap-2 rounded-xl border border-line bg-glass p-1.5 transition-colors duration-100 focus-within:border-line-strong", small && "rounded-lg p-1")}>
      <textarea
        value={text}
        autoFocus={autoFocus}
        rows={1}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="max-h-40 min-h-7 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[13.5px] outline-none placeholder:text-faint [field-sizing:content]"
      />
      <button
        type="button"
        onClick={send}
        disabled={!text.trim()}
        aria-label="Envoyer le commentaire"
        className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-background transition-opacity duration-100 disabled:opacity-30"
      >
        <Send className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Fils de commentaires d'une page ou d'une tâche : réponses, « résolu », suppression de ses propres messages.
 * `draft` pré-remplit un nouveau fil accroché à un passage de la page.
 */
export function Comments({
  target, draft, onDraftDone, onJump,
}: {
  target: Target;
  draft?: { blockId: string; quote: string } | null;
  onDraftDone?: () => void;
  onJump?: (blockId: string) => void;
}) {
  const me = useMe();
  const all = useRows(commentsStore);
  const profiles = useRows(profilesStore);
  const [showResolved, setShowResolved] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const shortOf = (id: string | null) => profiles.find((p) => p.id === id)?.short ?? "both";
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.name ?? "Quelqu'un";

  const { threads, replies, resolvedCount } = useMemo(() => {
    const mine = all.filter((c) => ("pageId" in target ? c.page_id === target.pageId : c.item_id === target.itemId));
    const roots = mine.filter((c) => !c.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const map = new Map<string, CommentRow[]>();
    mine.filter((c) => c.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((c) => map.set(c.parent_id!, [...(map.get(c.parent_id!) ?? []), c]));
    return { threads: roots, replies: map, resolvedCount: roots.filter((r) => r.resolved_at).length };
  }, [all, target]);

  function post(body: string, parent: string | null, blockId: string | null = null) {
    const now = new Date().toISOString();
    void commentsStore.insert({
      id: newId(),
      page_id: "pageId" in target ? target.pageId : null,
      item_id: "itemId" in target ? target.itemId : null,
      block_id: blockId,
      parent_id: parent,
      body,
      resolved_at: null,
      resolved_by: null,
      created_by: me.id,
      created_at: now,
      updated_at: now,
    });
  }

  const visible = threads.filter((t) => showResolved || !t.resolved_at);

  const message = (c: CommentRow, root?: boolean) => (
    <div className="group/msg flex gap-2.5">
      <PersonAvatar who={shortOf(c.created_by)} size="xs" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-[12.5px]">
          <span className="font-semibold">{nameOf(c.created_by)}</span>
          <span className="num text-[11px] text-faint">{ago(c.created_at)}</span>
          {c.created_by === me.id && (
            <button
              type="button"
              aria-label="Supprimer mon commentaire"
              onClick={() => void commentsStore.remove(c.id)}
              className="ml-auto text-faint opacity-0 transition-opacity duration-100 group-hover/msg:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100"
            >
              <Trash2 className="size-3" aria-hidden />
            </button>
          )}
        </p>
        <p className={cn("text-[13.5px] break-words whitespace-pre-wrap", root ? "text-foreground" : "text-foreground/90")}>{c.body}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {draft ? (
        <div className="rounded-xl border border-now/50 bg-now-soft p-2.5">
          {draft.quote && <p className="mb-2 line-clamp-3 border-l-2 border-now pl-2 text-[12.5px] text-muted-foreground italic">{draft.quote}</p>}
          <Composer
            autoFocus
            placeholder="Ton commentaire sur ce passage…"
            onSend={(body) => {
              post(draft.quote ? `« ${draft.quote} »\n${body}` : body, null, draft.blockId);
              onDraftDone?.();
            }}
          />
          <button type="button" onClick={onDraftDone} className="mt-1.5 text-[12px] text-muted-foreground hover:text-foreground">Annuler</button>
        </div>
      ) : (
        <Composer placeholder="Ajouter un commentaire…" onSend={(body) => post(body, null)} />
      )}

      {visible.length === 0 && <p className="py-2 text-[13px] text-faint">{threads.length ? "Tous les fils sont résolus." : "Pas encore de commentaire."}</p>}

      {visible.map((t) => (
        <div key={t.id} className={cn("glass rounded-xl p-3", t.resolved_at && "opacity-60")}>
          {t.block_id && onJump && (
            <button type="button" onClick={() => onJump(t.block_id!)} className="mb-1.5 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
              <CornerDownRight className="size-3" aria-hidden /> Voir le passage
            </button>
          )}
          {message(t, true)}
          {(replies.get(t.id) ?? []).map((r) => (
            <div key={r.id} className="mt-2.5 border-t border-line pt-2.5">
              {message(r)}
            </div>
          ))}
          <div className="mt-2.5 flex items-center gap-3 text-[12px] text-muted-foreground">
            {!t.resolved_at && (
              <button type="button" onClick={() => setReplyTo(replyTo === t.id ? null : t.id)} className="hover:text-foreground">Répondre</button>
            )}
            <button
              type="button"
              onClick={() => void commentsStore.update(t.id, t.resolved_at ? { resolved_at: null, resolved_by: null } : { resolved_at: new Date().toISOString(), resolved_by: me.id })}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              {t.resolved_at ? <><RotateCcw className="size-3" aria-hidden /> Rouvrir</> : <><Check className="size-3" aria-hidden /> Résoudre</>}
            </button>
          </div>
          {replyTo === t.id && (
            <div className="mt-2">
              <Composer small autoFocus placeholder="Répondre…" onSend={(body) => { post(body, t.id); setReplyTo(null); }} />
            </div>
          )}
        </div>
      ))}

      {resolvedCount > 0 && (
        <button type="button" onClick={() => setShowResolved((v) => !v)} className="self-start text-[12px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {showResolved ? "Masquer les fils résolus" : `Voir ${resolvedCount} fil${resolvedCount > 1 ? "s" : ""} résolu${resolvedCount > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
