import "server-only";
import { NextResponse } from "next/server";
import { blocksToText, isoWeekKey, todayParis } from "@/lib/assistant/context";
import { MEMBERS, isWho, type Who } from "@/lib/members";
import { supabaseServer } from "@/lib/supabase/server";

/** Qui parle, avec sa session (donc ses droits) et la clé Gemini. Renvoie une réponse d'erreur sinon. */
export async function assistantSession() {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  const { data: profile } = await db.from("profiles").select("id, short").eq("id", auth.user.id).maybeSingle();
  if (!profile || !isWho(profile.short)) return { error: NextResponse.json({ error: "Accès réservé aux membres du QG." }, { status: 403 }) };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: NextResponse.json({ error: "L'assistant n'est pas encore branché : il manque la variable GEMINI_API_KEY dans Vercel." }, { status: 503 }) };
  return { db, me: profile.short as Who, userId: auth.user.id, apiKey };
}

/** La page ouverte à l'écran, si elle existe : id, titre et texte. */
export async function openPage(db: Awaited<ReturnType<typeof supabaseServer>>, id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("pages").select("id, title, icon, content").eq("id", id).is("archived_at", null).maybeSingle();
  return data ? { id: data.id as string, title: (data.title as string) || "Sans titre", folder: data.icon === "folder", content: (data.content ?? []) as unknown[], text: blocksToText(data.content).slice(0, 30000) } : null;
}

/** Ce que l'assistant sait de Vik Studios et de la personne, commun à la bulle et à l'écriture dans une page. */
export function whoWeAre(me: Who): string {
  const today = todayParis();
  const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(today);
  return `Tu es l'assistant du QG de Vik Studios, l'outil privé de Maximilien (Max : contenu, recrutement, paie) et Adrien (OS, support, produit), les deux fondateurs. Vik Studios fait la promotion de ses apps (Sophia, Micabo, Unswipe, bientôt Runvik) avec des comptes TikTok de slideshows tenus par des posteurs.

Tu parles à ${MEMBERS[me].name}. Nous sommes le ${jour}, semaine ${isoWeekKey(today).slice(7)}.`;
}

export const WRITING_FORMAT = `Pour écrire dans une page, utilise ce format : titres avec « ## », listes avec « - », étapes numérotées « 1. », cases à cocher « - [ ] », gras avec **…**, tableaux avec des barres verticales (une ligne d'en-tête, puis une ligne par entrée). Pour un graphique, un bloc à part :
\`\`\`graphique
{"titre": "Revenus par app", "type": "barres", "donnees": [{"label": "Sophia", "valeur": 50268}, {"label": "Micabo", "valeur": 742}]}
\`\`\`
« type » vaut « barres » ou « courbe ». N'y mets que des chiffres tirés des données du QG ou donnés par la personne.`;
