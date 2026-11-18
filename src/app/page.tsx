import { BaseStatus } from "@/components/base-status";

// Étape 1 : page d'attente. L'écran « Qui se connecte ? » arrive à l'étape 2.
export default function Home() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <section className="glass w-full max-w-md rounded-3xl p-8 sm:p-10">
        <p className="num text-[11px] tracking-[0.14em] text-faint uppercase">Vik Studios</p>
        <h1 className="mt-3 text-[clamp(2.75rem,9vw,4rem)] leading-[0.95] font-extrabold tracking-[-0.03em]">
          QG Vik<span className="text-now">.</span>
        </h1>
        <p className="mt-4 max-w-[34ch] text-[15px] text-muted-foreground">
          Le QG privé de Maximilien et Adrien. Les fondations sont en place, la connexion arrive.
        </p>
        <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
          <BaseStatus />
          <span className="num text-[11px] text-faint">étape 1 / 7</span>
        </div>
      </section>
    </main>
  );
}
