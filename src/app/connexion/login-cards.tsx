"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle, MailCheck } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { MEMBERS, type Who } from "@/lib/members";
import { cn } from "@/lib/utils";
import { sendMagicLink, signInWithGoogle } from "./actions";

const ERRORS: Record<string, string> = {
  refuse: "Cet email n'est pas autorisé. Seuls Maximilien et Adrien peuvent entrer.",
  lien: "Ce lien a expiré ou a déjà servi. Redemande-en un.",
  google: "La connexion Google n'a pas abouti. Essaie le lien par email.",
  config: "Le QG n'est pas encore relié à sa base (variables d'environnement manquantes).",
};

const HOVER: Record<Who, string> = {
  max: "hover:border-max/60 focus-visible:border-max/60",
  adrien: "hover:border-adrien/60 focus-visible:border-adrien/60",
};

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

export function LoginCards() {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Who | null>(null);
  const [sentTo, setSentTo] = useState<Who | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlError = ERRORS[params.get("erreur") ?? ""] ?? null;

  function pick(who: Who) {
    setPicked(who);
    setError(null);
    startTransition(async () => {
      const res = await sendMagicLink(who);
      if (res.ok) setSentTo(res.who);
      else setError(res.message);
    });
  }

  if (sentTo) {
    const m = MEMBERS[sentTo];
    return (
      <div className="glass rounded-3xl p-7" role="status">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-good-soft text-good">
            <MailCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-extrabold">Lien envoyé, {m.nick}.</h2>
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              Ouvre l&apos;email « QG Vik » sur cet appareil et clique sur le lien : tu arrives directement dans le QG.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setPicked(null);
          }}
          className="mt-6 text-[13px] text-muted-foreground underline underline-offset-4 transition-colors duration-100 hover:text-foreground"
        >
          Ce n&apos;est pas moi, revenir au choix
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(MEMBERS) as Who[]).map((who) => {
          const m = MEMBERS[who];
          const busy = pending && picked === who;
          return (
            <button
              key={who}
              type="button"
              disabled={pending}
              onClick={() => pick(who)}
              className={cn(
                "glass group flex flex-col gap-5 rounded-3xl p-6 text-left outline-none",
                "transition-[border-color,transform,opacity] duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
                "disabled:pointer-events-none",
                pending && !busy && "opacity-50",
                HOVER[who],
              )}
            >
              <div className="flex items-center justify-between">
                <PersonAvatar who={who} size="lg" />
                {busy ? (
                  <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-label="Envoi du lien" />
                ) : (
                  <ArrowRight
                    className="size-5 -translate-x-1 text-faint opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                    aria-hidden
                  />
                )}
              </div>
              <div>
                <div className="font-heading text-[26px] leading-none font-extrabold tracking-[-0.02em]">{m.name}</div>
                <div className="mt-2 text-[13px] text-muted-foreground">{m.role}</div>
              </div>
            </button>
          );
        })}
      </div>

      {(error ?? urlError) && (
        <p role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-[13.5px] text-bad">
          {error ?? urlError}
        </p>
      )}

      {GOOGLE_ENABLED && (
        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="w-full rounded-2xl border border-line px-4 py-3 text-[13.5px] font-medium text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground"
          >
            Continuer avec Google
          </button>
        </form>
      )}
    </div>
  );
}
