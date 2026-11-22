import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isBox, messageIdOf, sendReply } from "@/lib/agent/gmail";
import { ascPublish, playPublish } from "@/lib/agent/stores";

export type DraftRow = { id: string; feedback_id: string; app_slug: string | null; canal: "gmail" | "app_store" | "play"; texte: string; gmail_draft_id: string | null; statut: string };
export type FeedbackRow = { id: string; app_slug: string | null; source: string; box: string | null; thread_id: string | null; auteur_email: string | null; titre: string | null };

/**
 * Envoie un mail ou publie la réponse à un avis, puis le journalise (qui, quand, quel texte).
 * `db` est le client serveur du QG. Appelé sur un clic d'un membre, ou par l'envoi automatique s'il est activé.
 */
export async function deliver(db: SupabaseClient, draft: DraftRow, item: FeedbackRow, texte: string, qui: string, automatique = false) {
  const externalId = item.id.slice(item.id.indexOf(":") + 1);
  if (draft.canal === "gmail") {
    if (!isBox(item.box) || !item.auteur_email || !item.thread_id) throw new Error("Mail d'origine incomplet : réponds depuis Gmail.");
    await sendReply(item.box, { to: item.auteur_email, subject: item.titre ?? "", text: texte, threadId: item.thread_id, inReplyTo: await messageIdOf(item.box, externalId).catch(() => null) }, draft.gmail_draft_id);
  } else if (draft.canal === "app_store") {
    await ascPublish(externalId, texte);
  } else {
    const { data: app } = await db.from("apps").select("play_package, bundle_id").eq("slug", item.app_slug ?? "").maybeSingle();
    const pkg = app?.play_package ?? app?.bundle_id;
    if (!pkg) throw new Error("Identifiant Google Play de l'app inconnu.");
    await playPublish(pkg, externalId, texte);
  }
  const now = new Date().toISOString();
  await db.from("reply_log").insert({ draft_id: draft.id, feedback_id: item.id, canal: draft.canal, qui, automatique, texte, envoye_le: now });
  await db.from("reply_drafts").update({ statut: "envoye", texte, updated_at: now }).eq("id", draft.id);
}
