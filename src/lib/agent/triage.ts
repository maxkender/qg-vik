/**
 * Le tri, avant tout le reste. Un mail de posteur n'est pas pour nous : c'est l'OS qui y répond.
 * On le reconnaît à ses mots (posts, TikTok, dashboard, Ruul, Upwork, paie, warm-up) ou à son expéditeur déjà connu comme posteur.
 */
const POSTEUR = /\b(tik\s?tok|ruul|upwork|warm[\s-]?up|dashboard|posteurs?|posters?|posting|posts?|slideshows?|paie|payout|payroll|hiring manager)\b/i;

export function isPosteur(mail: { fromEmail: string; subject: string; text: string }, knownPosteurs: Set<string>): boolean {
  return knownPosteurs.has(mail.fromEmail) || POSTEUR.test(`${mail.subject}\n${mail.text.slice(0, 3000)}`);
}

export type Pref = { liste: "interessant" | "pas_interessant"; genre: "expediteur" | "domaine" | "mot_cle" | "categorie"; valeur: string; statut: string };
/** Ce que disent les préférences validées de Max pour ce mail. */
export function prefOf(mail: { email: string; subject: string; resume: string | null; categorie: string | null }, prefs: Pref[]): "interessant" | "pas_interessant" | null {
  const hit = (p: Pref) => {
    const v = p.valeur.toLowerCase();
    if (p.genre === "expediteur") return mail.email === v;
    if (p.genre === "domaine") return mail.email.endsWith(`@${v.replace(/^@/, "")}`);
    if (p.genre === "categorie") return mail.categorie === v;
    return `${mail.subject} ${mail.resume ?? ""}`.toLowerCase().includes(v);
  };
  const valid = prefs.filter((p) => p.statut === "valide" && hit(p));
  // « Pas intéressant » l'emporte : c'est un refus explicite.
  return valid.some((p) => p.liste === "pas_interessant") ? "pas_interessant" : valid.some((p) => p.liste === "interessant") ? "interessant" : null;
}

export const A_LIRE = ["partenariat", "investisseur", "presse", "apple_google", "banque_facture"];
export function sectionOf(categorie: string, attendReponse: boolean, pref: "interessant" | "pas_interessant" | null): "a_lire" | "a_traiter" | "reste" {
  if (pref === "pas_interessant") return "reste";
  if (attendReponse) return "a_traiter";
  return A_LIRE.includes(categorie) || pref === "interessant" ? "a_lire" : "reste";
}
