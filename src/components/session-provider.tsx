"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { isWho, MEMBERS, type Who } from "@/lib/members";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Me = {
  id: string; short: Who; name: string; nick: string; color: string;
  /** Moment de la dernière vraie connexion (millisecondes). Sert à exiger une reconnexion sur les pages sensibles. */
  signedInAt: number;
};

/** Lit dans le jeton de session l'heure de la dernière connexion. */
function lastSignIn(accessToken: string | undefined, fallback: string | undefined): number {
  try {
    const payload = JSON.parse(atob(accessToken!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { amr?: { timestamp: number }[] };
    const t = Math.max(...(payload.amr ?? []).map((a) => Number(a.timestamp)));
    if (Number.isFinite(t) && t > 0) return t * 1000;
  } catch {}
  return fallback ? new Date(fallback).getTime() : 0;
}

const MeContext = createContext<Me | null>(null);

/** « Moi » : la personne connectée. Disponible partout dans l'app. */
export function useMe(): Me {
  const me = use(MeContext);
  if (!me) throw new Error("useMe doit être utilisé dans <SessionProvider>.");
  return me;
}

/** Déconnexion : on vide la session puis on recharge tout, pour ne rien garder en mémoire. */
export async function logout(retour?: string) {
  await supabaseBrowser().auth.signOut();
  window.location.replace(retour ? `/connexion?retour=${encodeURIComponent(retour)}` : "/connexion");
}

/**
 * Charge la session et le profil dans le navigateur.
 * Pas de profil = pas membre : on déconnecte et on renvoie à l'accueil.
 */
export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let alive = true;

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!alive) return;
      if (!auth.user) {
        window.location.replace("/connexion");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, short, color")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!alive) return;
      if (!profile || !isWho(profile.short)) {
        await supabase.auth.signOut();
        window.location.replace("/connexion?erreur=refuse");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!alive) return;
      setMe({
        signedInAt: lastSignIn(sess.session?.access_token, auth.user.last_sign_in_at),
        id: profile.id,
        short: profile.short,
        name: profile.name,
        nick: MEMBERS[profile.short].nick,
        color: profile.color,
      });
    }
    void load();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.replace("/connexion");
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!me) return <>{fallback}</>;
  return <MeContext value={me}>{children}</MeContext>;
}
