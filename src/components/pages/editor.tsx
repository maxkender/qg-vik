"use client";

import { useEffect, useMemo, useRef } from "react";
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { fr } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  FormattingToolbar, FormattingToolbarController, SuggestionMenuController, createReactBlockSpec,
  getDefaultReactSlashMenuItems, getFormattingToolbarItems, useBlockNoteEditor, useComponentsContext, useCreateBlockNote,
} from "@blocknote/react";
import { FilePlus2, MessageSquarePlus } from "lucide-react";
import { useMe } from "@/components/session-provider";
import { pagesStore } from "@/lib/data";
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

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, pageLink: PageLink() } });

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

  // L'autre personne a modifié la page : on reprend son contenu si on n'est pas en train d'écrire.
  useEffect(() => {
    if (page.updated_by === me.id || dirty.current) return;
    if (JSON.stringify(editor.document) === JSON.stringify(page.content)) return;
    applyingRemote.current = true;
    editor.replaceBlocks(editor.document, (page.content.length ? page.content : [{ type: "paragraph" }]) as never);
    applyingRemote.current = false;
  }, [page.content, page.updated_by, me.id, editor]);

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
    </div>
  );
}
