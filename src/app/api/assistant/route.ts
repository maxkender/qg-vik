import { NextResponse } from "next/server";
import { blocksToText, buildContext, isoWeekKey, todayParis } from "@/lib/assistant/context";
import { CATEGORY_KEYS } from "@/lib/categories";
import { MEMBERS, isWho, type Who } from "@/lib/members";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;

// Modèle Gemini. « gemini-flash-latest » suit la dernière version ; GEMINI_MODEL permet d'en choisir un autre.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const BUCKET = /^(inbox|life|d:\d{4}-\d{2}-\d{2}|w:\d{4}-W\d{2}|m:\d{4}-\d{2}|y:\d{4})$/;

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> }; [k: string]: unknown };
type Content = { role: "user" | "model"; parts: Part[] };

const TOOLS = [
  {
    name: "ajouter_tache",
    description: "Crée une tâche dans le QG. À utiliser dès que la personne demande d'ajouter, de noter ou d'assigner quelque chose à faire. Plusieurs tâches = plusieurs appels.",
    parameters: {
      type: "OBJECT",
      required: ["titre", "pour", "priorite", "echeance"],
      properties: {
        titre: { type: "STRING", description: "Titre court, à l'infinitif." },
        description: { type: "STRING", description: "Détails utiles, si besoin." },
        pour: { type: "STRING", enum: ["max", "adrien", "both"], description: "Personne assignée. Par défaut : la personne qui parle." },
        priorite: { type: "STRING", enum: ["urgent", "normal", "later"] },
        categorie: { type: "STRING", enum: CATEGORY_KEYS, description: "La catégorie qui correspond, si l'une convient." },
        heure: { type: "STRING", description: "Heure d'une réunion, au format HH:MM." },
        lien_meet: { type: "STRING", description: "Lien Google Meet (https) donné par la personne. Ne jamais en inventer." },
        repetition: { type: "STRING", enum: ["daily", "weekdays", "weekly", "biweekly", "monthly"], description: "Seulement si la tâche ou la réunion se répète." },
        echeance: { type: "STRING", description: "inbox (sans date), life, d:AAAA-MM-JJ (un jour), w:AAAA-Wnn (une semaine ISO), m:AAAA-MM (un mois) ou y:AAAA." },
      },
    },
  },
  {
    name: "envoyer_message",
    description: "Envoie un retour ou un lien à l'autre membre : il le verra sur son profil.",
    parameters: {
      type: "OBJECT",
      required: ["a"],
      properties: {
        a: { type: "STRING", enum: ["max", "adrien"] },
        texte: { type: "STRING" },
        lien: { type: "STRING", description: "Adresse https complète." },
      },
    },
  },
  {
    name: "lire_page",
    description: "Lit le contenu d'une page (document) du QG à partir de son id, donné dans la liste « pages ».",
    parameters: { type: "OBJECT", required: ["id"], properties: { id: { type: "STRING" } } },
  },
];

function systemPrompt(me: Who, data: string): string {
  const today = todayParis();
  const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(today);
  return `Tu es l'assistant du QG de Vik Studios, l'outil privé de Maximilien (Max) et Adrien, les deux fondateurs. Vik Studios fait la promotion de ses apps (Sophia, Micabo, Unswipe, bientôt Runvik) avec des comptes TikTok de slideshows tenus par des posteurs.

Tu parles à ${MEMBERS[me].name}. Nous sommes le ${jour}, semaine ${isoWeekKey(today).slice(7)}.

Tu réponds à partir des données du QG fournies plus bas, et uniquement d'elles pour tout ce qui est chiffre, date ou fait sur la société. Si l'information n'y est pas, dis-le en une phrase et indique où elle pourrait se trouver, sans inventer. Quand un chiffre vient d'un relevé ancien, donne sa date.

Pour les conseils (« que devrait-on faire », « où recruter »), appuie-toi sur les chiffres : cite ceux qui fondent ton avis, puis donne une recommandation nette. Pour les pays, le critère principal est l'euro par nouvel utilisateur, à pondérer par le volume ; un pays avec très peu d'utilisateurs n'est pas une preuve.

Les réunions sont les tâches de catégorie « reunion » (avec leur heure, leur lien Meet et leur répétition), plus la semaine type ; l'agenda Google n'est pas relié. Pour créer une réunion, utilise ajouter_tache avec la catégorie reunion, un jour précis et l'heure. Tu ne peux pas créer de lien Meet : si aucun n'est donné, dis qu'il reste à l'ajouter dans la tâche.

Le QG ne contient aucun mot de passe ni clé API, seulement l'endroit où ils sont rangés : donne cet endroit si on te le demande.

Style : français, tutoiement, direct et court. Commence par la réponse. Texte simple, sans titres, sans gras, sans tableaux ; des tirets pour une liste. Montants en euros arrondis, dates au format « mercredi 18 novembre ».

Quand tu crées une tâche ou envoies un message, fais-le sans demander de confirmation si la demande est claire, puis confirme en une ligne ce qui a été créé (titre, personne, échéance).

Données du QG (JSON) :
${data}`;
}

export async function POST(request: Request) {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("id, short").eq("id", auth.user.id).maybeSingle();
  if (!profile || !isWho(profile.short)) return NextResponse.json({ error: "Accès réservé aux membres du QG." }, { status: 403 });
  const me: Who = profile.short;
  const userId = auth.user.id;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "L'assistant n'est pas encore branché : il manque la variable GEMINI_API_KEY dans Vercel." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { messages?: { role: string; text: string }[] } | null;
  const history = (body?.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim()).slice(-30);
  if (!history.length || history.at(-1)!.role !== "user") return NextResponse.json({ error: "Question vide." }, { status: 400 });
  if (containsSecret(history.at(-1)!.text)) return NextResponse.json({ error: `${SECRET_MESSAGE}.` }, { status: 400 });

  const system = systemPrompt(me, await buildContext(db, me));
  const contents: Content[] = history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));

  async function runTool(name: string, input: Record<string, unknown>): Promise<{ result: string; label?: string; error?: boolean }> {
    if (containsSecret(input)) return { result: `Refusé : ${SECRET_MESSAGE}.`, error: true };
    if (name === "ajouter_tache") {
      const title = String(input.titre ?? "").trim();
      const bucket = String(input.echeance ?? "inbox");
      if (!title) return { result: "Titre manquant.", error: true };
      if (!BUCKET.test(bucket)) return { result: "Échéance invalide. Formats : inbox, d:AAAA-MM-JJ, w:AAAA-Wnn, m:AAAA-MM, y:AAAA.", error: true };
      const { error } = await db.from("items").insert({
        title, notes: input.description ? String(input.description) : null, bucket,
        owner: ["max", "adrien", "both"].includes(String(input.pour)) ? input.pour : me, prio: ["urgent", "normal", "later"].includes(String(input.priorite)) ? input.priorite : "normal", category: CATEGORY_KEYS.includes(input.categorie as never) ? input.categorie : null,
        at_time: /^\d{2}:\d{2}$/.test(String(input.heure ?? "")) ? input.heure : null,
        meet_url: /^https:\/\/\S+$/.test(String(input.lien_meet ?? "")) ? input.lien_meet : null,
        repeat_rule: ["daily", "weekdays", "weekly", "biweekly", "monthly"].includes(String(input.repetition)) ? input.repetition : null, sort_order: Date.now(), created_by: userId,
      });
      if (error) return { result: `Échec : ${error.message}`, error: true };
      return { result: "Tâche créée.", label: `Tâche ajoutée : ${title}` };
    }
    if (name === "envoyer_message") {
      const to = input.a;
      const text = input.texte ? String(input.texte).trim() : null;
      const url = input.lien ? String(input.lien).trim() : null;
      if (!isWho(to)) return { result: "Destinataire inconnu.", error: true };
      if (!text && !url) return { result: "Message vide.", error: true };
      if (url && !/^https?:\/\//i.test(url)) return { result: "Le lien doit commencer par https://", error: true };
      const { error } = await db.from("messages").insert({ to_who: to, from_who: me, body: text, url, created_by: userId });
      if (error) return { result: `Échec : ${error.message}`, error: true };
      return { result: "Message envoyé.", label: `Envoyé à ${MEMBERS[to].nick}` };
    }
    if (name === "lire_page") {
      const { data } = await db.from("pages").select("title, content").eq("id", String(input.id)).maybeSingle();
      if (!data) return { result: "Page introuvable.", error: true };
      return { result: `# ${data.title}\n${blocksToText(data.content).slice(0, 40000) || "(page vide)"}` };
    }
    return { result: "Outil inconnu.", error: true };
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for (let turn = 0; turn < 8; turn++) {
          const res = await fetch(`${ENDPOINT}/${MODEL}:streamGenerateContent?alt=sse`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents,
              tools: [{ functionDeclarations: TOOLS }],
            }),
          });
          if (!res.ok || !res.body) {
            const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
            console.error("assistant: Gemini a répondu", res.status, detail.slice(0, 300));
            send({
              t: "error",
              v: res.status === 400 && /API key/i.test(detail) ? "La clé GEMINI_API_KEY est refusée : vérifie-la dans Vercel."
                : res.status === 401 || res.status === 403 ? "La clé GEMINI_API_KEY n'a pas accès à Gemini : vérifie que l'API « Generative Language » est activée et autorisée pour cette clé."
                : res.status === 404 ? `Le modèle « ${MODEL} » est introuvable.`
                : res.status === 429 ? "Quota Gemini atteint. Réessaie dans une minute."
                : `L'assistant est indisponible (erreur ${res.status}).`,
            });
            break;
          }

          // Lecture du flux : chaque ligne « data: » porte un morceau de réponse.
          const parts: Part[] = [];
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let blocked = false;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const chunk = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
              if (chunk.promptFeedback?.blockReason || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(chunk.candidates?.[0]?.finishReason ?? "")) blocked = true;
              for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
                parts.push(part);
                if (part.text && !part.thought) send({ t: "text", v: part.text });
              }
            }
          }
          if (blocked) {
            send({ t: "text", v: "Je ne peux pas répondre à cette demande." });
            break;
          }

          const calls = parts.filter((p) => p.functionCall);
          if (!calls.length) break;
          // Les morceaux du modèle sont renvoyés tels quels (ils portent sa signature de raisonnement).
          contents.push({ role: "model", parts });
          const results: Part[] = [];
          for (const call of calls) {
            const out = await runTool(call.functionCall!.name, call.functionCall!.args ?? {});
            if (out.label) send({ t: "action", v: out.label });
            results.push({ functionResponse: { name: call.functionCall!.name, response: out.error ? { error: out.result } : { result: out.result } } });
          }
          contents.push({ role: "user", parts: results });
          send({ t: "text", v: "\n" });
        }
      } catch (error) {
        console.error("assistant:", error instanceof Error ? error.message : error);
        send({ t: "error", v: "L'assistant a rencontré un problème." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
