"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, ImagePlus, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Action = { label: string; href?: string };
type Picture = { mime: string; data: string };
type Turn = { role: "user" | "assistant"; text: string; actions?: Action[]; error?: boolean; pictures?: number };

/** Réduit une image (capture d'écran, photo) à 1 600 px de large au plus avant de l'envoyer. */
async function shrink(file: File): Promise<Picture> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { mime: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] };
}

/** L'id de la page ouverte à l'écran, s'il y en a une. */
const currentPage = () => (window.location.pathname === "/pages" ? new URLSearchParams(window.location.search).get("id") : null);

const KEY = "qg-assistant";
const IDEAS = ["Nos stats de la semaine ?", "Dans quels pays recruter ?", "Écris un plan dans cette page : …", "Ajoute une tâche urgente pour Adrien : …"];

function restore(): Turn[] {
  try {
    const turns = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Turn[];
    return turns.map((t) => ({ ...t, actions: t.actions?.map((a) => (typeof a === "string" ? { label: a } : a)) }));
  } catch {
    return [];
  }
}
function keep(turns: Turn[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-40)));
  } catch {}
}

/** L'assistant, toujours là : un rond en bas à droite qui ouvre la discussion. */
export function AssistantBubble() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(restore);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [dropping, setDropping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, open]);

  async function attach(files: Iterable<File>) {
    const images = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 4 - pictures.length);
    if (!images.length) return;
    try {
      const made = await Promise.all(images.map(shrink));
      setPictures((p) => [...p, ...made].slice(0, 4));
    } catch {
      toast.error("Impossible de lire cette image");
    }
  }

  async function ask(question: string) {
    const text = question.trim();
    if ((!text && !pictures.length) || busy) return;
    const sent = pictures;
    setPictures([]);
    const history: Turn[] = [...turns.filter((t) => !t.error), { role: "user", text, pictures: sent.length || undefined }];
    const answer: Turn = { role: "assistant", text: "", actions: [] };
    setTurns([...history, answer]);
    setInput("");
    setBusy(true);
    const show = () => setTurns([...history, { ...answer, actions: [...(answer.actions ?? [])] }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: currentPage(), messages: history.map((t, i) => ({ role: t.role, text: t.text, images: i === history.length - 1 ? sent : undefined })) }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "L'assistant est indisponible.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as { t: "text" | "action" | "error"; v: string; href?: string };
          if (event.t === "text") answer.text += event.v;
          if (event.t === "action") answer.actions!.push({ label: event.v, href: event.href });
          if (event.t === "error") {
            answer.text = event.v;
            answer.error = true;
          }
        }
        show();
      }
      answer.text = answer.text.trim();
    } catch (e) {
      answer.text = e instanceof Error ? e.message : "L'assistant est indisponible.";
      answer.error = true;
    }
    const final = [...history, answer];
    setTurns(final);
    keep(final.filter((t) => !t.error));
    setBusy(false);
    field.current?.focus();
  }

  function reset() {
    setTurns([]);
    keep([]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
        aria-expanded={open}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 grid size-12 place-items-center rounded-full bg-foreground text-background shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)] transition-transform duration-100 hover:scale-105 md:right-6 md:bottom-6"
      >
        {open ? <X className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
      </button>

      {open && (
        <section
          aria-label="Assistant"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          onDragOver={(e) => {
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            void attach(e.dataTransfer.files);
          }}
          data-dropping={dropping || undefined}
          className="glass-strong fixed right-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.75rem)] z-40 flex h-[min(620px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl data-[dropping]:ring-2 data-[dropping]:ring-now md:right-6 md:bottom-[5.25rem]"
        >
          <header className="flex shrink-0 items-center justify-between px-4 pt-3.5 pb-2">
            <h2 className="text-[15px] font-semibold">Assistant</h2>
            {turns.length > 0 && (
              <button type="button" onClick={reset} title="Nouvelle discussion" aria-label="Nouvelle discussion" className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground">
                <RotateCcw className="size-3.5" aria-hidden />
              </button>
            )}
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-3">
            {turns.length === 0 && (
              <div className="flex flex-col items-start gap-2 pt-2">
                <p className="text-[13.5px] text-muted-foreground">Pose une question, ou dicte une tâche.</p>
                {IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => (idea.endsWith("…") ? (setInput(idea.slice(0, -1)), field.current?.focus()) : void ask(idea))}
                    className="rounded-full border border-line px-3 py-1.5 text-left text-[13px] transition-colors duration-100 hover:border-line-strong"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            )}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <p key={i} className="max-w-[85%] self-end rounded-2xl bg-foreground px-3.5 py-2 text-[14px] whitespace-pre-wrap text-background">
                {t.pictures ? <span className="mb-0.5 flex items-center gap-1 text-[12px] opacity-70"><ImagePlus className="size-3.5" aria-hidden /> {t.pictures} image{t.pictures > 1 ? "s" : ""}</span> : null}
                {t.text}
              </p>
            ) : (
              <div key={i} className="flex flex-col gap-2">
                {t.actions?.map((a, j) => (
                  <p key={j} className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-[12.5px] font-medium text-good">
                    <Check className="size-3.5 shrink-0" aria-hidden />
                    {a.href ? <Link href={a.href} className="truncate underline underline-offset-2">{a.label}</Link> : <span className="truncate">{a.label}</span>}
                  </p>
                ))}
                <p aria-live="polite" className={cn("text-[14px] leading-[1.55] whitespace-pre-wrap", t.error && "text-bad")}>
                  {t.text || (busy && i === turns.length - 1 ? <span className="animate-pulse text-faint">Je regarde…</span> : null)}
                </p>
              </div>
            ),
          )}
          <div ref={end} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="m-2.5 mt-0 flex shrink-0 flex-wrap items-end gap-2 rounded-3xl border border-line p-1.5 focus-within:border-line-strong"
          >
            {pictures.length > 0 && (
              <div className="flex w-full gap-1.5 px-1 pt-1">
                {pictures.map((p, i) => (
                  <span key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- aperçu d'une image locale */}
                    <img src={`data:${p.mime};base64,${p.data}`} alt="" className="size-12 rounded-lg object-cover" />
                    <button type="button" onClick={() => setPictures((all) => all.filter((_, j) => j !== i))} aria-label="Retirer l'image" className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-foreground text-background">
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <label title="Joindre une image (ou glisse-la ici)" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground">
              <ImagePlus className="size-4" aria-hidden />
              <input
                type="file"
                accept="image/*"
                multiple
                aria-label="Joindre une image"
                className="sr-only"
                onChange={(e) => {
                  void attach(e.target.files ?? []);
                  e.target.value = "";
                }}
              />
            </label>
            <textarea
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              onPaste={(e) => {
                if ([...e.clipboardData.files].some((f) => f.type.startsWith("image/"))) {
                  e.preventDefault();
                  void attach(e.clipboardData.files);
                }
              }}
              rows={1}
              autoFocus
              placeholder="Demande, dicte, ou glisse une capture…"
              aria-label="Message à l'assistant"
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[14px] outline-none [field-sizing:content] placeholder:text-faint"
            />
            <button type="submit" disabled={busy || (!input.trim() && !pictures.length)} aria-label="Envoyer" className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity duration-100 disabled:opacity-30">
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
