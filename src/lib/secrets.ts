/**
 * Règle absolue du QG : aucun mot de passe ni aucune clé API, nulle part.
 * Tout ce qui ressemble à un secret est refusé avant d'être enregistré.
 */
export const SECRET_MESSAGE = "Range ça dans le coffre, pas ici";

const PREFIXES = /(^|[^A-Za-z0-9])((sk|pk|rk)[-_][-_A-Za-z0-9]{12,}|(ghp_|gho_|github_pat_|xox[abp]-|whsec_|sbp_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{12,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/;
const LABELLED = /(mot de passe|password|passwd|mdp|pwd|api[ _-]?key|cl[ée] api|secret|token)\s*[:=]\s*\S{6,}/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un « mot » long et aléatoire : au moins 20 caractères, sans espace, qui mélange minuscules, majuscules et chiffres (ou une longue suite hexadécimale). */
function randomLooking(word: string): boolean {
  if (word.length < 20 || UUID.test(word) || /^https?:\/\//i.test(word) || word.includes("@")) return false;
  if (/^[0-9a-f]{32,}$/i.test(word)) return true;
  if (!/^[A-Za-z0-9_\-+/=.~!$%^&*]+$/.test(word)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /\d/].filter((r) => r.test(word)).length;
  return classes === 3;
}

export function looksLikeSecret(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  return PREFIXES.test(s) || LABELLED.test(s) || s.split(/[\s"'`,;()<>[\]{}]+/).some(randomLooking);
}

/** Cherche un secret dans une valeur quelconque (texte, objet, contenu de page…). */
export function containsSecret(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return looksLikeSecret(value);
  if (!value || typeof value !== "object" || depth > 12) return false;
  if (Array.isArray(value)) return value.some((v) => containsSecret(v, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(
    // Les identifiants techniques (id, liens internes, chemins de fichier) ne sont pas du texte saisi.
    ([k, v]) => !/^(id|.*_id|.*_by|path|pageId|url|href)$/.test(k) && containsSecret(v, depth + 1),
  );
}
