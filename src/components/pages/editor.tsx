"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { fr } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  FormattingToolbar, FormattingToolbarController, SuggestionMenuController, createReactBlockSpec,
  getDefaultReactSlashMenuItems, getFormattingToolbarItems, useBlockNoteEditor, useComponentsContext, useCreateBlockNote,
} from "@blocknote/react";
import { ArrowUp, FilePlus2, MessageSquarePlus, Sparkles, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useMe } from "@/components/session-provider";
import { pagesStore } from "@/lib/data";
import { markdownToBlocks } from "@/lib/markdown-blocks";
import { createPage, pageHref, pageTitle } from "@/lib/pages";
import { AttachButton, AttachmentChips } from "@/components/assistant/attachments";
import { readAttachments, type Attachment } from "@/lib/attachments";
import { PageIcon } from "@/components/pages/page-icon";
import { useRows } from "@/lib/store";
import type { PageRow } from "@/lib/types";

/** Bloc « lien vers une sous-page », créé par /page. Le titre suit la page en direct. */
function PageLinkRow({ id }: { id: string }) {
  const pages = useRows(pagesStore);
  const page = pages.find((p) => p.id === id);
  const gone = !page || page.archived_at;
  return (
    <a
      href={pageHref(id)}
      data-qg-page={id}
      contentEditable={false}
      className="qg-page-link"
      aria-disabled={gone ? true : undefined}
    >
      <PageIcon icon={page?.icon} className="size-4 shrink-0" />
      <span>{gone ? "Page supprimée" : pageTitle(page)}</span>
    </a>
  );
}

const PageLink = createReactBlockSpec(
  { type: "pageLink", propSchema: { pageId: { default: "" } }, content: "none" },
  { render: ({ block }) => <PageLinkRow id={block.props.pageId} /> },
);

/** Bloc « graphique », écrit par l'assistant : des barres ou une courbe à partir de quelques chiffres. */
function ChartView({ title, kind, data }: { title: string; kind: string; data: string }) {
  let rows: { label: string; value: number }[] = [];
  try {
    rows = JSON.parse(data) as typeof rows;
  } catch {}
  const axis = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, tickLine: false, axisLine: false } as const;
  const tip = <Tooltip cursor={{ fill: "var(--accent)" }} formatter={(v) => [Number(v).toLocaleString("fr-FR"), ""]} separator="" contentStyle={{ background: "var(--popover)", border: "1px solid var(--line-strong)", borderRadius: 10, fontSize: 12 }} />;
  return (
    <figure contentEditable={false} className="glass my-1 w-full rounded-2xl p-4">
      {title && <figcaption className="mb-2 text-[13.5px] font-semibold">{title}</figcaption>}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "line" ? (
            <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" {...axis} />
              <YAxis width={52} {...axis} tickFormatter={(v) => Number(v).toLocaleString("fr-FR")} />
              {tip}
              <Line dataKey="value" stroke="var(--viz-1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" {...axis} />
              <YAxis width={52} {...axis} tickFormatter={(v) => Number(v).toLocaleString("fr-FR")} />
              {tip}
              <Bar dataKey="value" fill="var(--viz-1)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const Chart = createReactBlockSpec(
  { type: "chart", propSchema: { title: { default: "" }, kind: { default: "bar" }, data: { default: "[]" } }, content: "none" },
  { render: ({ block }) => <ChartView title={block.props.title} kind={block.props.kind} data={block.props.data} /> },
);

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, pageLink: PageLink(), chart: Chart() } });

function AiButton({ onAsk }: { onAsk: () => void }) {
  const Components = useComponentsContext()!;
  return <Components.FormattingToolbar.Button mainTooltip="Réécrire avec l'IA" label="IA" icon={<Sparkles size={16} />} onClick={onAsk} />;
}

type AiRequest = { blockIds: string[]; source: string; rewrite: boolean };
const PRESETS = ["Améliore", "Raccourcis", "Corrige les fautes", "Traduis en anglais"];

function CommentButton({ onComment }: { onComment: (blockId: string, quote: string) => void }) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  return (
    <Components.FormattingToolbar.Button
      mainTooltip="Commenter ce passage"
      label="Commenter"
      icon={<MessageSquarePlus size={16} />}
      onClick={() => {
        const block = editor.getTextCursorPosition().block;
        onComment(block.id, editor.getSelectedText().trim().slice(0, 240));
      }}
    />
  );
}

type Props = {
  page: PageRow;
  dark: boolean;
  onNavigate: (pageId: string) => void;
  onComment: (blockId: string, quote: string) => void;
};

export default function PageEditor({ page, dark, onNavigate, onComment }: Props) {
  const me = useMe();
  const dirty = useRef(false);
  const applyingRemote = useRef(false);
  const timer = useRef<number | null>(null);
  const lastSaved = useRef(JSON.stringify(page.content));
  const [ai, setAi] = useState<AiRequest | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const [pictures, setPictures] = useState<Attachment[]>([]);

  const editor = useCreateBlockNote({
    schema,
    dictionary: fr,
    // Le contenu d'origine ; les mises à jour distantes sont appliquées plus bas.
    initialContent: page.content.length ? (page.content as never) : undefined,
  });

  const save = useMemo(
    () => () => {
      if (!dirty.current) return;
      dirty.current = false;
      lastSaved.current = JSON.stringify(editor.document);
      void pagesStore.update(page.id, { content: editor.document as unknown[], updated_by: me.id, updated_at: new Date().toISOString() });
    },
    [editor, page.id, me.id],
  );

  // Enregistre ce qui reste quand on quitte la page.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      save();
    },
    [save],
  );

  // La page a changé ailleurs (l'autre personne, ou l'assistant) : on reprend son contenu si on n'est pas en train d'écrire.
  useEffect(() => {
    if (dirty.current) return;
    const incoming = JSON.stringify(page.content);
    if (incoming === lastSaved.current || incoming === JSON.stringify(editor.document)) return;
    lastSaved.current = incoming;
    applyingRemote.current = true;
    editor.replaceBlocks(editor.document, (page.content.length ? page.content : [{ type: "paragraph" }]) as never);
    applyingRemote.current = false;
  }, [page.content, editor]);

  /** Ouvre la barre de l'IA : pour écrire à l'endroit du curseur, ou pour réécrire la sélection. */
  async function askAi(rewrite: boolean) {
    const blocks = rewrite ? (editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]) : [editor.getTextCursorPosition().block];
    const source = rewrite ? (await editor.blocksToMarkdownLossy(blocks as never)).trim() : "";
    setInstruction("");
    setPictures([]);
    setAi({ blockIds: blocks.map((b) => b.id), source, rewrite: rewrite && source !== "" });
  }

  async function attach(files: Iterable<File>) {
    setPictures(await readAttachments(files, pictures, (message) => toast.error(message)));
  }

  async function runAi(text: string) {
    const request = ai;
    if (!request || (!text.trim() && !pictures.length) || busy) return;
    const anchor = editor.getBlock(request.blockIds.at(-1)!);
    if (!anchor) return void toast.error("Le passage a changé entre-temps. Réessaie.");
    // On remplace la sélection, ou la ligne vide où l'on se trouve ; sinon on écrit juste après.
    const emptyLine = !request.rewrite && anchor.type === "paragraph" && Array.isArray(anchor.content) && anchor.content.length === 0;
    const replacing = request.rewrite || emptyLine;
    const originals = request.blockIds.map((id) => editor.getBlock(id)).filter(Boolean);
    let written: string[] = [];
    // Pendant que l'assistant écrit, la page n'est pas enregistrée à chaque mot : une seule fois à la fin.
    const show = (markdown: string) => {
      const blocks = markdownToBlocks(markdown.replace(/^\s*```(?:markdown|md)?\n/, "").replace(/\n```\s*$/, ""));
      if (!blocks.length) return;
      applyingRemote.current = true;
      const inserted = written.length
        ? editor.replaceBlocks(written, blocks as never).insertedBlocks
        : replacing
          ? editor.replaceBlocks(request.blockIds, blocks as never).insertedBlocks
          : editor.insertBlocks(blocks as never, anchor.id, "after");
      applyingRemote.current = false;
      written = inserted.map((b) => b.id);
    };

    setBusy(true);
    abort.current = new AbortController();
    let text_ = "";
    try {
      const res = await fetch("/api/assistant/texte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text.trim() || "Appuie-toi sur ce fichier pour écrire ce qui serait utile ici.", files: pictures, selection: request.rewrite ? request.source : undefined, page_id: page.id }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "L'assistant est indisponible.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let shown = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text_ += decoder.decode(value, { stream: true });
        if (Date.now() - shown > 250) {
          show(text_);
          shown = Date.now();
        }
      }
      if (!text_.trim()) throw new Error("L'assistant n'a rien écrit. Reformule la consigne.");
      show(text_);
      setAi(null);
    } catch (e) {
      const stopped = e instanceof DOMException && e.name === "AbortError";
      if (stopped && text_.trim()) {
        // Arrêt demandé : on garde ce qui est déjà écrit.
        show(text_);
        setAi(null);
      } else {
        // Échec : la page revient comme avant.
        if (written.length) {
          applyingRemote.current = true;
          if (replacing) editor.replaceBlocks(written, originals as never);
          else editor.removeBlocks(written);
          applyingRemote.current = false;
          written = [];
        }
        if (!stopped) toast.error(e instanceof Error ? e.message : "L'assistant est indisponible.");
      }
    }
    if (written.length) {
      dirty.current = true;
      save();
    }
    setBusy(false);
  }

  return (
    <div
      className="qg-editor"
      onClick={(e) => {
        const link = (e.target as HTMLElement).closest<HTMLElement>("[data-qg-page]");
        if (link) {
          e.preventDefault();
          if (!link.getAttribute("aria-disabled")) onNavigate(link.dataset.qgPage!);
        }
      }}
    >
      <BlockNoteView
        editor={editor}
        theme={dark ? "dark" : "light"}
        slashMenu={false}
        formattingToolbar={false}
        onChange={() => {
          if (applyingRemote.current) return;
          dirty.current = true;
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(save, 700);
        }}
      >
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              {getFormattingToolbarItems()}
              <AiButton key="qg-ai" onAsk={() => void askAi(true)} />
              <CommentButton key="qg-comment" onComment={onComment} />
            </FormattingToolbar>
          )}
        />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                {
                  title: "IA",
                  subtext: "Faire écrire l'assistant ici",
                  aliases: ["ia", "ai", "assistant", "ecrire", "écrire", "plan", "rediger", "rédiger"],
                  group: "Assistant",
                  icon: <Sparkles size={18} />,
                  onItemClick: () => void askAi(false),
                },
                {
                  title: "Page",
                  subtext: "Créer une sous-page ici",
                  aliases: ["page", "sous-page", "souspage", "document", "doc"],
                  group: "Pages",
                  icon: <FilePlus2 size={18} />,
                  onItemClick: () => {
                    const child = createPage({ parent_id: page.id, created_by: me.id });
                    insertOrUpdateBlockForSlashMenu(editor, { type: "pageLink", props: { pageId: child.id } });
                    onNavigate(child.id);
                  },
                },
                ...getDefaultReactSlashMenuItems(editor),
              ],
              query,
            )
          }
        />
      </BlockNoteView>

      {ai && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAi(instruction);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void attach(e.dataTransfer.files);
          }}
          className="glass-strong fixed bottom-6 left-1/2 z-30 w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl p-2 md:left-[calc(50%+120px)]"
        >
          <AttachmentChips files={pictures} onRemove={(i) => setPictures((all) => all.filter((_, j) => j !== i))} className="flex flex-wrap gap-1.5 px-1.5 pt-1 pb-2" />
          {ai.rewrite && !busy && (
            <div className="flex flex-wrap gap-1.5 px-1.5 pt-1 pb-2">
              {PRESETS.map((p) => (
                <button key={p} type="button" disabled={busy} onClick={() => void runAi(p)} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] transition-colors duration-100 hover:border-line-strong disabled:opacity-40">
                  {p}
                </button>
              ))}
            </div>
          )}
          {busy ? (
            <div className="flex h-9 items-center gap-2 pl-2.5">
              <Sparkles className="size-4 shrink-0 animate-pulse text-now" aria-hidden />
              <span role="status" className="flex-1 text-[14px] text-muted-foreground">L&apos;assistant écrit dans la page…</span>
              <button type="button" onClick={() => abort.current?.abort()} className="h-8 rounded-full border border-line px-3 text-[12.5px] font-medium hover:border-line-strong">
                Arrêter
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2.5">
              <Sparkles className="size-4 shrink-0 text-now" aria-hidden />
              <input
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setAi(null);
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    void attach(e.clipboardData.files);
                  }
                }}
                placeholder={ai.rewrite ? "Que faire de ce passage ?" : "Que doit écrire l'assistant ? ex. un plan pour le pitch Station F"}
                aria-label="Consigne pour l'assistant"
                className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
              />
              <AttachButton label="Joindre un fichier à la consigne" onFiles={(files) => void attach(files)} />
              <button type="button" onClick={() => setAi(null)} aria-label="Fermer" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-4" aria-hidden />
              </button>
              <button type="submit" disabled={!instruction.trim() && !pictures.length} aria-label="Envoyer" className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity duration-100 disabled:opacity-30">
                <ArrowUp className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
