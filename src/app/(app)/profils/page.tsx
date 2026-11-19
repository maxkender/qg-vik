"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Camera, CheckCircle2, FileText, Gavel, MessageSquare, PlusCircle, Send, X, type LucideIcon } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import { commentsStore, decisionsStore, itemsStore, messagesStore, pagesStore, profilesStore } from "@/lib/data";
import { MEMBERS, type Who } from "@/lib/members";
import { ago, pageTitle } from "@/lib/pages";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";
import { newId, useRows } from "@/lib/store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Réduit la photo à un carré de 128 px et l'enregistre dans le profil. */
async function savePhoto(file: File, userId: string) {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 128, 128);
    const avatar = canvas.toDataURL("image/jpeg", 0.82);
    const { error } = await supabaseBrowser().from("profiles").update({ avatar }).eq("id", userId);
    if (error) throw error;
    await profilesStore.load();
    toast("Photo mise à jour");
  } catch {
    toast.error("Impossible d'enregistrer cette image");
  }
}

type Event = { at: string; icon: LucideIcon; text: string };
const URL_RE = /https?:\/\/\S+/i;

// Le profil de chacun : ses chiffres, ce qu'il a fait, et les retours ou liens qu'on lui envoie.
export default function ProfilesPage() {
  const me = useMe();
  const { today } = useView();
  const [who, setWho] = useState<Who>(me.short);
  const [draft, setDraft] = useState("");
  const person = MEMBERS[who];
  const mine = who === me.short;

  const items = useRows(itemsStore);
  const pages = useRows(pagesStore);
  const comments = useRows(commentsStore);
  const decisions = useRows(decisionsStore);
  const messages = useRows(messagesStore);
  const profiles = useRows(profilesStore);
  const uid = profiles.find((p) => p.short === who)?.id;

  const stats = useMemo(() => {
    const own = items.filter((i) => !i.parent_id && (i.owner === who || i.owner === "both"));
    const weekAgo = new Date(today.getTime() - 6 * 864e5).toISOString();
    return {
      open: own.filter((i) => !i.done).length,
      urgent: own.filter((i) => !i.done && i.prio === "urgent").length,
      done: own.filter((i) => i.done && (i.done_at ?? "") >= weekAgo).length,
    };
  }, [items, who, today]);

  const activity = useMemo(() => {
    const out: Event[] = [];
    for (const i of items) {
      if (i.done && i.done_at && i.owner === who) out.push({ at: i.done_at, icon: CheckCircle2, text: `A terminé « ${i.title} »` });
      if (uid && i.created_by === uid && !i.parent_id) out.push({ at: i.created_at, icon: PlusCircle, text: `A ajouté « ${i.title} »` });
    }
    if (uid) {
      for (const p of pages) if (p.updated_by === uid && !p.archived_at) out.push({ at: p.updated_at, icon: FileText, text: `A modifié la page « ${pageTitle(p)} »` });
      for (const c of comments) if (c.created_by === uid) out.push({ at: c.created_at, icon: MessageSquare, text: `A commenté : ${c.body.slice(0, 90)}` });
      for (const d of decisions) if (d.created_by === uid) out.push({ at: d.created_at, icon: Gavel, text: `A noté la décision « ${d.title} »` });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
  }, [items, pages, comments, decisions, uid, who]);

  const inbox = useMemo(() => messages.filter((m) => m.to_who === who).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40), [messages, who]);

  // Ouvrir son propre profil marque ses messages comme lus.
  useEffect(() => {
    if (!mine) return;
    const now = new Date().toISOString();
    messages.filter((m) => m.to_who === me.short && !m.read_at).forEach((m) => void messagesStore.update(m.id, { read_at: now }));
  }, [mine, messages, me.short]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    if (containsSecret(text)) {
      toast.error(SECRET_MESSAGE);
      return;
    }
    const url = text.match(URL_RE)?.[0] ?? null;
    const body = url ? text.replace(url, "").trim() || null : text;
    void messagesStore.insert({ id: newId(), to_who: who, from_who: me.short, body, url, read_at: null, created_by: me.id, created_at: new Date().toISOString() });
    setDraft("");
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Profils">
        <div role="group" aria-label="Profil" className="flex rounded-[10px] border border-line bg-glass p-[3px]">
          {(["max", "adrien"] as Who[]).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={who === w}
              onClick={() => setWho(w)}
              className={cn("h-[26px] rounded-[7px] px-3 text-[12.5px] font-medium transition-colors duration-100", who === w ? "bg-accent text-foreground shadow-[0_0_0_1px_var(--line-strong)]" : "text-muted-foreground hover:text-foreground")}
            >
              {MEMBERS[w].nick}
            </button>
          ))}
        </div>
      </ViewHeader>

      <div className="grid items-start gap-3 px-4 pb-16 md:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <div className="flex flex-col gap-3">
          <section className="glass flex flex-wrap items-center gap-4 rounded-2xl p-4 sm:p-5">
            {mine ? (
              <label title="Changer ma photo" className="group relative cursor-pointer rounded-2xl outline-none focus-within:ring-2 focus-within:ring-ring">
                <PersonAvatar who={who} size="lg" />
                <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/45 text-white opacity-0 transition-opacity duration-100 group-hover:opacity-100"><Camera className="size-5" aria-hidden /></span>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Changer ma photo"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void savePhoto(file, me.id);
                  }}
                />
              </label>
            ) : (
              <PersonAvatar who={who} size="lg" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] leading-tight font-semibold">{person.name}</h2>
              <p className="text-[13px] text-muted-foreground">{person.role}</p>
            </div>
            <dl className="flex gap-5">
              {([["Ouvertes", stats.open], ["Urgentes", stats.urgent], ["Faites · 7 j", stats.done]] as const).map(([label, value]) => (
                <div key={label}>
                  <dd className={cn("num text-[22px] leading-none font-medium", label === "Urgentes" && value > 0 && "text-bad")}>{value}</dd>
                  <dt className="mt-1 text-[11.5px] text-muted-foreground">{label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5">
            <h2 className="font-sans text-[14.5px] font-semibold tracking-normal">Activité</h2>
            {activity.length ? (
              <ul className="mt-2 flex flex-col">
                {activity.map((e, i) => (
                  <li key={i} className="flex items-start gap-2.5 py-1.5 text-[13.5px]">
                    <e.icon className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{e.text}</span>
                    <span className="num shrink-0 text-[11.5px] text-faint">{ago(e.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13.5px] text-muted-foreground">Rien pour l&apos;instant.</p>
            )}
          </section>
        </div>

        <section className="glass rounded-2xl p-4 sm:p-5">
          <h2 className="font-sans text-[14.5px] font-semibold tracking-normal">{mine ? "Reçus" : `Retours et liens pour ${person.nick}`}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="mt-3 flex items-end gap-2 rounded-2xl border border-line p-1.5 pl-3 focus-within:border-line-strong"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={mine ? "Une note pour toi, ou un lien…" : `Un retour pour ${person.nick}, ou un lien…`}
              aria-label="Message"
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] outline-none [field-sizing:content] placeholder:text-faint"
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Envoyer" className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity duration-100 disabled:opacity-30">
              <Send className="size-3.5" aria-hidden />
            </button>
          </form>
          {inbox.length ? (
            <ul className="mt-2 divide-y divide-line">
              {inbox.map((m) => (
                <li key={m.id} className="flex items-start gap-2.5 py-3">
                  <PersonAvatar who={m.from_who} size="xs" />
                  <div className="min-w-0 flex-1">
                    {m.body && <p className="text-[13.5px] whitespace-pre-wrap">{m.body}</p>}
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[13px] text-info hover:underline">
                        <span className="truncate">{m.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                      </a>
                    )}
                    <p className="num mt-1 text-[11.5px] text-faint">
                      {MEMBERS[m.from_who].nick} · {ago(m.created_at)}
                      {!mine && m.from_who === me.short && (m.read_at ? " · lu" : " · pas encore lu")}
                    </p>
                  </div>
                  {m.from_who === me.short && (
                    <button type="button" onClick={() => void messagesStore.remove(m.id)} aria-label="Supprimer ce message" title="Supprimer" className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors duration-100 hover:bg-accent hover:text-foreground">
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13.5px] text-muted-foreground">Aucun message.</p>
          )}
        </section>
      </div>
    </div>
  );
}
