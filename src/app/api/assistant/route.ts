import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { blocksToText, buildContext, isoWeekKey, todayParis } from "@/lib/assistant/context";
import { CATEGORY_KEYS } from "@/lib/categories";
import { MEMBERS, isWho, type Who } from "@/lib/members";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
const BUCKET = /^(inbox|life|d:\d{4}-\d{2}-\d{2}|w:\d{4}-W\d{2}|m:\d{4}-\d{2}|y:\d{4})$/;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "ajouter_tache",
    description: "Crée une tâche dans le QG. À utiliser dès que la personne demande d'ajouter, de noter ou d'assigner quelque chose à faire. Plusieurs tâches = plusieurs appels.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["titre", "description", "pour", "priorite", "categorie", "echeance"],
      properties: {
        titre: { type: "string", description: "Titre court, à l'infinitif." },
        description: { type: ["string", "null"], description: "Détails utiles, sinon null." },
        pour: { type: "string", enum: ["max", "adrien", "both"], description: "Personne assignée. Par défaut : la personne qui parle." },
        priorite: { type: "string", enum: ["urgent", "normal", "later"] },
        categorie: { type: ["string", "null"], enum: [...CATEGORY_KEYS, null], description: "La catégorie qui correspond, sinon null." },
        echeance: { type: "string", description: "inbox (sans date), life, d:AAAA-MM-JJ (un jour), w:AAAA-Wnn (une semaine ISO), m:AAAA-MM (un mois) ou y:AAAA." },
      },
    },
  },
  {
    name: "envoyer_message",
    description: "Envoie un retour ou un lien à l'autre membre : il le verra sur son profil.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["a", "texte", "lien"],
      properties: {
        a: { type: "string", enum: ["max", "adrien"] },
        texte: { type: ["string", "null"] },
        lien: { type: ["string", "null"], description: "Adresse https complète, sinon null." },
      },
    },
  },
  {
    name: "lire_page",
    description: "Lit le contenu d'une page (document) du QG à partir de son id, donné dans la liste « pages ».",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } },
  },
];

function systemPrompt(me: Who, data: string): string {
  const today = todayParis();
  const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(today);
  return `Tu es l'assistant du QG de Vik Studios, l'outil privé de Maximilien (Max) et Adrien, les deux fondateurs. Vik Studios fait la promotion de ses apps (Sophia, Micabo, Unswipe, bientôt Runvik) avec des comptes TikTok de slideshows tenus par des posteurs.

Tu parles à ${MEMBERS[me].name}. Nous sommes le ${jour}, semaine ${isoWeekKey(today).slice(7)}.

Tu réponds à partir des données du QG fournies plus bas, et uniquement d'elles pour tout ce qui est chiffre, date ou fait sur la société. Si l'information n'y est pas, dis-le en une phrase et indique où elle pourrait se trouver, sans inventer. Quand un chiffre vient d'un relevé ancien, donne sa date.

Pour les conseils (« que devrait-on faire », « où recruter »), appuie-toi sur les chiffres : cite ceux qui fondent ton avis, puis donne une recommandation nette. Pour les pays, le critère principal est l'euro par nouvel utilisateur, à pondérer par le volume ; un pays avec très peu d'utilisateurs n'est pas une preuve.

Les réunions et rendez-vous se trouvent dans les tâches datées et dans la semaine type ; l'agenda Google n'est pas relié.

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "L'assistant n'est pas encore branché : il manque la variable ANTHROPIC_API_KEY dans Vercel." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { messages?: { role: string; text: string }[] } | null;
  const history = (body?.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim()).slice(-30);
  if (!history.length || history.at(-1)!.role !== "user") return NextResponse.json({ error: "Question vide." }, { status: 400 });
  if (containsSecret(history.at(-1)!.text)) return NextResponse.json({ error: `${SECRET_MESSAGE}.` }, { status: 400 });

  const client = new Anthropic();
  const system = systemPrompt(me, await buildContext(db, me));
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));

  async function runTool(name: string, input: Record<string, unknown>): Promise<{ result: string; label?: string; error?: boolean }> {
    if (containsSecret(input)) return { result: `Refusé : ${SECRET_MESSAGE}.`, error: true };
    if (name === "ajouter_tache") {
      const title = String(input.titre ?? "").trim();
      const bucket = String(input.echeance ?? "inbox");
      if (!title) return { result: "Titre manquant.", error: true };
      if (!BUCKET.test(bucket)) return { result: "Échéance invalide. Formats : inbox, d:AAAA-MM-JJ, w:AAAA-Wnn, m:AAAA-MM, y:AAAA.", error: true };
      const { error } = await db.from("items").insert({
        title, notes: input.description ? String(input.description) : null, bucket,
        owner: input.pour, prio: input.priorite, category: input.categorie ?? null, sort_order: Date.now(), created_by: userId,
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
          const run = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system,
            tools: TOOLS,
            messages,
          });
          run.on("text", (delta) => send({ t: "text", v: delta }));
          const message = await run.finalMessage();

          if (message.stop_reason === "refusal") {
            send({ t: "text", v: "Je ne peux pas répondre à cette demande." });
            break;
          }
          const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (message.stop_reason !== "tool_use" || !calls.length) break;

          messages.push({ role: "assistant", content: message.content });
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const call of calls) {
            const out = await runTool(call.name, (call.input ?? {}) as Record<string, unknown>);
            if (out.label) send({ t: "action", v: out.label });
            results.push({ type: "tool_result", tool_use_id: call.id, content: out.result, is_error: out.error });
          }
          messages.push({ role: "user", content: results });
          send({ t: "text", v: "\n" });
        }
      } catch (error) {
        const message =
          error instanceof Anthropic.AuthenticationError ? "La clé ANTHROPIC_API_KEY est refusée : vérifie-la dans Vercel."
          : error instanceof Anthropic.RateLimitError ? "Trop de demandes d'un coup. Réessaie dans une minute."
          : error instanceof Anthropic.APIError ? `L'assistant est indisponible (erreur ${error.status ?? "réseau"}).`
          : "L'assistant a rencontré un problème.";
        send({ t: "error", v: message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
