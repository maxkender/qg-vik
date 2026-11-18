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

export type AccountState = "nouveau" | "pret" | "inconnu";

/** Ce compte a-t-il déjà son mot de passe ? (pour savoir quoi demander) */
export async function accountState(who: Who): Promise<AccountState> {
  if (!isWho(who)) return "inconnu";
  const email = allowedEmails()[who];
  if (!email) return "inconnu";
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("qg_login_state", { p_email: email });
  return data === "nouveau" || data === "pret" ? data : "inconnu";
}

/**
 * Connexion en un clic (provisoire, sans mot de passe à taper) : active tant que
 * QG_AUTO_LOGIN_SECRET est défini côté serveur. Retirer la variable la désactive.
 */
export async function enter(who: Who): Promise<LoginResult | { ok: false; askPassword: AccountState }> {
  if (!isWho(who)) return { ok: false, message: "Choix inconnu." };
  const secret = process.env.QG_AUTO_LOGIN_SECRET;
  if (!secret) return { ok: false, askPassword: await accountState(who) };
  const email = allowedEmails()[who];
  if (!email) return { ok: false, message: NOT_READY };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: secret });
  if (error) return { ok: false, message: "La connexion n'a pas abouti. Réessaie dans un instant." };
  return { ok: true, who };
}

const NOT_READY = "Ce compte n'est pas encore prêt côté serveur (variable ALLOWED_EMAILS ou seed).";

/**
 * Connexion par mot de passe, sans email. À la première connexion, la personne
 * choisit son mot de passe ; il est haché dans la base, jamais stocké en clair.
 */
export async function signInWithPassword(who: Who, password: string): Promise<LoginResult> {
  if (!isWho(who)) return { ok: false, message: "Choix inconnu." };
  const email = allowedEmails()[who];
  if (!email) return { ok: false, message: NOT_READY };
  if (typeof password !== "string" || password.length === 0 || password.length > 200) {
    return { ok: false, message: "Mot de passe manquant." };
  }

  const supabase = await supabaseServer();
  const { data: state } = await supabase.rpc("qg_login_state", { p_email: email });
  if (state !== "nouveau" && state !== "pret") return { ok: false, message: NOT_READY };

  if (state === "nouveau") {
    if (password.length < 10) return { ok: false, message: "Il faut au moins 10 caractères." };
    const { data: claimed, error } = await supabase.rpc("qg_claim", { p_email: email, p_password: password });
    if (error) return { ok: false, message: "Le mot de passe n'a pas pu être enregistré. Réessaie." };
    // 'deja' : quelqu'un vient de le choisir à l'instant ; on tente simplement la connexion.
    if (claimed !== "ok" && claimed !== "deja") return { ok: false, message: NOT_READY };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const tooMany = error.status === 429;
    return {
      ok: false,
      message: tooMany ? "Trop d'essais d'un coup. Attends une minute." : "Mot de passe incorrect.",
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
