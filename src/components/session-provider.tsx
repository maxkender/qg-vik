"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { isWho, MEMBERS, type Who } from "@/lib/members";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Me = { id: string; short: Who; name: string; nick: string; color: string };

const MeContext = createContext<Me | null>(null);

/** « Moi » : la personne connectée. Disponible partout dans l'app. */
export function useMe(): Me {
  const me = use(MeContext);
  if (!me) throw new Error("useMe doit être utilisé dans <SessionProvider>.");
  return me;
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
      setMe({
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
