import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LoginCards } from "./login-cards";

export const metadata: Metadata = { title: "Connexion" };

export default function ConnexionPage() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <div className="flex w-full max-w-[560px] flex-col gap-7">
        <header>
          <Logo className="h-9 max-sm:h-7" />
          <p className="eyebrow mt-6 text-faint">Le QG · accès privé</p>
          <h1 className="mt-2 text-[clamp(2.5rem,9vw,3.75rem)] leading-[0.98] font-medium tracking-[-0.045em]">
            Qui se <span className="brand-text">connecte</span> ?
          </h1>
        </header>

        <Suspense fallback={<div className="glass h-[188px] rounded-3xl" aria-hidden />}>
          <LoginCards />
        </Suspense>

        <p className="text-[12.5px] text-faint">
          Accès privé, réservé à Maximilien et Adrien.
        </p>
      </div>
    </main>
  );
}
