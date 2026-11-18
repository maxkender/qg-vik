"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEMBERS, type Who } from "@/lib/members";
import { cn } from "@/lib/utils";
import { enter, signInWithGoogle, signInWithPassword, type AccountState } from "./actions";

const ERRORS: Record<string, string> = {
  refuse: "Ce compte n'est pas autorisé. Seuls Maximilien et Adrien peuvent entrer.",
  lien: "Ce lien a expiré ou a déjà servi.",
  google: "La connexion Google n'a pas abouti.",
  config: "Le QG n'est pas encore relié à sa base (variables d'environnement manquantes).",
};

const HOVER: Record<Who, string> = {
  max: "hover:border-max/60 focus-visible:border-max/60",
  adrien: "hover:border-adrien/60 focus-visible:border-adrien/60",
};

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";
const MIN_LENGTH = 10;

export function LoginCards() {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Who | null>(null);
  const [state, setState] = useState<AccountState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlError = ERRORS[params.get("erreur") ?? ""] ?? null;

  function pick(who: Who) {
    setPicked(who);
    setError(null);
    startTransition(async () => {
      const res = await enter(who);
      if (res.ok) {
        // Retour à la page demandée (interne uniquement) après une reconnexion.
        const back = params.get("retour");
        window.location.replace(back && /^\/[a-z0-9\-/?=&]*$/i.test(back) && !back.startsWith("//") ? back : "/");
        return;
      }
      if ("askPassword" in res && res.askPassword !== "inconnu") {
        setState(res.askPassword);
        return;
      }
      setPicked(null);
      setError("message" in res ? res.message : `Le compte de ${MEMBERS[who].nick} n'est pas encore prêt côté serveur.`);
    });
  }

  if (picked && state) {
    return (
      <PasswordForm
        who={picked}
        isNew={state === "nouveau"}
        onBack={() => {
          setPicked(null);
          setState(null);
        }}
      />
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
                  <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-label="Chargement" />
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

function PasswordForm({ who, isNew, onBack }: { who: Who; isNew: boolean; onBack: () => void }) {
  const m = MEMBERS[who];
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (isNew && password.length < MIN_LENGTH) return setError(`Il faut au moins ${MIN_LENGTH} caractères.`);
    if (isNew && password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setError(null);
    startTransition(async () => {
      const res = await signInWithPassword(who, password);
      if (res.ok) {
        // Rechargement complet voulu : le mot de passe tapé ne reste nulle part en mémoire.
        window.location.replace("/");
      } else setError(res.message);
    });
  }

  return (
    <form onSubmit={submit} className="glass flex flex-col gap-5 rounded-3xl p-6 sm:p-7">
      <div className="flex items-center gap-4">
        <PersonAvatar who={who} size="lg" />
        <div className="min-w-0">
          <h2 className="text-[26px] leading-none font-extrabold">{m.name}</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {isNew ? "Première connexion : choisis ton mot de passe." : "Content de te revoir."}
          </p>
        </div>
      </div>

      {/* Aide les gestionnaires de mots de passe à ranger un mot de passe par personne. */}
      <input type="text" name="username" autoComplete="username" value={`${m.name} (QG Vik)`} readOnly hidden />

      <div className="flex flex-col gap-2">
        <Label htmlFor="qg-password">{isNew ? "Nouveau mot de passe" : "Mot de passe"}</Label>
        <div className="relative">
          <Input
            id="qg-password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete={isNew ? "new-password" : "current-password"}
            autoFocus
            required
            minLength={isNew ? MIN_LENGTH : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-100 hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {isNew && (
          <p className="text-[12.5px] text-faint">
            {MIN_LENGTH} caractères minimum. Tu le choisis une seule fois, garde-le dans ton gestionnaire.
          </p>
        )}
      </div>

      {isNew && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="qg-password-2">Encore une fois</Label>
          <Input
            id="qg-password-2"
            name="password-confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-[13.5px] text-bad">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors duration-100 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Ce n&apos;est pas moi
        </button>
        <Button type="submit" size="lg" disabled={pending} className="h-11 min-w-32 px-5">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-label="Connexion" /> : isNew ? "Créer et entrer" : "Entrer"}
        </Button>
      </div>
    </form>
  );
}
