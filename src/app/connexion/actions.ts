"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { allowedEmails } from "@/lib/allowed";
import { isWho, MEMBERS, type Who } from "@/lib/members";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginResult = { ok: true; who: Who } | { ok: false; message: string };

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Envoie un lien magique à l'email de la personne choisie. L'email ne quitte jamais le serveur. */
export async function sendMagicLink(who: Who): Promise<LoginResult> {
  if (!isWho(who)) return { ok: false, message: "Choix inconnu." };

  const email = allowedEmails()[who];
  if (!email) {
    return {
      ok: false,
      message: `L'email de ${MEMBERS[who].nick} n'est pas encore configuré (variable ALLOWED_EMAILS).`,
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback`, shouldCreateUser: true },
  });

  if (error) {
    const tooMany = error.status === 429 || /rate limit|security purposes/i.test(error.message);
    return {
      ok: false,
      message: tooMany
        ? "Trop de liens demandés d'un coup. Attends une minute et réessaie."
        : "Le lien n'a pas pu être envoyé. Réessaie dans un instant.",
    };
  }
  return { ok: true, who };
}

/** Connexion Google : la base refuse tout compte hors des 2 emails autorisés. */
export async function signInWithGoogle(): Promise<void> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error || !data.url) redirect("/connexion?erreur=google");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/connexion");
}
