import "server-only";
import { z } from "zod";
import { llmJson } from "@/lib/agent/fal";

export const CATEGORIES = ["probleme", "feature", "abonnement_remboursement", "question", "eloge", "autre"] as const;
const text = (max: number) => z.string().trim().max(max * 2).transform((s) => s.slice(0, max));
const nullable = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional().transform((v) => v ?? null);

export const Feedback = z.object({
  /** Faux si ce n'est pas un utilisateur d'une app (notification, pub, partenaire…). */
  est_utilisateur: z.boolean(),
  app: nullable(z.string()),
  categorie: z.enum(CATEGORIES),
  gravite: z.enum(["urgent", "normal", "faible"]),
  touche: nullable(z.enum(["paiement", "connexion"])),
  demande: nullable(z.enum(["annuler", "restaurer", "remboursement", "juridique", "autre"])),
  agressif: z.boolean().optional().transform((v) => v ?? false),
  langue: text(8),
  pays: nullable(text(40)),
  resume: text(240),
  citation: text(200),
  sujet: text(80),
  confiance: z.number().min(0).max(1),
});
export type FeedbackClass = z.infer<typeof Feedback>;

export const MAIL_CATEGORIES = ["partenariat", "investisseur", "presse", "apple_google", "banque_facture", "juridique", "newsletter", "notification", "autre"] as const;
export const MailClass = z.object({
  utilisateur_app: z.boolean(),
  categorie: z.enum(MAIL_CATEGORIES),
  attend_reponse: z.boolean(),
  resume: text(200),
});
export const Draft = z.object({ texte: text(2500), sur: z.number().min(0).max(1) });

const APPS = (apps: { slug: string; name: string }[]) => apps.map((a) => `${a.slug} (${a.name})`).join(", ");

export function classifyFeedback(input: { source: string; app: string | null; titre: string | null; texte: string; note: number | null }, apps: { slug: string; name: string }[], topics: string[]) {
  return llmJson(
    Feedback,
    `Tu classes les retours d'utilisateurs des apps mobiles de Vik Studios : ${APPS(apps)}.
Champs : est_utilisateur (false si ce n'est pas un utilisateur d'une app), app (un des slugs, ou null), categorie (${CATEGORIES.join(", ")}), gravite (urgent, normal, faible),
touche ("paiement" ou "connexion" si le retour touche à l'un des deux, sinon null), demande ("annuler", "restaurer", "remboursement", "juridique", "autre" ou null),
agressif (true si le ton est agressif ou menaçant), langue (code ISO du message), pays (si on le devine, sinon null), resume (une phrase en français),
citation (un court extrait du message, mot pour mot), sujet (titre court en français du problème ou de la demande, sans le nom de l'app), confiance (0 à 1).
Sujets déjà connus : ${topics.length ? topics.map((t) => `« ${t} »`).join(", ") : "aucun"}. Si le retour parle du même sujet, reprends exactement ce titre.
Une traduction mauvaise, un manque de contenu ou un onboarding confus sont des « feature » (améliorations demandées).`,
    `Source : ${input.source}${input.app ? `\nApp : ${input.app}` : ""}${input.note ? `\nNote : ${input.note}/5` : ""}${input.titre ? `\nTitre : ${input.titre}` : ""}\nMessage :\n${input.texte.slice(0, 4000)}`,
  );
}

export function classifyMail(mail: { from: string; subject: string; text: string }, apps: { slug: string; name: string }[]) {
  return llmJson(
    MailClass,
    `Tu tries la boîte mail de Max, cofondateur de Vik Studios (apps mobiles : ${APPS(apps)}).
Champs : utilisateur_app (true si c'est un utilisateur d'une de ces apps qui écrit au support), categorie (${MAIL_CATEGORIES.join(", ")}),
attend_reponse (true seulement si une personne attend une réponse de Max), resume (une phrase en français, factuelle).
"apple_google" = App Store, App Store Connect, Google Play, Google Cloud. "banque_facture" = banque, factures, paiements, comptable.`,
    `De : ${mail.from}\nObjet : ${mail.subject}\n\n${mail.text.slice(0, 3000)}`,
  );
}

export function draftReply(input: { app: string; canal: "gmail" | "app_store" | "play"; langue: string; titre: string | null; texte: string; note: number | null }, faq: { question: string; reponse: string }[]) {
  return llmJson(
    Draft,
    `Tu écris la réponse du support de l'app ${input.app} (Vik Studios) à un utilisateur. Réponds dans la langue du message (${input.langue}).
Appuie-toi uniquement sur cette FAQ ; si elle ne répond pas, dis que l'équipe regarde et demande les détails utiles. Ne promets jamais un remboursement : il passe par Apple ou Google.
${input.canal === "gmail" ? "Format : un mail court, poli, signé « L'équipe " + input.app + " »." : "Format : une réponse publique à un avis, 3 phrases au plus, sans donnée personnelle."}
Champs : texte (la réponse), sur (0 à 1 : ta certitude que cette réponse est juste et suffisante).
FAQ :\n${faq.map((f) => `Q : ${f.question}\nR : ${f.reponse}`).join("\n")}`,
    `${input.note ? `Note : ${input.note}/5\n` : ""}${input.titre ? `Objet : ${input.titre}\n` : ""}Message :\n${input.texte.slice(0, 3000)}`,
  );
}

/** L'envoi automatique n'est jamais possible pour un remboursement, du juridique, un ton agressif ou un modèle peu sûr. */
export function autoPossible(c: { categorie: string | null; demande: string | null; agressif: boolean; confiance: number }, sur: number): "question" | "abonnement" | null {
  if (c.agressif || c.confiance < 0.8 || sur < 0.8 || c.demande === "remboursement" || c.demande === "juridique") return null;
  if (c.categorie === "question") return "question";
  return c.categorie === "abonnement_remboursement" && (c.demande === "annuler" || c.demande === "restaurer") ? "abonnement" : null;
}
