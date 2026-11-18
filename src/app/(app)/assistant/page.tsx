"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, RotateCcw } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; text: string; actions?: string[]; error?: boolean };

const KEY = "qg-assistant";
const IDEAS = ["Nos stats de la semaine ?", "Dans quels pays recruter ?", "Où part l'argent ce mois-ci ?", "Ajoute une tâche urgente pour Adrien : …"];

function restore(): Turn[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Turn[];
  } catch {
    return [];
  }
}
function keep(turns: Turn[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-40)));
  } catch {}
}

// L'assistant : on pose une question sur les données du QG, ou on lui dicte une tâche.
export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>(restore);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const history: Turn[] = [...turns.filter((t) => !t.error), { role: "user", text }];
    const answer: Turn = { role: "assistant", text: "", actions: [] };
    setTurns([...history, answer]);
    setInput("");
    setBusy(true);
    const show = () => setTurns([...history, { ...answer, actions: [...(answer.actions ?? [])] }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map((t) => ({ role: t.role, text: t.text })) }),
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
          const event = JSON.parse(line) as { t: "text" | "action" | "error"; v: string };
          if (event.t === "text") answer.text += event.v;
          if (event.t === "action") answer.actions!.push(event.v);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader title="Assistant">
        {turns.length > 0 && (
          <button type="button" onClick={reset} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground">
            <RotateCcw className="size-3.5" aria-hidden /> Nouvelle discussion
          </button>
        )}
      </ViewHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-4 pb-6">
          {turns.length === 0 && (
            <div className="pt-[12vh]">
              <p className="text-[22px] leading-tight font-semibold tracking-[-0.03em]">Pose une question, ou dicte une tâche.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => (idea.endsWith("…") ? (setInput(idea.slice(0, -1)), field.current?.focus()) : void ask(idea))}
                    className="glass rounded-full px-3.5 py-2 text-[13.5px] transition-colors duration-100 hover:border-line-strong"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <p key={i} className="max-w-[85%] self-end rounded-2xl bg-foreground px-3.5 py-2 text-[14.5px] whitespace-pre-wrap text-background">{t.text}</p>
            ) : (
              <div key={i} className="flex flex-col gap-2">
                {t.actions?.map((a, j) => (
                  <p key={j} className="inline-flex w-fit items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-[12.5px] font-medium text-good">
                    <Check className="size-3.5" aria-hidden /> {a}
                  </p>
                ))}
                <p aria-live="polite" className={cn("text-[14.5px] leading-[1.6] whitespace-pre-wrap", t.error && "text-bad")}>
                  {t.text || (busy && i === turns.length - 1 ? <span className="animate-pulse text-faint">Je regarde…</span> : null)}
                </p>
              </div>
            ),
          )}
          <div ref={end} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6"
      >
        <div className="glass-strong mx-auto flex max-w-[720px] items-end gap-2 rounded-3xl p-2 pl-4">
          <textarea
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={1}
            autoFocus
            placeholder="Demande n'importe quoi sur Vik Studios…"
            aria-label="Message à l'assistant"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14.5px] outline-none [field-sizing:content] placeholder:text-faint"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Envoyer" className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity duration-100 disabled:opacity-30">
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
