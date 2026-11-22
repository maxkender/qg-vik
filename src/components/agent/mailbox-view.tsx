"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { SourceNotice } from "@/components/agent/support-tab";
import { Panel } from "@/components/dashboard/charts";
import { MAIL_CATEGORY_NAME, type MailDigestItem, type MailPref } from "@/lib/agent/types";
import { mailDigestStore, mailPrefsStore } from "@/lib/data";
import { newId, useRows } from "@/lib/store";
import { cn } from "@/lib/utils";

const GENRE: Record<MailPref["genre"], string> = { expediteur: "Expéditeur", domaine: "Domaine", mot_cle: "Mot-clé", categorie: "Catégorie" };
const field = "h-9 min-w-0 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";
const hour = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function MailRow({ m, prefs }: { m: MailDigestItem; prefs: MailPref[] }) {
  // Un pouce propose une règle sur l'expéditeur ; elle ne compte qu'une fois validée dans les préférences.
  function rate(avis: "up" | "down") {
    void mailDigestStore.update(m.id, { avis: m.avis === avis ? null : avis });
    const liste = avis === "up" ? "interessant" : "pas_interessant";
    if (m.avis === avis || !m.expediteur_email || prefs.some((p) => p.genre === "expediteur" && p.valeur === m.expediteur_email && p.liste === liste)) return;
    void mailPrefsStore.insert({ id: newId(), liste, genre: "expediteur", valeur: m.expediteur_email, statut: "suggestion", created_at: new Date().toISOString() });
  }
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="num w-11 shrink-0 pt-0.5 text-[12px] text-muted-foreground">{hour(m.recu_le)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-muted-foreground">{m.expediteur} · {m.objet}</span>
        <span className="block text-[13.5px]">{m.resume}</span>
      </span>
      <button type="button" aria-label="Intéressant" aria-pressed={m.avis === "up"} onClick={() => rate("up")} className={cn("grid size-7 shrink-0 place-items-center rounded-md transition-colors duration-100", m.avis === "up" ? "bg-good-soft text-good" : "text-faint hover:text-foreground")}><ThumbsUp className="size-3.5" aria-hidden /></button>
      <button type="button" aria-label="Pas intéressant" aria-pressed={m.avis === "down"} onClick={() => rate("down")} className={cn("grid size-7 shrink-0 place-items-center rounded-md transition-colors duration-100", m.avis === "down" ? "bg-bad-soft text-bad" : "text-faint hover:text-foreground")}><ThumbsDown className="size-3.5" aria-hidden /></button>
      {m.url && <a href={m.url} target="_blank" rel="noreferrer" aria-label="Ouvrir dans Gmail" className="grid size-7 shrink-0 place-items-center rounded-md text-faint hover:text-foreground"><ExternalLink className="size-3.5" aria-hidden /></a>}
    </li>
  );
}

function Prefs({ prefs }: { prefs: MailPref[] }) {
  const suggestions = prefs.filter((p) => p.statut === "suggestion");
  function add(liste: MailPref["liste"]) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const valeur = String(f.get("valeur") ?? "").trim().toLowerCase();
      const genre = String(f.get("genre")) as MailPref["genre"];
      if (!valeur || prefs.some((p) => p.liste === liste && p.genre === genre && p.valeur === valeur)) return;
      void mailPrefsStore.insert({ id: newId(), liste, genre, valeur, statut: "valide", created_at: new Date().toISOString() });
      e.currentTarget.reset();
    };
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {suggestions.length > 0 && (
        <Panel title="Suggestions à valider">
          <ul className="divide-y divide-line">
            {suggestions.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px]"><span className="num">{p.valeur}</span> <span className="text-muted-foreground">→ {p.liste === "interessant" ? "intéressant" : "pas intéressant"}</span></span>
                <button type="button" aria-label="Valider" onClick={() => void mailPrefsStore.update(p.id, { statut: "valide" })} className="grid size-7 place-items-center rounded-md border border-line hover:border-line-strong"><Check className="size-3.5" aria-hidden /></button>
                <button type="button" aria-label="Refuser" onClick={() => void mailPrefsStore.remove(p.id)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"><X className="size-3.5" aria-hidden /></button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        {(["interessant", "pas_interessant"] as const).map((liste) => (
          <Panel key={liste} title={liste === "interessant" ? "Intéressant" : "Pas intéressant"}>
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {prefs.filter((p) => p.liste === liste && p.statut === "valide").map((p) => (
                <li key={p.id} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted pr-1 pl-2 text-[12.5px]">
                  <span className="text-muted-foreground">{GENRE[p.genre]}</span> <span className="num">{p.genre === "categorie" ? (MAIL_CATEGORY_NAME[p.valeur] ?? p.valeur) : p.valeur}</span>
                  <button type="button" aria-label={`Retirer ${p.valeur}`} onClick={() => void mailPrefsStore.remove(p.id)} className="grid size-5 place-items-center rounded text-faint hover:text-foreground"><X className="size-3" aria-hidden /></button>
                </li>
              ))}
            </ul>
            <form onSubmit={add(liste)} className="flex gap-2">
              <select name="genre" aria-label="Type" className={cn(field, "px-2")}>{Object.entries(GENRE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="valeur" placeholder="nom@exemple.com, exemple.com, un mot…" aria-label="Valeur" className={cn(field, "flex-1")} />
            </form>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export function MailboxView() {
  const router = useRouter();
  const tab = useSearchParams().get("onglet") === "preferences";
  const [from] = useState(() => new Date(Date.now() - 864e5).toISOString());
  const mails = useRows(mailDigestStore);
  const prefs = useRows(mailPrefsStore);
  const day = mails.filter((m) => m.recu_le >= from && m.tri === "boite_max").sort((a, b) => b.recu_le.localeCompare(a.recu_le));
  const posteurs = mails.filter((m) => m.recu_le >= from && m.tri === "ignore_posteur").length;
  const pick = (s: MailDigestItem["section"]) => day.filter((m) => m.section === s);
  const rest = pick("reste");
  const counts = Object.entries(rest.reduce<Record<string, number>>((a, m) => ((a[m.categorie ?? "autre"] = (a[m.categorie ?? "autre"] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const waiting = day.filter((m) => !m.section && !m.erreur).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Ma boîte" eyebrow="Les dernières 24 heures">
        <div className="flex items-center rounded-[10px] border border-line bg-glass p-[3px]">
          {[{ key: false, label: "Récap" }, { key: true, label: "Préférences" }].map((t) => (
            <button key={t.label} type="button" aria-pressed={tab === t.key} onClick={() => router.replace(t.key ? "/boite?onglet=preferences" : "/boite")} className={cn("inline-flex h-[26px] items-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] font-medium transition-colors duration-100", tab === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {t.label}{t.key && prefs.some((p) => p.statut === "suggestion") && <span className="size-1.5 rounded-full bg-now" aria-label="suggestions à valider" />}
            </button>
          ))}
        </div>
      </ViewHeader>
      <div className="flex min-w-0 flex-col gap-3 px-4 pb-24 md:px-6 [&>*]:min-w-0">
        <SourceNotice sources={["gmail:max", "fal"]} />
        {tab ? <Prefs prefs={prefs} /> : (
          <>
            {([["a_lire", "À lire"], ["a_traiter", "À traiter"]] as const).map(([key, title]) => (
              <Panel key={key} title={<>{title} <span className="num ml-1 text-[13px] font-normal text-muted-foreground">{pick(key).length}</span></>}>
                {pick(key).length ? <ul className="divide-y divide-line">{pick(key).map((m) => <MailRow key={m.id} m={m} prefs={prefs} />)}</ul> : <p className="text-[13px] text-muted-foreground">Rien.</p>}
              </Panel>
            ))}
            <Panel title="Le reste">
              <p className="text-[13.5px]">
                {counts.length ? counts.map(([c, n]) => <span key={c} className="mr-4 inline-block"><span className="num font-medium">{n}</span> <span className="text-muted-foreground">{(MAIL_CATEGORY_NAME[c] ?? c).toLowerCase()}</span></span>) : <span className="text-muted-foreground">Rien.</span>}
                {posteurs > 0 && <span className="mr-4 inline-block"><span className="num font-medium">{posteurs}</span> <span className="text-muted-foreground">posteurs (laissés à l&apos;OS)</span></span>}
              </p>
              {waiting > 0 && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{waiting} mail{waiting > 1 ? "s" : ""} en attente de classement.</p>}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
