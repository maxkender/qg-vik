import { NextResponse } from "next/server";
import { blocksToText, buildContext } from "@/lib/assistant/context";
import { attachmentParts, callGemini, geminiError, type Content, type Part } from "@/lib/assistant/gemini";
import { assistantSession, openPage, whoWeAre, WRITING_FORMAT } from "@/lib/assistant/session";
import { CATEGORY_KEYS } from "@/lib/categories";
import { markdownToBlocks } from "@/lib/markdown-blocks";
import { MEMBERS, isWho, type Who } from "@/lib/members";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";

export const maxDuration = 120;

const BUCKET = /^(inbox|life|d:\d{4}-\d{2}-\d{2}|w:\d{4}-W\d{2}|m:\d{4}-\d{2}|y:\d{4})$/;
const OWNERS = ["max", "adrien", "both"];
const PRIOS = ["urgent", "doing", "normal"];
const REPEATS = ["daily", "weekdays", "weekly", "biweekly", "monthly"];
const ECHEANCE = "inbox (sans date), life, d:AAAA-MM-JJ (un jour), w:AAAA-Wnn (une semaine ISO), m:AAAA-MM (un mois) ou y:AAAA.";

const TOOLS = [
  {
    name: "ajouter_tache",
    description: "Crée une tâche ou une réunion dans le QG. À utiliser dès que la personne demande d'ajouter, de noter ou d'assigner quelque chose à faire. Plusieurs tâches = plusieurs appels.",
    parameters: {
      type: "OBJECT",
      required: ["titre", "pour", "priorite", "echeance"],
      properties: {
        titre: { type: "STRING", description: "Titre court, à l'infinitif." },
        description: { type: "STRING", description: "Détails utiles, si besoin." },
        pour: { type: "STRING", enum: OWNERS, description: "Personne assignée. Par défaut : la personne qui parle." },
        priorite: { type: "STRING", enum: PRIOS },
        categorie: { type: "STRING", enum: CATEGORY_KEYS, description: "La catégorie qui correspond, si l'une convient." },
        labels: { type: "ARRAY", items: { type: "STRING" }, description: "Labels libres si la personne en cite : Sophia, Micabo, Unswipe, Runvik, Atala…" },
        heure: { type: "STRING", description: "Heure d'une réunion, au format HH:MM." },
        lien_meet: { type: "STRING", description: "Lien Google Meet (https) donné par la personne. Ne jamais en inventer." },
        repetition: { type: "STRING", enum: REPEATS, description: "Seulement si la tâche ou la réunion se répète." },
        echeance: { type: "STRING", description: ECHEANCE },
      },
    },
  },
  {
    name: "modifier_tache",
    description: "Modifie une tâche existante (son id est dans « taches_ouvertes ») : la marquer faite, changer la personne, l'urgence, l'échéance ou le titre.",
    parameters: {
      type: "OBJECT",
      required: ["id"],
      properties: {
        id: { type: "STRING" },
        faite: { type: "BOOLEAN" },
        titre: { type: "STRING" },
        pour: { type: "STRING", enum: OWNERS },
        priorite: { type: "STRING", enum: PRIOS },
        echeance: { type: "STRING", description: ECHEANCE },
      },
    },
  },
  {
    name: "ecrire_dans_page",
    description: "Écrit dans une page du QG : un plan, un texte, un tableau, un graphique. Sans page_id, écrit dans la page ouverte à l'écran.",
    parameters: {
      type: "OBJECT",
      required: ["contenu", "mode"],
      properties: {
        page_id: { type: "STRING", description: "Id de la page. À omettre pour la page ouverte." },
        contenu: { type: "STRING", description: "Le texte à écrire, au format indiqué dans les consignes." },
        mode: { type: "STRING", enum: ["ajouter", "remplacer"], description: "« ajouter » à la fin (par défaut), « remplacer » tout le contenu seulement si la personne le demande." },
      },
    },
  },
  {
    name: "creer_page",
    description: "Crée une nouvelle page avec son contenu. À utiliser quand aucune page n'est ouverte ou que la personne demande un nouveau document.",
    parameters: {
      type: "OBJECT",
      required: ["titre", "contenu"],
      properties: {
        titre: { type: "STRING" },
        contenu: { type: "STRING", description: "Le texte de la page, au format indiqué dans les consignes." },
        dossier: { type: "STRING", description: "Nom d'un dossier existant où la ranger, si la personne en cite un." },
      },
    },
  },
  {
    name: "envoyer_message",
    description: "Envoie un retour ou un lien à l'autre membre : il le verra sur son profil.",
    parameters: {
      type: "OBJECT",
      required: ["a"],
      properties: { a: { type: "STRING", enum: ["max", "adrien"] }, texte: { type: "STRING" }, lien: { type: "STRING", description: "Adresse https complète." } },
    },
  },
  {
    name: "lire_page",
    description: "Lit le contenu d'une page (document) du QG à partir de son id, donné dans la liste « pages ».",
    parameters: { type: "OBJECT", required: ["id"], properties: { id: { type: "STRING" } } },
  },
];

function systemPrompt(me: Who, data: string, page: Awaited<ReturnType<typeof openPage>>): string {
  return `${whoWeAre(me)}

Tu réponds à partir des données du QG fournies plus bas, et uniquement d'elles pour tout ce qui est chiffre, date ou fait sur la société. Si l'information n'y est pas, dis-le en une phrase et indique où elle pourrait se trouver, sans inventer. Quand un chiffre vient d'un relevé ancien, donne sa date.

Pour les conseils (« que devrait-on faire », « où recruter »), appuie-toi sur les chiffres : cite ceux qui fondent ton avis, puis donne une recommandation nette. Pour les pays, le critère principal est l'euro par nouvel utilisateur, à pondérer par le volume ; un pays avec très peu d'utilisateurs n'est pas une preuve.

Les réunions sont les tâches de catégorie « reunion » (avec leur heure, leur lien Meet et leur répétition), plus la semaine type ; l'agenda Google n'est pas relié. Pour créer une réunion, utilise ajouter_tache avec la catégorie reunion, un jour précis et l'heure. Tu ne peux pas créer de lien Meet : si aucun n'est donné, dis qu'il reste à l'ajouter dans la tâche.

Le QG ne contient aucun mot de passe ni clé API, seulement l'endroit où ils sont rangés : donne cet endroit si on te le demande.

Tu agis toi-même dans le QG : créer ou modifier une tâche, envoyer un message, écrire dans une page, créer une page. Quand la demande est claire, fais-le sans demander de confirmation, puis confirme en une ligne ce qui a été fait.

Quand la personne te demande de rédiger quelque chose de long (un plan, un compte rendu, une réponse à des consignes, un tableau, un graphique), écris-le dans une page plutôt que dans la discussion : dans la page ouverte s'il y en a une, sinon dans une nouvelle page. Si elle joint un fichier (une capture de consignes, un PDF, un document, un tableur, un enregistrement), lis-le attentivement et appuie-toi sur ce qu'il contient ; cite les contraintes importantes (dates limites, formats, critères).

${WRITING_FORMAT}

Dans la discussion elle-même : français, tutoiement, direct et court. Commence par la réponse. Texte simple, sans titres, sans gras, sans tableaux ; des tirets pour une liste. Montants en euros arrondis, dates au format « mercredi 18 novembre ».

${page ? `Page ouverte à l'écran : « ${page.title} » (id ${page.id})${page.folder ? ", un dossier" : ""}. Son contenu actuel :\n${page.text || "(vide)"}` : "Aucune page n'est ouverte à l'écran."}

Données du QG (JSON) :
${data}`;
}

type Turn = { role: string; text: string; files?: unknown };

export async function POST(request: Request) {
  const session = await assistantSession();
  if ("error" in session) return session.error;
  const { db, me, userId, apiKey } = session;

  const body = (await request.json().catch(() => null)) as { messages?: Turn[]; page_id?: unknown } | null;
  const history = (body?.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string").slice(-30);
  const last = history.at(-1);
  const files = attachmentParts(last?.files);
  if (!last || last.role !== "user" || (!last.text.trim() && !files.length)) return NextResponse.json({ error: "Question vide." }, { status: 400 });
  if (containsSecret(last.text)) return NextResponse.json({ error: `${SECRET_MESSAGE}.` }, { status: 400 });

  const page = await openPage(db, body?.page_id);
  const system = systemPrompt(me, await buildContext(db, me), page);
  const contents: Content[] = history
    .filter((m) => m.text.trim() || m === last)
    .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.trim() || "Regarde ce que je t'envoie." }] }));
  // Les fichiers n'accompagnent que le dernier message.
  contents.at(-1)!.parts.unshift(...files);

  type Out = { result: string; label?: string; href?: string; error?: boolean };
  const fail = (result: string): Out => ({ result, error: true });

  async function runTool(name: string, input: Record<string, unknown>): Promise<Out> {
    if (containsSecret(input)) return fail(`Refusé : ${SECRET_MESSAGE}.`);
    const now = new Date().toISOString();

    if (name === "ajouter_tache") {
      const title = String(input.titre ?? "").trim();
      const bucket = String(input.echeance ?? "inbox");
      if (!title) return fail("Titre manquant.");
      if (!BUCKET.test(bucket)) return fail(`Échéance invalide. Formats : ${ECHEANCE}`);
      const { error } = await db.from("items").insert({
        title, notes: input.description ? String(input.description) : null, bucket,
        owner: OWNERS.includes(String(input.pour)) ? input.pour : me,
        prio: PRIOS.includes(String(input.priorite)) ? input.priorite : "normal",
        category: CATEGORY_KEYS.includes(input.categorie as never) ? input.categorie : null,
        tags: Array.isArray(input.labels) ? input.labels.map((l) => String(l).trim().slice(0, 30)).filter(Boolean).slice(0, 8) : [],
        at_time: /^\d{2}:\d{2}$/.test(String(input.heure ?? "")) ? input.heure : null,
        meet_url: /^https:\/\/\S+$/.test(String(input.lien_meet ?? "")) ? input.lien_meet : null,
        repeat_rule: REPEATS.includes(String(input.repetition)) ? input.repetition : null,
        sort_order: Date.now(), created_by: userId,
      });
      return error ? fail(`Échec : ${error.message}`) : { result: "Tâche créée.", label: `Tâche ajoutée : ${title}` };
    }

    if (name === "modifier_tache") {
      const patch: Record<string, unknown> = {};
      if (typeof input.faite === "boolean") Object.assign(patch, { done: input.faite, done_at: input.faite ? now : null });
      if (typeof input.titre === "string" && input.titre.trim()) patch.title = input.titre.trim();
      if (OWNERS.includes(String(input.pour))) patch.owner = input.pour;
      if (PRIOS.includes(String(input.priorite))) patch.prio = input.priorite;
      if (input.echeance !== undefined) {
        if (!BUCKET.test(String(input.echeance))) return fail(`Échéance invalide. Formats : ${ECHEANCE}`);
        patch.bucket = input.echeance;
      }
      if (!Object.keys(patch).length) return fail("Rien à modifier.");
      const { data, error } = await db.from("items").update(patch).eq("id", String(input.id)).select("title").maybeSingle();
      if (error) return fail(`Échec : ${error.message}`);
      return data ? { result: "Tâche modifiée.", label: `Tâche modifiée : ${data.title}` } : fail("Tâche introuvable.");
    }

    if (name === "ecrire_dans_page") {
      const target = input.page_id ? await openPage(db, input.page_id) : page;
      if (!target) return fail("Aucune page ouverte ni page_id valide : utilise creer_page.");
      if (target.folder) return fail("C'est un dossier : crée une page dedans avec creer_page.");
      const blocks = markdownToBlocks(String(input.contenu ?? ""));
      if (!blocks.length) return fail("Contenu vide.");
      const empty = (b: unknown) => (b as { type?: string }).type === "paragraph" && !blocksToText([b]);
      const kept = input.mode === "remplacer" ? [] : target.content.filter((b, i, all) => !(empty(b) && i === all.length - 1));
      const { error } = await db.from("pages").update({ content: [...kept, ...blocks], updated_by: userId, updated_at: now }).eq("id", target.id);
      return error ? fail(`Échec : ${error.message}`) : { result: "Écrit dans la page.", label: `Écrit dans « ${target.title} »`, href: `/pages?id=${target.id}` };
    }

    if (name === "creer_page") {
      const title = String(input.titre ?? "").trim();
      if (!title) return fail("Titre manquant.");
      let parent: string | null = null;
      if (typeof input.dossier === "string" && input.dossier.trim()) {
        const { data } = await db.from("pages").select("id").eq("icon", "folder").is("archived_at", null).ilike("title", input.dossier.trim()).limit(1);
        parent = (data?.[0]?.id as string | undefined) ?? null;
      }
      const { data, error } = await db
        .from("pages")
        .insert({ title, parent_id: parent, content: markdownToBlocks(String(input.contenu ?? "")), sort_order: Date.now(), created_by: userId, updated_by: userId })
        .select("id")
        .single();
      return error ? fail(`Échec : ${error.message}`) : { result: `Page créée (id ${data.id}).`, label: `Page créée : ${title}`, href: `/pages?id=${data.id}` };
    }

    if (name === "envoyer_message") {
      const to = input.a;
      const text = input.texte ? String(input.texte).trim() : null;
      const url = input.lien ? String(input.lien).trim() : null;
      if (!isWho(to)) return fail("Destinataire inconnu.");
      if (!text && !url) return fail("Message vide.");
      if (url && !/^https?:\/\//i.test(url)) return fail("Le lien doit commencer par https://");
      const { error } = await db.from("messages").insert({ to_who: to, from_who: me, body: text, url, created_by: userId });
      return error ? fail(`Échec : ${error.message}`) : { result: "Message envoyé.", label: `Envoyé à ${MEMBERS[to].nick}` };
    }

    if (name === "lire_page") {
      const found = await openPage(db, input.id);
      return found ? { result: `# ${found.title}\n${found.text || "(page vide)"}` } : fail("Page introuvable.");
    }
    return fail("Outil inconnu.");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for (let turn = 0; turn < 8; turn++) {
          const res = await callGemini(apiKey, "streamGenerateContent", { systemInstruction: { parts: [{ text: system }] }, contents, tools: [{ functionDeclarations: TOOLS }] });
          if (!res.ok || !res.body) {
            const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
            console.error("assistant: Gemini a répondu", res.status, detail.slice(0, 300));
            send({ t: "error", v: geminiError(res.status, detail) });
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
            if (out.label) send({ t: "action", v: out.label, href: out.href });
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
