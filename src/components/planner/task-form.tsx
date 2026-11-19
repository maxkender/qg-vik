"use client";

import { useState, type ReactNode } from "react";
import { Video } from "lucide-react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { useView } from "@/components/app/view-state";
import { defaultBucket } from "@/components/planner/quick-add";
import { useMe } from "@/components/session-provider";
import { itemsStore } from "@/lib/data";
import { CATEGORIES, type Category } from "@/lib/categories";
import { addDays, addMonths, bucketLabel, dayKey, monday, monthKey, parseBucket, weekKey, yearKey } from "@/lib/dates";
import { allTags, cleanMeetUrl, createItem, OWNER_LABEL, PRIO_LABEL, REPEAT_LABEL } from "@/lib/items";
import type { Owner } from "@/lib/members";
import { parseQuickAdd } from "@/lib/quick-add";
import type { Prio, RepeatRule } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIO_HINT: Record<Prio, string> = { urgent: "aujourd'hui ou demain", doing: "commencé, pas fini", normal: "cette semaine" };
const PRIO_ON: Record<Prio, string> = {
  urgent: "border-bad/60 bg-bad-soft text-bad",
  normal: "border-info/60 bg-info-soft text-info",
  doing: "border-now/60 bg-now-soft text-now",
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

/** Catégorie : support, recrutement, posts… Un second clic l'enlève. */
export function CategoryPicker({ value, onChange }: { value: Category | null; onChange: (c: Category | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Catégorie" className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={value === c.key}
          onClick={() => onChange(value === c.key ? null : c.key)}
          className={cn("flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-100", value === c.key ? "border-line-strong bg-accent text-foreground" : off)}
        >
          <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden /> {c.label}
        </button>
      ))}
    </div>
  );
}

const field = "h-9 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none focus:border-line-strong";

/** Labels libres d'une tâche : on coche ceux qui existent, ou on en tape un nouveau. */
export function TagPicker({ value, options, onChange }: { value: string[]; options: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const all = [...new Set([...options, ...value])];
  const toggle = (tag: string) => onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  function add() {
    const tag = draft.trim().replace(/^#/, "").slice(0, 30);
    if (!tag) return;
    const known = all.find((t) => t.toLowerCase() === tag.toLowerCase());
    if (!value.includes(known ?? tag)) onChange([...value, known ?? tag.charAt(0).toUpperCase() + tag.slice(1)]);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((tag) => (
        <button key={tag} type="button" aria-pressed={value.includes(tag)} onClick={() => toggle(tag)} className={cn("h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-100", value.includes(tag) ? "border-foreground bg-foreground text-background" : off)}>
          {tag}
        </button>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="+ Nouveau label"
        aria-label="Nouveau label"
        className="h-8 w-32 rounded-full border border-dashed border-line-strong bg-transparent px-3 text-[12.5px] outline-none placeholder:text-faint focus:border-foreground"
      />
    </div>
  );
}

/** Réunion : l'heure et le lien Google Meet, qu'on colle ou qu'on fait générer. */
export function MeetingFields({ time, url, onTime, onUrl }: { time: string | null; url: string | null; onTime: (t: string | null) => void; onUrl: (u: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  /** Demande à Google un lien Meet tout neuf, sans ouvrir la réunion. */
  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/meet", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { url?: string; error?: string; client?: boolean } | null;
      if (res.ok && json?.url) {
        onUrl(json.url);
        toast("Lien Meet créé", { description: "Personne n'est encore dans la réunion." });
      } else if (res.status === 503) {
        toast("Pas encore branché à Google Meet", {
          description: json?.client ? "Il reste à donner l'autorisation, une seule fois." : "En attendant, ce bouton ouvre un Meet dont tu colles l'adresse.",
          action: json?.client ? { label: "Autoriser", onClick: () => window.open("/api/meet/connect", "_self") } : { label: "Ouvrir Meet", onClick: () => window.open("https://meet.google.com/new", "_blank", "noreferrer") },
          duration: 12000,
        });
      } else toast.error(json?.error ?? "Google Meet n'a pas pu créer la salle.");
    } catch {
      toast.error("Google Meet est injoignable.");
    }
    setBusy(false);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <input type="time" aria-label="Heure" value={time ?? ""} onChange={(e) => onTime(e.target.value || null)} className={field} />
      <input
        key={url ?? ""}
        type="url"
        aria-label="Lien Google Meet"
        placeholder="Lien Google Meet"
        defaultValue={url ?? ""}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const next = cleanMeetUrl(e.currentTarget.value);
          if (next !== url) onUrl(next);
          if (!next) e.currentTarget.value = "";
        }}
        className={cn(field, "min-w-0 flex-1")}
      />
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background">
          <Video className="size-4" aria-hidden /> Rejoindre
        </a>
      ) : (
        <button type="button" disabled={busy} onClick={() => void generate()} title="Crée un lien Meet sans entrer dans la réunion" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium transition-colors duration-100 hover:border-line-strong disabled:opacity-50">
          <Video className={cn("size-4", busy && "animate-pulse")} aria-hidden /> {busy ? "Création…" : "Générer un lien"}
        </button>
      )}
    </div>
  );
}

export function RepeatPicker({ value, onChange }: { value: RepeatRule | null; onChange: (r: RepeatRule | null) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as RepeatRule | null)} aria-label="Répéter" className={cn(field, "w-full")}>
      <option value="">Ne se répète pas</option>
      {(Object.keys(REPEAT_LABEL) as RepeatRule[]).map((r) => (
        <option key={r} value={r}>{REPEAT_LABEL[r]}</option>
      ))}
    </select>
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
  const [category, setCategory] = useState<Category | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  // Par défaut, le dernier lien Meet utilisé : la salle habituelle.
  const [meet, setMeet] = useState<string | null>(() => itemsStore.getSnapshot().filter((i) => i.meet_url).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.meet_url ?? null);
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const meeting = category === "reunion";

  function submit() {
    // Dans le titre, seuls « !urgent » et « @adrien » sont lus : l'échéance a son propre champ.
    const q = parseQuickAdd(title, today, { dates: false });
    if (!q.title) return;
    const p = q.prio ?? prio;
    createItem({ title: q.title, notes: notes.trim() || null, prio: p, owner: q.owner ?? owner, category: q.category ?? category, tags: [...new Set([...tags, ...(q.tags ?? [])])], at_time: meeting ? (q.at_time ?? time) : null, meet_url: meeting ? meet : null, repeat_rule: repeat, bucket: bucket ?? (meeting ? dayKey(today) : defaultBucket(p, today)), created_by: me.id });
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
        className="w-full bg-transparent font-heading text-[22px] font-semibold tracking-[-0.02em] outline-none placeholder:text-faint"
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
      <Field title="Catégorie"><CategoryPicker value={category} onChange={setCategory} /></Field>
      <Field title="Labels"><TagPicker value={tags} options={allTags(itemsStore.getSnapshot())} onChange={setTags} /></Field>
      {meeting && <Field title="Réunion"><MeetingFields time={time} url={meet} onTime={setTime} onUrl={setMeet} /></Field>}
      <Field title="Urgence"><PrioPicker value={prio} onChange={setPrio} /></Field>
      <Field title="Assignée à"><OwnerPicker value={owner} onChange={setOwner} /></Field>
      <Field title="Échéance"><BucketPicker value={bucket ?? (meeting ? dayKey(today) : defaultBucket(prio, today))} onChange={setBucket} /></Field>
      <Field title="Répéter"><RepeatPicker value={repeat} onChange={setRepeat} /></Field>
      <div className="flex items-center justify-between gap-3 pt-1">
        <span />
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className="h-9 rounded-lg border border-line px-3 text-[13px] text-muted-foreground">Annuler</button>
          <button type="submit" disabled={!title.trim()} className="h-9 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-40">Créer la tâche</button>
        </div>
      </div>
    </form>
  );
}
