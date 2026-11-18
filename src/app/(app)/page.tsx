"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/connexion/actions";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import { supabaseBrowser } from "@/lib/supabase/client";

type Counts = { urgent: number; total: number };

// Étape 2 : accueil provisoire. La vraie vue « À faire » arrive à l'étape 3.
export default function Home() {
  const me = useMe();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let alive = true;
    supabaseBrowser()
      .from("items")
      .select("prio, owner")
      .is("parent_id", null)
      .eq("done", false)
      .in("owner", [me.short, "both"])
      .then(({ data }) => {
        if (!alive || !data) return;
        setCounts({ urgent: data.filter((i) => i.prio === "urgent").length, total: data.length });
      });
    return () => {
      alive = false;
    };
  }, [me.short]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <span className="font-heading text-xl font-extrabold tracking-[-0.02em]">
          QG Vik<span className="text-now">.</span>
        </span>
        <div className="flex items-center gap-2.5">
          <PersonAvatar who={me.short} />
          <span className="text-[13px] font-medium">{me.name}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </header>

      <section className="glass rounded-3xl p-8">
        <h1 className="text-[clamp(2rem,7vw,3rem)] leading-none font-extrabold">Salut {me.nick}</h1>
        <p className="mt-3 text-[15px] text-muted-foreground" aria-live="polite">
          {counts === null ? (
            "Je regarde tes tâches…"
          ) : (
            <>
              <b className="font-semibold text-now">
                {counts.urgent} urgent{counts.urgent > 1 ? "s" : ""}
              </b>{" "}
              pour toi, <span className="num">{counts.total}</span> en tout.
            </>
          )}
        </p>
        <p className="mt-6 border-t border-line pt-4 text-[12.5px] text-faint">
          La connexion marche. La vue « À faire » et les horizons arrivent à l&apos;étape 3.
        </p>
      </section>
    </main>
  );
}
