import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoPossible, classifyFeedback, classifyMail, draftReply } from "@/lib/agent/classify";
import { falReady } from "@/lib/agent/fal";
import { BOXES, gmailReady, gmailUrl, isBox, messageIdOf, newMails, saveDraft, type Box } from "@/lib/agent/gmail";
import { deliver, type DraftRow, type FeedbackRow } from "@/lib/agent/reply";
import { readState, writeState } from "@/lib/agent/state";
import { ascApps, ascReady, ascReviews, playReady, playReviews, type Review } from "@/lib/agent/stores";
import { isPosteur, prefOf, sectionOf, type Pref } from "@/lib/agent/triage";

type App = { slug: string; name: string; bundle_id: string | null; play_package: string | null };
type Item = FeedbackRow & { texte: string | null; recu_le: string; note: number | null; categorie: string | null; gravite: string | null; touche: string | null; demande: string | null; agressif: boolean; langue: string | null; pays: string | null; confiance: number | null; citation: string | null; topic_id: string | null; url: string | null; auteur: string | null; classe_le: string | null };
const DAY = 864e5;
const keyOf = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ce qui est branché, sans jamais montrer une clé. */
export function agentStatus() {
  return { "gmail:max": gmailReady("max"), "gmail:support": gmailReady("support"), app_store: ascReady(), play: playReady(), fal: falReady() };
}

// ------------------------------------------------------------- 1. Gmail + tri
async function ingestMail(db: SupabaseClient, box: Box) {
  const state = await readState(db, `gmail:${box}`);
  try {
    const since = state.cursor ? Number(state.cursor) - 60_000 : Date.now() - 3 * DAY;
    const from = new Date(since - DAY).toISOString();
    const [seenDigest, seenFeedback, posteurs] = await Promise.all([
      db.from("mail_digest_items").select("id").eq("box", box).gte("recu_le", from),
      db.from("feedback_items").select("id").eq("box", box).gte("recu_le", from),
      db.from("mail_digest_items").select("expediteur_email").eq("tri", "ignore_posteur").limit(5000),
    ]);
    const known = new Set([...(seenDigest.data ?? []).map((r) => r.id as string), ...(seenFeedback.data ?? []).map((r) => (r.id as string).replace(/^mail:/, ""))]);
    const knownPosteurs = new Set((posteurs.data ?? []).map((r) => r.expediteur_email as string));
    const mails = await newMails(box, since, known);
    let ignored = 0;
    for (const m of mails) {
      const base = { box, thread_id: m.threadId, recu_le: new Date(m.at).toISOString(), url: gmailUrl(box, m.threadId) };
      if (isPosteur(m, knownPosteurs)) {
        // Un posteur : on note seulement qu'on l'a vu. Ni classement, ni réponse, ni contenu gardé.
        ignored++;
        knownPosteurs.add(m.fromEmail);
        await db.from("mail_digest_items").upsert({ ...base, id: m.id, expediteur: m.from, expediteur_email: m.fromEmail, objet: m.subject, tri: "ignore_posteur" }, { onConflict: "id", ignoreDuplicates: true });
      } else if (box === "support") {
        await db.from("feedback_items").upsert({ ...base, id: `mail:${m.id}`, source: "mail", auteur: m.from, auteur_email: m.fromEmail, titre: m.subject, texte: m.text }, { onConflict: "id", ignoreDuplicates: true });
      } else {
        await db.from("mail_digest_items").upsert({ ...base, id: m.id, expediteur: m.from, expediteur_email: m.fromEmail, objet: m.subject, tri: "boite_max", texte: m.text }, { onConflict: "id", ignoreDuplicates: true });
      }
    }
    await writeState(db, state, { cursor: mails.length ? String(mails.at(-1)!.at) : state.cursor, add: { lus: mails.length, posteurs: ignored } });
    return { lus: mails.length, posteurs: ignored };
  } catch (e) {
    await writeState(db, state, { error: message(e) });
    return { erreur: message(e) };
  }
}

// ------------------------------------------------------- 2. App Store et Play
async function ingestReviews(db: SupabaseClient, source: "app_store" | "play", apps: App[]) {
  const state = await readState(db, source);
  try {
    const since = state.cursor ?? new Date(Date.now() - 30 * DAY).toISOString();
    const found: { app: string; review: Review }[] = [];
    if (source === "app_store") {
      const account = await ascApps();
      for (const a of account) {
        const app = apps.find((x) => x.bundle_id === a.bundleId);
        if (app) (await ascReviews(a.id, since)).forEach((review) => found.push({ app: app.slug, review }));
      }
    } else {
      for (const app of apps) {
        const pkg = app.play_package ?? app.bundle_id;
        if (!pkg) continue;
        // Une app absente du Play Store ne doit pas bloquer les autres.
        const reviews = await playReviews(pkg, since).catch((e) => (/ 40[34] /.test(message(e)) ? [] : Promise.reject(e)));
        reviews.forEach((review) => found.push({ app: app.slug, review }));
      }
    }
    const rows = found.map(({ app, review: r }) => ({ id: `${source}:${r.id}`, app_slug: app, source, auteur: r.author, titre: r.title, texte: r.text, recu_le: r.at, url: r.url, note: r.rating, pays: r.country, langue: r.lang }));
    for (let i = 0; i < rows.length; i += 200) await db.from("feedback_items").upsert(rows.slice(i, i + 200), { onConflict: "id", ignoreDuplicates: true });
    await writeState(db, state, { cursor: found.map((f) => f.review.at).sort().at(-1) ?? state.cursor, add: { lus: rows.length } });
    return { lus: rows.length };
  } catch (e) {
    await writeState(db, state, { error: message(e) });
    return { erreur: message(e) };
  }
}

// ------------------------------------------------- 3. classement et sujets
async function classify(db: SupabaseClient, apps: App[]) {
  const state = await readState(db, "fal");
  let done = 0, errors = 0, last: string | null = null;
  const { data: prefs } = await db.from("mail_prefs").select("liste, genre, valeur, statut");

  // La boîte de Max d'abord : un mail d'utilisateur arrivé chez lui repart vers le support des apps.
  const { data: mails } = await db.from("mail_digest_items").select("*").eq("tri", "boite_max").is("section", null).is("erreur", null).not("texte", "is", null).order("recu_le").limit(40);
  for (const m of mails ?? []) {
    try {
      const c = await classifyMail({ from: `${m.expediteur} <${m.expediteur_email}>`, subject: m.objet ?? "", text: m.texte ?? "" }, apps);
      if (c.utilisateur_app) {
        await db.from("feedback_items").upsert({ id: `mail:${m.id}`, source: "mail", box: m.box, thread_id: m.thread_id, auteur: m.expediteur, auteur_email: m.expediteur_email, titre: m.objet, texte: m.texte, recu_le: m.recu_le, url: m.url }, { onConflict: "id", ignoreDuplicates: true });
        await db.from("mail_digest_items").delete().eq("id", m.id);
      } else {
        const pref = prefOf({ email: m.expediteur_email ?? "", subject: m.objet ?? "", resume: c.resume, categorie: c.categorie }, (prefs ?? []) as Pref[]);
        await db.from("mail_digest_items").update({ categorie: c.categorie, section: sectionOf(c.categorie, c.attend_reponse, pref), resume: c.resume, texte: null }).eq("id", m.id);
      }
      done++;
    } catch (e) {
      errors++;
      last = message(e);
      await db.from("mail_digest_items").update({ erreur: last.slice(0, 300) }).eq("id", m.id);
    }
  }

  const { data: items } = await db.from("feedback_items").select("*").is("classe_le", null).is("erreur", null).order("recu_le").limit(40);
  const { data: topicRows } = await db.from("feedback_topics").select("*");
  const topics = (topicRows ?? []) as { id: string; app_slug: string; titre: string; cle: string; gravite: string; touche: string | null; nombre: number; premier_vu: string | null; dernier_vu: string | null; exemples: { citation: string; id: string }[] }[];
  const queue = (items ?? []) as Item[];
  const titles = (item: Item) => topics.filter((t) => !item.app_slug || t.app_slug === item.app_slug).sort((a, b) => b.nombre - a.nombre).slice(0, 40).map((t) => t.titre);
  for (let at = 0; at < queue.length; at += 5) {
   // Le modèle lit 5 retours à la fois ; les sujets sont ensuite mis à jour un par un, dans l'ordre.
   const batch = queue.slice(at, at + 5);
   const answers = await Promise.allSettled(batch.map((item) => (item.texte?.trim() ? classifyFeedback({ source: item.source, app: item.app_slug, titre: item.titre, texte: item.texte, note: item.note }, apps, titles(item)) : Promise.resolve(null))));
   for (const [index, item] of batch.entries()) {
    const now = new Date().toISOString();
    try {
      const answer = answers[index];
      if (answer.status === "rejected") throw answer.reason;
      if (!answer.value) {
        // Une note sans texte : rien à faire lire au modèle.
        await db.from("feedback_items").update({ categorie: (item.note ?? 0) >= 4 ? "eloge" : "autre", gravite: "faible", classe_le: now }).eq("id", item.id);
        continue;
      }
      const c = answer.value;
      done++;
      if (item.source === "mail" && !c.est_utilisateur) {
        // Pas un utilisateur : le mail repart dans le récap de la boîte.
        await db.from("mail_digest_items").upsert({ id: item.id.replace(/^mail:/, ""), box: item.box, thread_id: item.thread_id, expediteur: item.auteur, expediteur_email: item.auteur_email, objet: item.titre, recu_le: item.recu_le, url: item.url, tri: "boite_max", texte: item.texte }, { onConflict: "id", ignoreDuplicates: true });
        await db.from("feedback_items").delete().eq("id", item.id);
        continue;
      }
      const app = item.app_slug ?? apps.find((a) => a.slug === c.app)?.slug ?? null;
      let topicId: string | null = null;
      if (app && c.sujet && ["probleme", "feature", "abonnement_remboursement", "question"].includes(c.categorie)) {
        const cle = keyOf(c.sujet);
        const old = topics.find((t) => t.app_slug === app && t.cle === cle);
        const row = {
          app_slug: app, cle, titre: old?.titre ?? c.sujet, categorie: c.categorie, touche: c.touche ?? old?.touche ?? null,
          gravite: c.gravite === "urgent" || old?.gravite === "urgent" ? "urgent" : (old?.gravite ?? c.gravite), nombre: (old?.nombre ?? 0) + 1,
          premier_vu: [old?.premier_vu, item.recu_le].filter(Boolean).sort()[0], dernier_vu: [old?.dernier_vu, item.recu_le].filter(Boolean).sort().at(-1),
          exemples: [{ citation: c.citation, id: item.id }, ...(old?.exemples ?? [])].slice(0, 4),
        };
        const { data: saved, error } = await db.from("feedback_topics").upsert(row, { onConflict: "app_slug,cle" }).select("*").single();
        if (error) throw new Error(error.message);
        topicId = saved.id;
        if (old) Object.assign(old, saved);
        else topics.push(saved);
      }
      await db.from("feedback_items").update({
        app_slug: app, categorie: c.categorie, gravite: c.gravite, touche: c.touche, demande: c.demande, agressif: c.agressif, langue: item.langue ?? c.langue, pays: item.pays ?? c.pays,
        resume: c.resume, citation: c.citation, confiance: c.confiance, topic_id: topicId, classe_le: now,
      }).eq("id", item.id);
    } catch (e) {
      errors++;
      last = message(e);
      await db.from("feedback_items").update({ erreur: last.slice(0, 300) }).eq("id", item.id);
    }
   }
  }
  await writeState(db, state, { error: errors > 0 && done === 0 ? last : null, add: { classes: done, erreurs: errors } });
  return { classes: done, erreurs: errors };
}

// ------------------------------------------------------------ 4. brouillons
async function drafts(db: SupabaseClient, apps: App[]) {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const [{ data: items }, { data: existing }, { data: faq }, { data: settings }] = await Promise.all([
    db.from("feedback_items").select("*").not("classe_le", "is", null).not("app_slug", "is", null).gte("recu_le", since).order("recu_le", { ascending: false }).limit(300),
    db.from("reply_drafts").select("feedback_id"),
    db.from("app_faq").select("app_slug, question, reponse").order("sort_order"),
    db.from("auto_send_settings").select("app_slug, categorie, auto_send_enabled"),
  ]);
  const has = new Set((existing ?? []).map((d) => d.feedback_id as string));
  // Tous les mails d'utilisateurs ; pour les avis, ceux qui appellent une réponse.
  const todo = ((items ?? []) as Item[]).filter((i) => !has.has(i.id) && i.texte?.trim() && (i.source === "mail" || ["probleme", "abonnement_remboursement", "question", "feature"].includes(i.categorie ?? ""))).slice(0, 20);
  let written = 0, sent = 0;
  const one = async (item: Item) => {
    try {
      const canal = item.source === "mail" ? "gmail" : (item.source as "app_store" | "play");
      const app = apps.find((a) => a.slug === item.app_slug)!;
      const d = await draftReply({ app: app.name, canal, langue: item.langue ?? "en", titre: item.titre, texte: item.texte!, note: item.note }, (faq ?? []).filter((f) => !f.app_slug || f.app_slug === app.slug));
      const kind = canal === "gmail" ? autoPossible({ categorie: item.categorie, demande: item.demande, agressif: item.agressif, confiance: item.confiance ?? 0 }, d.sur) : null;
      let gmailDraftId: string | null = null;
      if (canal === "gmail" && isBox(item.box) && item.auteur_email && item.thread_id) {
        // Le brouillon est aussi posé dans Gmail. S'il échoue, on garde quand même celui du QG.
        gmailDraftId = await saveDraft(item.box, { to: item.auteur_email, subject: item.titre ?? "", text: d.texte, threadId: item.thread_id, inReplyTo: await messageIdOf(item.box, item.id.replace(/^mail:/, "")).catch(() => null) }).catch(() => null);
      }
      const { data: draft, error } = await db.from("reply_drafts").insert({ feedback_id: item.id, app_slug: item.app_slug, canal, langue: item.langue, texte: d.texte, gmail_draft_id: gmailDraftId, auto_possible: Boolean(kind) }).select("*").single();
      if (error) throw new Error(error.message);
      written++;
      // Envoi automatique : seulement si le réglage de cette app et de cette catégorie est activé (tout est désactivé par défaut).
      if (kind && (settings ?? []).some((s) => s.app_slug === item.app_slug && s.categorie === kind && s.auto_send_enabled)) {
        await deliver(db, draft as DraftRow, item, d.texte, "agent", true);
        sent++;
      }
    } catch (e) {
      console.error("agent brouillon:", message(e));
    }
  };
  for (let at = 0; at < todo.length; at += 4) await Promise.all(todo.slice(at, at + 4).map(one));
  return { brouillons: written, envois_auto: sent };
}

// ------------------------------------------- 5. urgents et propositions par app
async function todos(db: SupabaseClient) {
  const [{ data: topics }, { data: items }] = await Promise.all([
    db.from("feedback_topics").select("*"),
    db.from("feedback_items").select("app_slug, topic_id, recu_le, note, categorie").gte("recu_le", new Date(Date.now() - 14 * DAY).toISOString()).limit(5000),
  ]);
  const week = Date.now() - 7 * DAY;
  const recent = (items ?? []).filter((i) => new Date(i.recu_le as string).getTime() >= week);
  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  for (const t of topics ?? []) {
    const n7 = recent.filter((i) => i.topic_id === t.id).length;
    if (t.categorie === "feature") {
      rows.push({ app_slug: t.app_slug, type: "proposition", cle: t.id, topic_id: t.id, titre: t.titre, nombre: t.nombre, raison: `${t.nombre} demande${t.nombre > 1 ? "s" : ""}`, updated_at: now });
      continue;
    }
    const raison = t.gravite === "urgent" ? "Gravité urgente" : t.touche ? `Touche ${t.touche === "paiement" ? "au paiement" : "à la connexion"}` : t.categorie === "probleme" && n7 > 3 ? `${n7} retours en 7 jours` : null;
    if (raison && n7 > 0) rows.push({ app_slug: t.app_slug, type: "urgent", cle: t.id, topic_id: t.id, titre: t.titre, nombre: n7, raison, updated_at: now });
  }
  // La note qui baisse de 0,3 point ou plus sur 7 jours.
  const mean = (list: typeof recent) => (list.length ? list.reduce((a, i) => a + (i.note as number), 0) / list.length : null);
  for (const app of new Set((items ?? []).map((i) => i.app_slug as string).filter(Boolean))) {
    const rated = (items ?? []).filter((i) => i.app_slug === app && i.note);
    const now7 = mean(rated.filter((i) => new Date(i.recu_le as string).getTime() >= week));
    const before = mean(rated.filter((i) => new Date(i.recu_le as string).getTime() < week));
    if (now7 !== null && before !== null && before - now7 >= 0.3) {
      const f = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      rows.push({ app_slug: app, type: "urgent", cle: "note", topic_id: null, titre: "La note baisse", nombre: 0, raison: `${f(before)} → ${f(now7)} sur 7 jours`, updated_at: now });
    }
  }
  // Le statut (à faire, en cours, fait, refusé) n'est pas dans les lignes : il reste celui choisi dans le QG.
  if (rows.length) await db.from("app_todos").upsert(rows, { onConflict: "app_slug,type,cle" });
  return { todos: rows.length };
}

/** Un passage complet de l'agent. Une source non branchée est sautée ; une source en erreur n'arrête pas les autres. */
export async function runAgent(db: SupabaseClient) {
  const { data } = await db.from("apps").select("slug, name, bundle_id, play_package").eq("active", true);
  const apps = (data ?? []) as App[];
  const out: Record<string, unknown> = {};
  for (const box of Object.keys(BOXES) as Box[]) out[`gmail:${box}`] = gmailReady(box) ? await ingestMail(db, box) : "non branchée";
  out.app_store = ascReady() ? await ingestReviews(db, "app_store", apps) : "non branchée";
  out.play = playReady() ? await ingestReviews(db, "play", apps) : "non branchée";
  if (falReady()) {
    out.fal = await classify(db, apps);
    out.reponses = await drafts(db, apps);
  } else out.fal = "non branchée";
  out.suivi = await todos(db);
  return out;
}
