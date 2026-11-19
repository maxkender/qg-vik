"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Mic, Plus, Send, Square, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { useMeetingRecorder } from "@/components/meetings/use-recorder";
import { AddLine, EditableTitle, Tick } from "@/components/planner/item-card";
import { ItemLinks } from "@/components/planner/item-links";
import { BucketPicker, Field, MeetingFields, RepeatPicker } from "@/components/planner/task-form";
import { useMe } from "@/components/session-provider";
import { itemLinksStore, itemsStore, messagesStore } from "@/lib/data";
import { bucketLabel, cap, dayKey, longDate, parseBucket } from "@/lib/dates";
import { byOrder, createItem, OWNER_NAME, REPEAT_LABEL, toggleDone } from "@/lib/items";
import { MEMBERS, type Who } from "@/lib/members";
import { pageHref } from "@/lib/pages";
import { newId, useRows } from "@/lib/store";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE = { max: "bg-max-soft text-max", adrien: "bg-adrien-soft text-adrien", both: "bg-both-soft text-both" } as const;
/** Quand a lieu la réunion : son jour, sinon le début de sa période. */
const whenOf = (i: Item) => (parseBucket(i.bucket).start?.getTime() ?? Number.MAX_SAFE_INTEGER) + (i.at_time ? Number(i.at_time.slice(0, 2)) * 36e5 + Number(i.at_time.slice(3)) * 6e4 : 0);
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const dateLine = (i: Item, today: Date) => {
  const start = i.bucket.startsWith("d:") ? parseBucket(i.bucket).start : null;
  return `${start ? cap(longDate(start)) : bucketLabel(i.bucket, today)}${i.at_time ? ` · ${i.at_time.replace(":", "h")}` : ""}`;
};

/** L'enregistrement à la voix : on parle, l'assistant transcrit puis écrit le compte rendu dans la page de la réunion. */
function Recorder({ item }: { item: Item }) {
  const router = useRouter();
  const rec = useMeetingRecorder();
  const [writing, setWriting] = useState(false);

  async function finish() {
    const transcript = await rec.stop();
    if (transcript.trim().length < 20) {
      rec.reset();
      return void rec.setError("L'enregistrement ne contient pas de parole audible.");
    }
    setWriting(true);
    try {
      const res = await fetch("/api/assistant/reunion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: item.id, transcript }) });
      const json = (await res.json().catch(() => null)) as { page_id?: string; error?: string } | null;
      if (!res.ok || !json?.page_id) throw new Error(json?.error ?? "Le compte rendu n'a pas pu être écrit.");
      const id = json.page_id;
      void itemLinksStore.load();
      toast("Compte rendu écrit", { description: "Résumé, décisions, actions et transcription.", action: { label: "Ouvrir", onClick: () => router.push(pageHref(id)) } });
    } catch (e) {
      rec.setError(e instanceof Error ? e.message : "Le compte rendu n'a pas pu être écrit.");
    }
    setWriting(false);
    rec.reset();
  }

  const busy = rec.state === "finishing" || writing;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        {rec.state === "recording" ? (
          <button type="button" onClick={() => void finish()} className="inline-flex h-10 items-center gap-2 rounded-full bg-bad px-4 text-[13.5px] font-semibold text-white">
            <Square className="size-3.5 fill-current" aria-hidden /> Arrêter et écrire le compte rendu
          </button>
        ) : busy ? null : (
          <button type="button" onClick={() => void rec.start()} className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background">
            <Mic className="size-4" aria-hidden /> Enregistrer la réunion
          </button>
        )}
        {rec.state === "recording" && (
          <span role="status" className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-bad" aria-hidden />
            <span className="num text-foreground">{clock(rec.seconds)}</span> en cours, garde cet onglet ouvert
          </span>
        )}
        {busy && <span role="status" className="animate-pulse text-[13px] text-muted-foreground">{writing ? "L'assistant écrit le compte rendu…" : "Transcription de la fin…"}</span>}
      </div>
      {rec.error && <p className="text-[12.5px] text-bad">{rec.error}</p>}
      {rec.state === "idle" && !busy && <p className="text-[12.5px] text-muted-foreground">Le micro de cet appareil écoute la pièce. En visio avec un casque, la voix de l&apos;autre n&apos;est pas captée : mets le son sur haut-parleur. L&apos;audio n&apos;est pas conservé.</p>}
    </div>
  );
}

function Detail({ item }: { item: Item }) {
  const me = useMe();
  const { today, setOpenItem } = useView();
  const router = useRouter();
  const items = useRows(itemsStore);
  const links = useRows(itemLinksStore);
  const other: Who = me.short === "max" ? "adrien" : "max";
  const points = items.filter((i) => i.parent_id === item.id).sort(byOrder);
  const taskLinks = links.filter((l) => l.item_id === item.id && l.task_id);
  const tasks = taskLinks.map((l) => ({ link: l, task: items.find((i) => i.id === l.task_id) })).filter((t) => t.task);
  const candidates = items
    .filter((i) => !i.parent_id && !i.done && i.category !== "reunion" && i.id !== item.id && !taskLinks.some((l) => l.task_id === i.id))
    .sort((x, y) => x.title.localeCompare(y.title, "fr"));

  function invite() {
    void itemsStore.update(item.id, { owner: "both" });
    void messagesStore.insert({ id: newId(), to_who: other, from_who: me.short, body: `Réunion « ${item.title} » · ${dateLine(item, today)}`, url: `${window.location.origin}/reunions?id=${item.id}`, read_at: null, created_by: me.id, created_at: new Date().toISOString() });
    toast(`${MEMBERS[other].nick} est invité`, { description: "Il le voit sur son profil, avec le lien de la réunion." });
  }
  function remove() {
    if (!window.confirm(`Supprimer la réunion « ${item.title} » ? Son compte rendu reste dans les pages.`)) return;
    points.forEach((p) => void itemsStore.remove(p.id));
    void itemsStore.remove(item.id);
    router.replace("/reunions");
  }

  return (
    <article className="glass flex min-w-0 flex-col gap-5 rounded-2xl p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <Tick checked={item.done} onChange={() => void toggleDone(item)} label={item.done ? "Rouvrir la réunion" : "Marquer la réunion comme passée"} />
          <div className="min-w-0 flex-1">
            <EditableTitle value={item.title} done={item.done} onSave={(title) => void itemsStore.update(item.id, { title })} className="w-fit max-w-full font-heading text-[24px] leading-8 font-semibold tracking-[-0.02em]" />
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden /> {dateLine(item, today)}
              <span className={cn("rounded-md px-1.5 text-[11.5px] leading-[19px] font-semibold", TONE[item.owner])}>{item.owner === "both" ? "Max et Adrien" : OWNER_NAME[item.owner]}</span>
              {item.repeat_rule && <span>{REPEAT_LABEL[item.repeat_rule].toLowerCase()}</span>}
            </p>
          </div>
          <button type="button" onClick={remove} aria-label="Supprimer la réunion" title="Supprimer la réunion" className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-bad-soft hover:text-bad"><Trash2 className="size-4" aria-hidden /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.meet_url && (
            <a href={item.meet_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background"><Video className="size-4" aria-hidden /> Rejoindre le Meet</a>
          )}
          <button type="button" onClick={invite} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium transition-colors duration-100 hover:border-line-strong">
            <Send className="size-4" aria-hidden /> Inviter {MEMBERS[other].nick}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <Field title="Quand"><BucketPicker value={item.bucket} onChange={(bucket) => { void itemsStore.update(item.id, { bucket }); points.forEach((p) => void itemsStore.update(p.id, { bucket })); }} /></Field>
        <Field title="Heure et lien Google Meet"><MeetingFields time={item.at_time} url={item.meet_url} onTime={(at_time) => void itemsStore.update(item.id, { at_time })} onUrl={(meet_url) => void itemsStore.update(item.id, { meet_url })} /></Field>
      </div>
      <Field title="Répéter"><RepeatPicker value={item.repeat_rule} onChange={(repeat_rule) => void itemsStore.update(item.id, { repeat_rule })} /></Field>

      <Field title="Objectif de la réunion">
        <textarea
          key={item.id + (item.notes ?? "")}
          defaultValue={item.notes ?? ""}
          placeholder="Pourquoi on se voit, et ce qu'on doit avoir décidé en sortant."
          aria-label="Objectif de la réunion"
          onKeyDown={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v !== (item.notes ?? "")) void itemsStore.update(item.id, { notes: v || null });
          }}
          className="min-h-16 w-full resize-y rounded-xl border border-line bg-glass p-3 text-[13.5px] leading-relaxed outline-none placeholder:text-faint focus:border-line-strong [field-sizing:content]"
        />
      </Field>

      <Field title={`Ordre du jour${points.length ? ` · ${points.filter((p) => p.done).length}/${points.length} traités` : ""}`}>
        <div className="flex flex-col">
          {points.map((p) => (
            <div key={p.id} className="group flex items-start gap-2 py-1">
              <Tick small checked={p.done} onChange={() => void toggleDone(p)} label="Traité" />
              <EditableTitle value={p.title} done={p.done} className="text-[14px] leading-5" onSave={(title) => void itemsStore.update(p.id, { title })} />
              <button type="button" onClick={() => void itemsStore.remove(p.id)} aria-label={`Retirer ${p.title}`} className="grid size-5 shrink-0 place-items-center rounded text-faint opacity-0 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100"><X className="size-3.5" aria-hidden /></button>
            </div>
          ))}
          <AddLine small placeholder="Ajouter un point à aborder…" onAdd={(title) => void createItem({ title, bucket: item.bucket, owner: item.owner, parent_id: item.id, created_by: me.id })} />
        </div>
      </Field>

      <Field title="Tâches à discuter">
        <div className="flex flex-col gap-1.5">
          {tasks.map(({ link, task }) => (
            <div key={link.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
              <Tick small checked={task!.done} onChange={() => void toggleDone(task!)} label="Faite" />
              <button type="button" onClick={() => setOpenItem(task!.id)} className={cn("min-w-0 flex-1 truncate text-left text-[13.5px] font-medium hover:underline", task!.done && "text-faint line-through")}>{task!.title}</button>
              <span className={cn("shrink-0 rounded-md px-1.5 text-[11px] leading-[18px] font-semibold", TONE[task!.owner])}>{OWNER_NAME[task!.owner]}</span>
              <button type="button" onClick={() => void itemLinksStore.remove(link.id)} aria-label={`Retirer ${task!.title}`} className="grid size-6 shrink-0 place-items-center rounded-md text-faint hover:bg-accent hover:text-foreground"><X className="size-3.5" aria-hidden /></button>
            </div>
          ))}
          <select
            value=""
            aria-label="Ajouter une tâche à discuter"
            onChange={(e) => e.target.value && void itemLinksStore.insert({ id: newId(), item_id: item.id, page_id: null, url: null, task_id: e.target.value, title: null, created_by: me.id, created_at: new Date().toISOString() })}
            className="h-9 w-full rounded-lg border border-line bg-glass px-2.5 text-[13px] text-muted-foreground outline-none focus:border-line-strong"
          >
            <option value="">Ajouter une tâche à discuter…</option>
            {candidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
      </Field>

      <Field title="Compte rendu">
        <div className="flex flex-col gap-3">
          <Recorder key={item.id} item={item} />
          <ItemLinks item={item} />
        </div>
      </Field>
    </article>
  );
}

export function MeetingsView() {
  const me = useMe();
  const { today } = useView();
  const router = useRouter();
  const id = useSearchParams().get("id");
  const items = useRows(itemsStore);

  const { upcoming, past } = useMemo(() => {
    const all = items.filter((i) => i.category === "reunion" && !i.parent_id);
    const isPast = (i: Item) => i.done || (parseBucket(i.bucket).end?.getTime() ?? Infinity) < today.getTime();
    return {
      upcoming: all.filter((i) => !isPast(i)).sort((a, b) => whenOf(a) - whenOf(b)),
      past: all.filter(isPast).sort((a, b) => whenOf(b) - whenOf(a)).slice(0, 30),
    };
  }, [items, today]);
  const current = items.find((i) => i.id === id && i.category === "reunion") ?? (id ? undefined : upcoming[0]);

  function create() {
    const last = items.filter((i) => i.meet_url).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.meet_url ?? null;
    const item = createItem({ title: "Nouvelle réunion", category: "reunion", owner: "both", bucket: dayKey(today), meet_url: last, created_by: me.id });
    router.replace(`/reunions?id=${item.id}`);
  }

  const Row = (i: Item) => (
    <li key={i.id}>
      <Link href={`/reunions?id=${i.id}`} replace aria-current={current?.id === i.id ? "page" : undefined} className={cn("block rounded-xl px-3 py-2 transition-colors duration-100", current?.id === i.id ? "bg-accent" : "hover:bg-accent/60")}>
        <span className={cn("block truncate text-[14px] font-medium", i.done && "text-faint line-through")}>{i.title}</span>
        <span className="num block truncate text-[11.5px] text-muted-foreground">{dateLine(i, today)}</span>
      </Link>
    </li>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Réunions">
        <button type="button" onClick={create} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background">
          <Plus className="size-4" aria-hidden /> Nouvelle réunion
        </button>
      </ViewHeader>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 px-4 pb-24 md:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Réunions" className="glass rounded-2xl p-2">
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">À venir</p>
          {upcoming.length ? <ul>{upcoming.map(Row)}</ul> : <p className="px-3 pb-2 text-[13px] text-muted-foreground">Aucune réunion prévue.</p>}
          {past.length > 0 && (
            <>
              <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">Passées</p>
              <ul>{past.map(Row)}</ul>
            </>
          )}
        </nav>
        {current ? (
          <Detail key={current.id} item={current} />
        ) : (
          <button type="button" onClick={create} className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center transition-colors duration-100 hover:bg-glass">
            <p className="text-[16px] font-semibold">{id ? "Cette réunion n'existe plus" : "Planifie ta première réunion"}</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Objectif, ordre du jour, tâches à discuter, lien Meet, puis le compte rendu à la voix.</p>
          </button>
        )}
      </div>
    </div>
  );
}
