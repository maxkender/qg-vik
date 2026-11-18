import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCards } from "./login-cards";

export const metadata: Metadata = { title: "Connexion" };

export default function ConnexionPage() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <div className="flex w-full max-w-[560px] flex-col gap-7">
        <header>
          <p className="num text-[11px] tracking-[0.14em] text-faint uppercase">Vik Studios</p>
          <h1 className="mt-3 text-[clamp(2.75rem,10vw,4.25rem)] leading-[0.92] font-extrabold tracking-[-0.035em]">
            QG Vik<span className="text-now">.</span>
          </h1>
          <p className="mt-4 text-[17px] text-muted-foreground">Qui se connecte ?</p>
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
