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
    setAi({ blockIds: blocks.map((b) => b.id), source, rewrite: rewrite && source !== "" });
  }

  async function runAi(text: string) {
    const request = ai;
    if (!request || !text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/texte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, selection: request.rewrite ? request.source : undefined, page_id: page.id }),
      });
      const json = (await res.json().catch(() => null)) as { markdown?: string; error?: string } | null;
      if (!res.ok || !json?.markdown) throw new Error(json?.error ?? "L'assistant est indisponible.");
      const blocks = markdownToBlocks(json.markdown);
      const anchor = editor.getBlock(request.blockIds.at(-1)!);
      if (!blocks.length || !anchor) throw new Error("Le passage a changé entre-temps. Réessaie.");
      // On remplace la sélection, ou la ligne vide où l'on se trouve ; sinon on écrit juste après.
      const emptyLine = !request.rewrite && anchor.type === "paragraph" && Array.isArray(anchor.content) && anchor.content.length === 0;
      if (request.rewrite || emptyLine) editor.replaceBlocks(request.blockIds, blocks as never);
      else editor.insertBlocks(blocks as never, anchor.id, "after");
      setAi(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'assistant est indisponible.");
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
          className="glass-strong fixed bottom-6 left-1/2 z-30 w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl p-2 md:left-[calc(50%+120px)]"
        >
          {ai.rewrite && (
            <div className="flex flex-wrap gap-1.5 px-1.5 pt-1 pb-2">
              {PRESETS.map((p) => (
                <button key={p} type="button" disabled={busy} onClick={() => void runAi(p)} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] transition-colors duration-100 hover:border-line-strong disabled:opacity-40">
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pl-2.5">
            <Sparkles className={busy ? "size-4 shrink-0 animate-pulse text-now" : "size-4 shrink-0 text-now"} aria-hidden />
            <input
              autoFocus
              value={instruction}
              disabled={busy}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") setAi(null);
              }}
              placeholder={busy ? "L'assistant écrit…" : ai.rewrite ? "Que faire de ce passage ?" : "Que doit écrire l'assistant ? ex. un plan pour le pitch Station F"}
              aria-label="Consigne pour l'assistant"
              className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
            />
            <button type="button" onClick={() => setAi(null)} aria-label="Fermer" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="size-4" aria-hidden />
            </button>
            <button type="submit" disabled={busy || !instruction.trim()} aria-label="Envoyer" className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity duration-100 disabled:opacity-30">
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
