import { strFromU8, unzipSync } from "fflate";

/**
 * Un fichier joint à une demande pour l'assistant.
 * Image, PDF ou audio : envoyé tel quel (`data`, en base64). Tout le reste : son texte (`text`).
 */
export type Attachment = { name: string; mime: string; data?: string; text?: string };

const MAX_FILES = 6;
/** La requête entière ne peut pas dépasser environ 4 Mo. */
const MAX_BINARY = 3 * 1024 * 1024;
const MAX_TEXT = 200_000;

const base64 = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};

/** Réduit une image (capture d'écran, photo) à 1 600 px de large au plus. */
async function image(file: File): Promise<Attachment> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { name: file.name, mime: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] };
}

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const byNumber = (a: string, b: string) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0);

/** Le texte d'un document Word, PowerPoint ou Excel (ce sont des archives de fichiers XML). */
function office(bytes: Uint8Array, ext: string): string {
  const files = unzipSync(bytes, { filter: (f) => /^(word\/document\.xml|ppt\/slides\/slide\d+\.xml|xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(f.name) });
  const xml = (name: string) => strFromU8(files[name]);
  const names = Object.keys(files);
  if (ext === "docx") {
    return decode(xml("word/document.xml").replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<\/w:tc>/g, " | ").replace(/<[^>]+>/g, ""));
  }
  if (ext === "pptx") {
    return names.filter((n) => n.startsWith("ppt/slides/")).sort(byNumber)
      .map((n, i) => `Diapositive ${i + 1}\n${decode(xml(n).replace(/<\/a:p>/g, "\n").replace(/<[^>]+>/g, ""))}`).join("\n\n");
  }
  const shared = files["xl/sharedStrings.xml"] ? [...xml("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, ""))) : [];
  return names.filter((n) => n.startsWith("xl/worksheets/")).sort(byNumber)
    .map((n, i) => {
      const rows = [...xml(n).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
        [...row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
          const value = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? "")?.[1] ?? decode((c[2] ?? "").replace(/<[^>]+>/g, ""));
          return /t="s"/.test(c[1]) ? (shared[Number(value)] ?? "") : decode(value);
        }).join(" | "),
      );
      return `Feuille ${i + 1}\n${rows.join("\n")}`;
    }).join("\n\n");
}

/** Prépare un fichier pour l'assistant. Lève une erreur lisible s'il ne peut pas être lu. */
export async function readAttachment(file: File): Promise<Attachment> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") return image(file);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const binary = file.type === "application/pdf" || ext === "pdf" ? "application/pdf" : file.type.startsWith("audio/") ? file.type : null;
  if (binary) {
    if (bytes.length > MAX_BINARY) throw new Error(`« ${file.name} » est trop lourd (3 Mo au plus).`);
    return { name: file.name, mime: binary, data: base64(bytes) };
  }
  if (file.type.startsWith("video/")) throw new Error("Les vidéos ne sont pas prises en charge.");

  let text: string;
  if (["docx", "pptx", "xlsx"].includes(ext)) {
    try {
      text = office(bytes, ext);
    } catch {
      throw new Error(`Impossible de lire « ${file.name} ».`);
    }
  } else {
    // Tout le reste est lu comme du texte, si c'en est (pas un fichier binaire).
    if (bytes.subarray(0, 4000).includes(0)) throw new Error(`« ${file.name} » : ce type de fichier ne peut pas être lu. Exporte-le en PDF.`);
    text = new TextDecoder().decode(bytes);
  }
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error(`« ${file.name} » ne contient pas de texte lisible.`);
  return { name: file.name, mime: "text/plain", text: text.slice(0, MAX_TEXT) };
}

/** Lit un lot de fichiers (glissés, collés ou choisis). `onError` reçoit un message par fichier refusé. */
export async function readAttachments(files: Iterable<File>, current: Attachment[], onError: (message: string) => void): Promise<Attachment[]> {
  const out = [...current];
  for (const file of files) {
    if (out.length >= MAX_FILES) {
      onError(`${MAX_FILES} fichiers au plus par message.`);
      break;
    }
    try {
      const next = await readAttachment(file);
      const weight = [...out, next].reduce((n, a) => n + (a.data?.length ?? 0) + (a.text?.length ?? 0), 0);
      if (weight > 3_800_000) throw new Error(`« ${file.name} » : l'ensemble des fichiers est trop lourd (environ 3 Mo au plus).`);
      out.push(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : `Impossible de lire « ${file.name} ».`);
    }
  }
  return out;
}
