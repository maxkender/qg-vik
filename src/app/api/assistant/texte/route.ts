import { NextResponse } from "next/server";
import { buildContext } from "@/lib/assistant/context";
import { attachmentParts, callGemini, geminiError, type Part } from "@/lib/assistant/gemini";
import { assistantSession, openPage, whoWeAre, WRITING_FORMAT } from "@/lib/assistant/session";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";

export const maxDuration = 120;

/** L'IA dans une page : écrire un passage à partir d'une consigne, ou réécrire un passage sélectionné. */
export async function POST(request: Request) {
  const session = await assistantSession();
  if ("error" in session) return session.error;
  const { db, me, apiKey } = session;

  const body = (await request.json().catch(() => null)) as { instruction?: unknown; selection?: unknown; page_id?: unknown; files?: unknown } | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 4000) : "";
  const selection = typeof body?.selection === "string" ? body.selection.slice(0, 30000) : "";
  if (!instruction) return NextResponse.json({ error: "Consigne vide." }, { status: 400 });
  if (containsSecret(instruction)) return NextResponse.json({ error: `${SECRET_MESSAGE}.` }, { status: 400 });

  const page = await openPage(db, body?.page_id);
  const system = `${whoWeAre(me)}

Tu écris directement dans une page du QG. Ta réponse est insérée telle quelle dans la page : donne uniquement le contenu, sans phrase d'introduction ni commentaire, sans entourer le tout de guillemets ou d'un bloc de code.

${selection ? "On te donne un passage de la page et une consigne. Renvoie le passage réécrit selon la consigne, et rien d'autre. Garde sa langue, son sens et sa mise en forme, sauf si la consigne demande autre chose." : "On te donne une consigne. Écris le passage demandé, prêt à être lu : concret, sans remplissage."}

Si un fichier est joint (une capture de consignes, un PDF, un document, un tableur, un enregistrement), lis-le attentivement et appuie-toi sur ce qu'il contient : reprends ses contraintes importantes (dates limites, formats, critères).

Pour les chiffres, dates et faits sur la société, appuie-toi uniquement sur les données du QG ci-dessous ; s'il manque une information, laisse un emplacement clair « [à compléter : …] » plutôt que d'inventer.

${WRITING_FORMAT}

Français, sauf si le passage est dans une autre langue. Style direct.

${page ? `Page : « ${page.title} ». Son contenu actuel :\n${page.text || "(vide)"}` : ""}

Données du QG (JSON) :
${await buildContext(db, me)}`;

  const res = await callGemini(apiKey, "streamGenerateContent", {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [...attachmentParts(body?.files), { text: selection ? `Consigne : ${instruction}\n\nPassage :\n${selection}` : instruction }] }],
  });
  if (!res.ok || !res.body) {
    const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
    console.error("assistant/texte: Gemini a répondu", res.status, detail.slice(0, 300));
    return NextResponse.json({ error: geminiError(res.status, detail) }, { status: 502 });
  }

  // Le texte part vers la page au fur et à mesure qu'il est écrit.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      // On lit jusqu'à avoir du texte à envoyer : un morceau sans texte ne doit pas figer le flux.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return controller.close();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let sent = false;
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const chunk = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: Part[] } }[] };
            for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
              if (part.text && !part.thought) {
                controller.enqueue(encoder.encode(part.text));
                sent = true;
              }
            }
          } catch {}
        }
        if (sent) return;
      }
    },
    cancel: () => void reader.cancel(),
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
