/** Les lignes de l'agent « Support & avis », telles que le QG les lit. */
export type FeedbackItem = {
  id: string; app_slug: string | null; source: "mail" | "app_store" | "play"; box: string | null; auteur: string | null; titre: string | null; texte: string | null;
  recu_le: string; url: string | null; note: number | null; categorie: string | null; gravite: string | null; langue: string | null; pays: string | null;
  resume: string | null; citation: string | null; topic_id: string | null; classe_le: string | null; erreur: string | null;
};
export type FeedbackTopic = { id: string; app_slug: string; titre: string; categorie: string; gravite: string; nombre: number; premier_vu: string | null; dernier_vu: string | null; exemples: { citation: string; id: string }[] };
export type AppTodo = { id: string; app_slug: string; type: "urgent" | "proposition"; topic_id: string | null; titre: string; raison: string | null; nombre: number; statut: "a_faire" | "en_cours" | "fait" | "refuse"; item_id: string | null; updated_at: string };
export type ReplyDraft = { id: string; feedback_id: string; app_slug: string | null; canal: "gmail" | "app_store" | "play"; texte: string; statut: "brouillon" | "envoye" | "ignore"; auto_possible: boolean; updated_at: string };
export type MailDigestItem = {
  id: string; box: string; expediteur: string | null; expediteur_email: string | null; objet: string | null; recu_le: string; url: string | null;
  tri: "boite_max" | "ignore_posteur"; categorie: string | null; section: "a_lire" | "a_traiter" | "reste" | null; resume: string | null; avis: "up" | "down" | null; erreur: string | null;
};
export type MailPref = { id: string; liste: "interessant" | "pas_interessant"; genre: "expediteur" | "domaine" | "mot_cle" | "categorie"; valeur: string; statut: "valide" | "suggestion"; created_at: string };
export type AppFaq = { id: string; app_slug: string | null; question: string; reponse: string; langue: string; sort_order: number };
export type SyncStateRow = { source: string; last_run_at: string | null; last_ok_at: string | null; error: string | null; error_since: string | null; stats: Record<string, number> };

export const SOURCE_NAME: Record<string, string> = { "gmail:max": "Gmail · maximilien@", "gmail:support": "Gmail · support@", app_store: "App Store", play: "Google Play", fal: "Modèle (FAL)" };
export const CATEGORY_NAME: Record<string, string> = { probleme: "Problème", feature: "Demande", abonnement_remboursement: "Abonnement", question: "Question", eloge: "Éloge", autre: "Autre" };
export const FEED_SOURCE_NAME: Record<string, string> = { mail: "Mail", app_store: "App Store", play: "Play" };
export const MAIL_CATEGORY_NAME: Record<string, string> = { partenariat: "Partenariats", investisseur: "Investisseurs", presse: "Presse", apple_google: "Apple et Google", banque_facture: "Banque et factures", juridique: "Juridique", newsletter: "Newsletters", notification: "Notifications", autre: "Autres" };

/** « depuis 3 h », « depuis 2 j » : l'ancienneté d'une panne. */
export function since(iso: string, now = Date.now()): string {
  const min = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60000));
  return min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} j`;
}
