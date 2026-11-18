"use client";

import { useMemo, useState, type Ref } from "react";
import { CornerDownLeft, Plus } from "lucide-react";
import { useView } from "@/components/app/view-state";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import { bucketLabel, dayKey, weekKey } from "@/lib/dates";
import { createItem, OWNER_LABEL, PRIO_LABEL } from "@/lib/items";
import type { Owner } from "@/lib/members";
import { parseQuickAdd } from "@/lib/quick-add";
import type { Prio } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Horizon par défaut selon la priorité : urgent = aujourd'hui, à faire = cette semaine, plus tard = inbox. */
export function defaultBucket(prio: Prio, today: Date): string {
  return prio === "urgent" ? dayKey(today) : prio === "later" ? "inbox" : weekKey(today);
}

/** Crée une tâche à partir d'une ligne tapée (« Appeler le comptable !urgent @adrien demain »). */
export function useQuickCreate() {
  const me = useMe();
  const { who, today } = useView();
  return (text: string, defaults: { prio?: Prio; bucket?: string } = {}) => {
    const q = parseQuickAdd(text, today);
    if (!q.title) return null;
    const prio = q.prio ?? defaults.prio ?? "normal";
    const owner: Owner = q.owner ?? (who !== "all" ? who : me.short);
    return createItem({
      title: q.title,
      prio,
      owner,
      bucket: q.bucket ?? defaults.bucket ?? defaultBucket(prio, today),
      created_by: me.id,
    });
  };
}

const PRIO_TONE: Record<Prio, string> = {
  urgent: "bg-bad-soft text-bad",
  normal: "bg-info-soft text-info",
  later: "bg-muted text-muted-foreground",
};

/** Ajout rapide en une ligne, avec aperçu de ce qui a été compris. */
export function QuickAdd({
  inputRef, autoFocus, onDone, className,
}: {
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const me = useMe();
  const { who, today } = useView();
  const create = useQuickCreate();
  const [text, setText] = useState("");

  const preview = useMemo(() => {
    const q = parseQuickAdd(text, today);
    const prio = q.prio ?? "normal";
    return {
      title: q.title,
      prio,
      owner: q.owner ?? (who !== "all" ? who : me.short),
      bucket: q.bucket ?? defaultBucket(prio, today),
    };
  }, [text, today, who, me.short]);

  function submit() {
    if (create(text)) {
      setText("");
      onDone?.();
    }
  }

  return (
    <div className={cn("glass rounded-2xl px-3.5 py-2.5 transition-colors duration-100 focus-within:border-line-strong", className)}>
      <div className="flex items-center gap-2.5">
        <Plus className="size-4 shrink-0 text-faint" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={text}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              if (text) setText("");
              else {
                e.currentTarget.blur();
                onDone?.();
              }
            }
          }}
          placeholder="Nouvelle tâche…  ex. Relancer le comptable !urgent @adrien demain"
          aria-label="Nouvelle tâche"
          className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-faint"
        />
        {text.trim() && (
          <button
            type="button"
            onClick={submit}
            aria-label="Ajouter la tâche"
            className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground text-background"
          >
            <CornerDownLeft className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      {preview.title && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[26px] text-[11.5px]" aria-live="polite">
          <span className={cn("rounded-[5px] px-1.5 py-px font-semibold", PRIO_TONE[preview.prio])}>{PRIO_LABEL[preview.prio]}</span>
          <span className="inline-flex items-center gap-1 rounded-[5px] bg-muted px-1.5 py-px text-muted-foreground">
            <PersonAvatar who={preview.owner} size="xs" className="h-4 min-w-4 text-[9px]" />
            {OWNER_LABEL[preview.owner]}
          </span>
          <span className="num rounded-[5px] bg-muted px-1.5 py-px text-muted-foreground">{bucketLabel(preview.bucket, today)}</span>
        </div>
      )}
    </div>
  );
}
