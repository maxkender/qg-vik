"use client";

import { useState, type ReactNode } from "react";
import { PersonAvatar } from "@/components/person-avatar";
import { useView } from "@/components/app/view-state";
import { defaultBucket } from "@/components/planner/quick-add";
import { useMe } from "@/components/session-provider";
import { addDays, addMonths, bucketLabel, dayKey, monday, monthKey, parseBucket, weekKey, yearKey } from "@/lib/dates";
import { createItem, OWNER_LABEL, PRIO_LABEL } from "@/lib/items";
import type { Owner } from "@/lib/members";
import { parseQuickAdd } from "@/lib/quick-add";
import type { Prio } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIO_HINT: Record<Prio, string> = { urgent: "aujourd'hui ou demain", normal: "cette semaine", later: "quand on aura le temps" };
const PRIO_ON: Record<Prio, string> = {
  urgent: "border-bad/60 bg-bad-soft text-bad",
  normal: "border-info/60 bg-info-soft text-info",
  later: "border-line-strong bg-accent text-foreground",
};
const pill = "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-[13px] font-medium transition-colors duration-100";
const off = "border-line text-muted-foreground hover:text-foreground";
const label = "mb-1.5 block text-[11px] font-semibold tracking-[0.1em] text-faint uppercase";

/** Degré d'urgence : trois niveaux bien visibles. */
export function PrioPicker({ value, onChange }: { value: Prio; onChange: (p: Prio) => void }) {
  return (
    <div role="radiogroup" aria-label="Urgence" className="flex gap-1.5">
      {(Object.keys(PRIO_LABEL) as Prio[]).map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} title={PRIO_HINT[p]} onClick={() => onChange(p)} className={cn(pill, value === p ? PRIO_ON[p] : off)}>
          {PRIO_LABEL[p]}
        </button>
      ))}
    </div>
  );
}

/** À qui est la tâche : Max, Adrien ou les deux. */
export function OwnerPicker({ value, onChange }: { value: Owner; onChange: (o: Owner) => void }) {
  return (
    <div role="radiogroup" aria-label="Assignée à" className="flex gap-1.5">
      {(Object.keys(OWNER_LABEL) as Owner[]).map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={cn(pill, value === o ? "border-line-strong bg-accent text-foreground" : off)}>
          <PersonAvatar who={o} size="xs" /> {OWNER_LABEL[o]}
        </button>
      ))}
    </div>
  );
}

/** Échéance : un horizon (aujourd'hui, cette semaine, ce mois…) ou une date précise. */
export function BucketPicker({ value, onChange }: { value: string; onChange: (b: string) => void }) {
  const { today } = useView();
  const options: [string, string][] = [
    [dayKey(today), "Aujourd'hui"], [dayKey(addDays(today, 1)), "Demain"], [weekKey(today), "Cette semaine"],
    [weekKey(addDays(monday(today), 7)), "Semaine prochaine"], [monthKey(today), "Ce mois"], [monthKey(addMonths(today, 1)), "Mois prochain"],
    [yearKey(today), "Cette année"], ["life", "Vie"], ["inbox", "Inbox (sans date)"],
  ];
  const known = options.some(([b]) => b === value);
  const parsed = parseBucket(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Échéance" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none focus:border-line-strong">
        {!known && <option value={value}>{bucketLabel(value, today)}</option>}
        {options.map(([b, l]) => (
          <option key={b} value={b}>{l}</option>
        ))}
      </select>
      <input
        type="date"
        aria-label="Date précise"
        value={parsed.kind === "d" ? value.slice(2) : ""}
        onChange={(e) => e.target.value && onChange(`d:${e.target.value}`)}
        className="h-9 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none focus:border-line-strong"
      />
    </div>
  );
}

export function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <span className={label}>{title}</span>
      {children}
    </div>
  );
}

/** Nouvelle tâche complète : titre, description, urgence, personne, échéance. */
export function NewTaskForm({ onDone }: { onDone: () => void }) {
  const me = useMe();
  const { who, today } = useView();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [prio, setPrio] = useState<Prio>("normal");
  const [owner, setOwner] = useState<Owner>(who !== "all" ? who : me.short);
  const [bucket, setBucket] = useState<string | null>(null);

  function submit() {
    // Dans le titre, seuls « !urgent » et « @adrien » sont lus : l'échéance a son propre champ.
    const q = parseQuickAdd(title, today, { dates: false });
    if (!q.title) return;
    const p = q.prio ?? prio;
    createItem({ title: q.title, notes: notes.trim() || null, prio: p, owner: q.owner ?? owner, bucket: bucket ?? defaultBucket(p, today), created_by: me.id });
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Titre de la tâche"
        aria-label="Titre de la tâche"
        className="w-full bg-transparent font-heading text-[22px] font-extrabold tracking-[-0.02em] outline-none placeholder:text-faint"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="Description : le contexte, ce qui est attendu, les liens utiles…"
        aria-label="Description"
        rows={3}
        className="min-h-20 w-full resize-y rounded-xl border border-line bg-glass p-3 text-[13.5px] outline-none placeholder:text-faint focus:border-line-strong [field-sizing:content]"
      />
      <Field title="Urgence"><PrioPicker value={prio} onChange={setPrio} /></Field>
      <Field title="Assignée à"><OwnerPicker value={owner} onChange={setOwner} /></Field>
      <Field title="Échéance"><BucketPicker value={bucket ?? defaultBucket(prio, today)} onChange={setBucket} /></Field>
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11.5px] text-faint max-sm:hidden">Astuce : « !urgent » et « @adrien » dans le titre marchent aussi.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className="h-9 rounded-lg border border-line px-3 text-[13px] text-muted-foreground">Annuler</button>
          <button type="submit" disabled={!title.trim()} className="h-9 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-40">Créer la tâche</button>
        </div>
      </div>
    </form>
  );
}
