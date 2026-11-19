import { NextResponse } from "next/server";
import { buildContext } from "@/lib/assistant/context";
import { callGemini, cleanImages, geminiError, type Part } from "@/lib/assistant/gemini";
import { assistantSession, openPage, whoWeAre, WRITING_FORMAT } from "@/lib/assistant/session";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";

export const maxDuration = 120;

/** L'IA dans une page : écrire un passage à partir d'une consigne, ou réécrire un passage sélectionné. */
export async function POST(request: Request) {
  const session = await assistantSession();
  if ("error" in session) return session.error;
  const { db, me, apiKey } = session;

  const body = (await request.json().catch(() => null)) as { instruction?: unknown; selection?: unknown; page_id?: unknown; images?: unknown } | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 4000) : "";
  const selection = typeof body?.selection === "string" ? body.selection.slice(0, 30000) : "";
  if (!instruction) return NextResponse.json({ error: "Consigne vide." }, { status: 400 });
  if (containsSecret(instruction)) return NextResponse.json({ error: `${SECRET_MESSAGE}.` }, { status: 400 });

  const page = await openPage(db, body?.page_id);
  const system = `${whoWeAre(me)}

Tu écris directement dans une page du QG. Ta réponse est insérée telle quelle dans la page : donne uniquement le contenu, sans phrase d'introduction ni commentaire, sans entourer le tout de guillemets ou d'un bloc de code.

${selection ? "On te donne un passage de la page et une consigne. Renvoie le passage réécrit selon la consigne, et rien d'autre. Garde sa langue, son sens et sa mise en forme, sauf si la consigne demande autre chose." : "On te donne une consigne. Écris le passage demandé, prêt à être lu : concret, sans remplissage."}

Si une image est jointe (une capture de consignes, un mail, un document), lis-la attentivement et appuie-toi sur ce qu'elle contient : reprends ses contraintes importantes (dates limites, formats, critères).

Pour les chiffres, dates et faits sur la société, appuie-toi uniquement sur les données du QG ci-dessous ; s'il manque une information, laisse un emplacement clair « [à compléter : …] » plutôt que d'inventer.

${WRITING_FORMAT}

Français, sauf si le passage est dans une autre langue. Style direct.

${page ? `Page : « ${page.title} ». Son contenu actuel :\n${page.text || "(vide)"}` : ""}

Données du QG (JSON) :
${await buildContext(db, me)}`;

  const res = await callGemini(apiKey, "generateContent", {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [...cleanImages(body?.images).map((inlineData) => ({ inlineData })), { text: selection ? `Consigne : ${instruction}\n\nPassage :\n${selection}` : instruction }] }],
  });
  const json = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: Part[] } }[]; error?: { message?: string } } | null;
  if (!res.ok) {
    console.error("assistant/texte: Gemini a répondu", res.status, (json?.error?.message ?? "").slice(0, 300));
    return NextResponse.json({ error: geminiError(res.status, json?.error?.message ?? "") }, { status: 502 });
  }
  const text = (json?.candidates?.[0]?.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
  if (!text) return NextResponse.json({ error: "L'assistant n'a rien écrit. Reformule la consigne." }, { status: 502 });
  return NextResponse.json({ markdown: text.replace(/^```(?:markdown|md)?\n([\s\S]*)\n```$/, "$1") });
}
