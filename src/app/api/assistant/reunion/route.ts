import { NextResponse } from "next/server";
import { blocksToText } from "@/lib/assistant/context";
import { callGemini, geminiError, type Part } from "@/lib/assistant/gemini";
import { assistantSession, whoWeAre, WRITING_FORMAT } from "@/lib/assistant/session";
import { markdownToBlocks } from "@/lib/markdown-blocks";

export const maxDuration = 300;

const AUDIO = /^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|aac|flac|x-m4a|m4a)$/;

async function ask(apiKey: string, system: string, parts: Part[]): Promise<{ text?: string; error?: string }> {
  const res = await callGemini(apiKey, "generateContent", { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }] });
  const json = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: Part[] } }[]; error?: { message?: string } } | null;
  if (!res.ok) {
    console.error("assistant/reunion: Gemini a répondu", res.status, (json?.error?.message ?? "").slice(0, 300));
    return { error: geminiError(res.status, json?.error?.message ?? "") };
  }
  return { text: (json?.candidates?.[0]?.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim() };
}

/**
 * Les réunions à la voix, en deux temps :
 *  - { audio } : un morceau d'enregistrement → sa transcription ;
 *  - { item_id, transcript } : toute la transcription → le compte rendu, écrit dans la page de la réunion.
 * L'audio n'est gardé nulle part : il est transcrit puis oublié.
 */
export async function POST(request: Request) {
  const session = await assistantSession();
  if ("error" in session) return session.error;
  const { db, me, userId, apiKey } = session;
  const body = (await request.json().catch(() => null)) as { audio?: { mime?: unknown; data?: unknown }; item_id?: unknown; transcript?: unknown } | null;

  // ---- 1. transcrire un morceau
  if (body?.audio) {
    const mime = String(body.audio.mime ?? "").split(";")[0].trim().toLowerCase();
    const data = String(body.audio.data ?? "");
    if (!AUDIO.test(mime) || !data || data.length > 4_300_000 || !/^[A-Za-z0-9+/=]+$/.test(data)) return NextResponse.json({ error: "Enregistrement illisible ou trop lourd." }, { status: 400 });
    const out = await ask(apiKey, "Tu transcris des enregistrements de réunion entre Maximilien (Max) et Adrien, les deux fondateurs de Vik Studios (apps Sophia, Micabo, Unswipe, Runvik ; comptes TikTok de slideshows ; posteurs, HM, labels, cohortes, kills, doublement).", [
      { inlineData: { mimeType: mime === "audio/x-m4a" || mime === "audio/m4a" ? "audio/mp4" : mime, data } },
      { text: "Transcris fidèlement ce passage, dans la langue parlée, sans rien résumer ni inventer. Va à la ligne quand la personne qui parle change, en commençant la ligne par « Max : » ou « Adrien : » si tu peux les distinguer, sinon par « — ». Si le passage ne contient pas de parole audible, réponds seulement : [silence]." },
    ]);
    if (out.error) return NextResponse.json({ error: out.error }, { status: 502 });
    return NextResponse.json({ text: out.text === "[silence]" ? "" : (out.text ?? "") });
  }

  // ---- 2. écrire le compte rendu
  const itemId = typeof body?.item_id === "string" ? body.item_id : "";
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim().slice(0, 400_000) : "";
  if (!itemId || transcript.length < 20) return NextResponse.json({ error: "Rien à résumer : l'enregistrement ne contient pas de parole." }, { status: 400 });
  const { data: item } = await db.from("items").select("id, title, notes, bucket, at_time").eq("id", itemId).maybeSingle();
  if (!item) return NextResponse.json({ error: "Réunion introuvable." }, { status: 404 });
  const [{ data: points }, { data: links }] = await Promise.all([
    db.from("items").select("title, done").eq("parent_id", itemId).order("sort_order"),
    db.from("item_links").select("page_id, task_id").eq("item_id", itemId),
  ]);
  const taskIds = (links ?? []).map((l) => l.task_id).filter(Boolean) as string[];
  const { data: tasks } = taskIds.length ? await db.from("items").select("title, owner, done").in("id", taskIds) : { data: [] };

  const out = await ask(
    apiKey,
    `${whoWeAre(me)}

Tu rédiges le compte rendu d'une réunion à partir de sa transcription. Ta réponse est écrite telle quelle dans la page de la réunion : donne uniquement le contenu, sans phrase d'introduction.

Structure, dans cet ordre :
## Résumé
Trois à cinq phrases : ce qui a été discuté et ce qui en sort.
## Décisions
Une puce par décision réellement prise. S'il n'y en a pas, écris « Aucune décision prise. »
## Actions
Une case à cocher par action, sous la forme « - [ ] Prénom : action (échéance si elle a été dite) ».
## Points en suspens
Les questions restées ouvertes, s'il y en a. Sinon, omets cette partie.

Ne rapporte que ce qui a été dit : aucun chiffre, aucune décision ni aucune échéance inventés. Si un passage est inaudible ou ambigu, dis-le au lieu de deviner. Style direct, français.

${WRITING_FORMAT}`,
    [{
      text: `Réunion : ${item.title}${item.at_time ? `, ${item.at_time}` : ""}
${item.notes ? `Objectif : ${item.notes}\n` : ""}${points?.length ? `Ordre du jour prévu :\n${points.map((p) => `- ${p.title}`).join("\n")}\n` : ""}${tasks?.length ? `Tâches à discuter :\n${tasks.map((t) => `- ${t.title} (${t.owner}${t.done ? ", faite" : ""})`).join("\n")}\n` : ""}
Transcription :
${transcript}`,
    }],
  );
  if (out.error || !out.text) return NextResponse.json({ error: out.error ?? "L'assistant n'a rien écrit." }, { status: 502 });

  // La page de la réunion : celle déjà reliée, sinon une nouvelle, rangée dans « Réunions ».
  const now = new Date().toISOString();
  const pageIds = (links ?? []).map((l) => l.page_id).filter(Boolean) as string[];
  const { data: existing } = pageIds.length ? await db.from("pages").select("id, content").in("id", pageIds).is("archived_at", null).order("created_at").limit(1) : { data: [] };
  const stamp = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date());
  const blocks = [
    ...markdownToBlocks(`# Compte rendu du ${stamp}\n\n${out.text}`),
    ...markdownToBlocks("## Transcription"),
    ...transcript.split(/\n+/).filter(Boolean).map((line) => ({ type: "paragraph", content: [{ type: "text", text: line, styles: {} }] })),
  ];
  let pageId = existing?.[0]?.id as string | undefined;
  if (pageId) {
    const before = ((existing![0].content ?? []) as unknown[]).filter((b, i, all) => !(i === all.length - 1 && (b as { type?: string }).type === "paragraph" && !blocksToText([b])));
    const { error } = await db.from("pages").update({ content: [...before, ...blocks], updated_by: userId, updated_at: now }).eq("id", pageId);
    if (error) return NextResponse.json({ error: "Impossible d'écrire dans la page de la réunion." }, { status: 500 });
  } else {
    const { data: folder } = await db.from("pages").select("id").eq("icon", "folder").is("archived_at", null).is("parent_id", null).ilike("title", "réunions").limit(1);
    let parent = folder?.[0]?.id as string | undefined;
    if (!parent) parent = (await db.from("pages").insert({ title: "Réunions", icon: "folder", content: [], sort_order: Date.now(), created_by: userId, updated_by: userId }).select("id").single()).data?.id;
    const made = await db.from("pages").insert({ title: item.title, icon: "notebook", parent_id: parent ?? null, content: blocks, sort_order: Date.now(), created_by: userId, updated_by: userId }).select("id").single();
    if (made.error) return NextResponse.json({ error: "Impossible de créer la page de la réunion." }, { status: 500 });
    pageId = made.data.id as string;
    await db.from("item_links").insert({ item_id: itemId, page_id: pageId, created_by: userId });
  }
  return NextResponse.json({ page_id: pageId, summary: out.text });
}
