/**
 * Transforme le texte écrit par l'assistant (Markdown simple) en blocs de page.
 * Titres, listes, cases à cocher, tableaux, et un bloc « graphique » :
 *
 *   ```graphique
 *   {"titre": "Revenus par app", "type": "barres", "donnees": [{"label": "Sophia", "valeur": 50268}]}
 *   ```
 */
export type PageBlock = { type: string; props?: Record<string, unknown>; content?: unknown; children?: PageBlock[] };
type Inline = { type: "text"; text: string; styles: Record<string, true> } | { type: "link"; href: string; content: { type: "text"; text: string; styles: Record<string, true> }[] };

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*\s][^*]*\*)/g;

export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const part of text.split(TOKEN)) {
    if (!part) continue;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link) out.push({ type: "link", href: link[2], content: [{ type: "text", text: link[1], styles: {} }] });
    else if (/^\*\*[^*]+\*\*$/.test(part)) out.push({ type: "text", text: part.slice(2, -2), styles: { bold: true } });
    else if (/^`[^`]+`$/.test(part)) out.push({ type: "text", text: part.slice(1, -1), styles: { code: true } });
    else if (/^\*[^*]+\*$/.test(part)) out.push({ type: "text", text: part.slice(1, -1), styles: { italic: true } });
    else out.push({ type: "text", text: part, styles: {} });
  }
  return out;
}

function chart(source: string): PageBlock | null {
  try {
    const raw = JSON.parse(source) as { titre?: unknown; type?: unknown; donnees?: unknown };
    const data = (Array.isArray(raw.donnees) ? raw.donnees : [])
      .map((d) => ({ label: String((d as { label?: unknown }).label ?? ""), value: Number((d as { valeur?: unknown }).valeur) }))
      .filter((d) => d.label && Number.isFinite(d.value))
      .slice(0, 40);
    if (!data.length) return null;
    return { type: "chart", props: { title: String(raw.titre ?? ""), kind: raw.type === "courbe" ? "line" : "bar", data: JSON.stringify(data) } };
  } catch {
    return null;
  }
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function markdownToBlocks(markdown: string): PageBlock[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: PageBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", content: inline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*(\S*)/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      const made = /^graph/i.test(fence[1]) ? chart(body.join("\n")) : null;
      blocks.push(made ?? { type: "codeBlock", content: [{ type: "text", text: body.join("\n"), styles: {} }] });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i]));
      }
      i--;
      const width = Math.max(...rows.map((r) => r.length));
      blocks.push({ type: "table", content: { type: "tableContent", rows: rows.map((r) => ({ cells: Array.from({ length: width }, (_, c) => inline(r[c] ?? "")) })) } });
      continue;
    }
    // Une puce en retrait se range sous l'élément de liste qui la précède.
    const nested = /^(\s{2,}|\t+)([-*+]|\d+[.)])\s+\S/.test(line) && !paragraph.length ? blocks.at(-1) : undefined;
    if (nested && /ListItem$/.test(nested.type)) {
      nested.children = [...(nested.children ?? []), ...markdownToBlocks(line.trim())];
      continue;
    }
    let m: RegExpExecArray | null;
    if (!line.trim()) flush();
    else if ((m = /^\s*(#{1,6})\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ type: "heading", props: { level: Math.min(3, m[1].length) }, content: inline(m[2].replace(/\s*#+\s*$/, "")) });
    } else if ((m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ type: "checkListItem", props: { checked: m[1] !== " " }, content: inline(m[2]) });
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ type: "bulletListItem", content: inline(m[1]) });
    } else if ((m = /^\s*(\d+)[.)]\s+(.*)$/.exec(line))) {
      flush();
      // Une liste numérotée coupée par autre chose reprend à son numéro, pas à 1.
      const resumed = Number(m[1]) > 1 && blocks.at(-1)?.type !== "numberedListItem";
      blocks.push({ type: "numberedListItem", ...(resumed ? { props: { start: Number(m[1]) } } : {}), content: inline(m[2]) });
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) flush();
    else paragraph.push(line.replace(/^\s*>\s?/, "").trim());
  }
  flush();
  return blocks;
}
