/**
 * Les 2 membres du QG. Leurs emails ne sont jamais dans le code :
 * ils viennent de la variable d'environnement ALLOWED_EMAILS, lue côté serveur.
 *
 * Formats acceptés :
 *   ALLOWED_EMAILS="max:max@exemple.com,adrien:adrien@exemple.com"
 *   ALLOWED_EMAILS="max@exemple.com,adrien@exemple.com"   (1er = Max, 2e = Adrien)
 */
export type Who = "max" | "adrien";
export type Owner = Who | "both";

export const MEMBERS: Record<Who, { short: Who; name: string; nick: string; initial: string; color: string; role: string }> = {
  max: { short: "max", name: "Maximilien", nick: "Max", initial: "M", color: "#38C6B0", role: "Contenu, recrutement, paie" },
  adrien: { short: "adrien", name: "Adrien", nick: "Adrien", initial: "A", color: "#E68AD2", role: "OS, support, produit" },
};

export const isWho = (v: unknown): v is Who => v === "max" || v === "adrien";

export function parseAllowedEmails(raw: string | undefined): Partial<Record<Who, string>> {
  const out: Partial<Record<Who, string>> = {};
  const parts = (raw ?? "")
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const order: Who[] = ["max", "adrien"];
  parts.forEach((part, i) => {
    const m = part.match(/^(max|adrien)[:=](.+)$/i);
    const who = m ? (m[1].toLowerCase() as Who) : order[i];
    const email = (m ? m[2] : part).trim().toLowerCase();
    if (who && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out[who] = email;
  });
  return out;
}
