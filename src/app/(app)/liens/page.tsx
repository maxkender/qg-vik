"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { Panel } from "@/components/dashboard/charts";
import { linksStore } from "@/lib/data";
import { newId, useRows } from "@/lib/store";
import type { LinkRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Icône du site, avec l'initiale en secours si elle ne charge pas. */
function Favicon({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const h = host(url);
  return (
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-[13px] font-bold text-muted-foreground">
      {failed || !h ? (
        (title[0] ?? "?").toUpperCase()
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://icons.duckduckgo.com/ip3/${h}.ico`} alt="" width={18} height={18} loading="lazy" onError={() => setFailed(true)} className="size-[18px] rounded-[4px]" />
      )}
    </span>
  );
}

const field = "h-9 min-w-0 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";

export default function LinksPage() {
  const rows = useRows(linksStore);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, LinkRow[]>();
    [...rows].sort((a, b) => a.sort_order - b.sort_order).forEach((l) => {
      const g = l.group || "Autres";
      map.set(g, [...(map.get(g) ?? []), l]);
    });
    return [...map.entries()];
  }, [rows]);

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim();
    let url = String(f.get("url") ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!title || !host(url)) return setError("Il faut un nom et une adresse valide.");
    setError(null);
    void linksStore.insert({
      id: newId(),
      group: String(f.get("group") ?? "").trim() || "Autres",
      title,
      url,
      note: String(f.get("note") ?? "").trim() || null,
      sort_order: Date.now(),
      created_at: new Date().toISOString(),
    });
    e.currentTarget.reset();
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Liens & guides" />
      <div className="flex flex-col gap-3 px-4 pb-16 md:px-6">
        <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {groups.map(([group, links]) => (
            <Panel key={group} title={group}>
              <ul className="-mx-2 -my-1">
                {links.map((l) => (
                  <li key={l.id} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-100 hover:bg-accent/60">
                    <Favicon url={l.url} title={l.title} />
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 outline-none">
                      <span className="flex items-center gap-1 font-medium">
                        <span className="truncate">{l.title}</span>
                        <ArrowUpRight className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100" aria-hidden />
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">{l.note || host(l.url)}</span>
                    </a>
                    {confirm === l.id ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[12px]">
                        <button type="button" autoFocus onClick={() => void linksStore.remove(l.id)} className="rounded-md bg-bad px-2 py-0.5 font-semibold text-white">Supprimer</button>
                        <button type="button" onClick={() => setConfirm(null)} className="rounded-md border border-line-strong px-2 py-0.5 text-muted-foreground">Non</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Supprimer le lien ${l.title}`}
                        onClick={() => setConfirm(l.id)}
                        className="grid size-7 shrink-0 place-items-center rounded-md text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-bad focus-visible:opacity-100 max-md:opacity-100"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
        {linksStore.loaded && rows.length === 0 && <p className="text-muted-foreground">Aucun lien pour l&apos;instant. Ajoute le premier ci-dessous.</p>}

        <Panel title="Ajouter un lien">
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <input name="title" required placeholder="Nom" aria-label="Nom" className={cn(field, "flex-[1_1_160px]")} />
            <input name="url" required placeholder="https://…" aria-label="Adresse" className={cn(field, "flex-[2_1_240px]")} />
            <input name="note" placeholder="Note (facultatif)" aria-label="Note" className={cn(field, "flex-[1_1_160px]")} />
            <input name="group" list="link-groups" placeholder="Groupe" aria-label="Groupe" className={cn(field, "flex-[1_1_160px]")} />
            <datalist id="link-groups">
              {groups.map(([g]) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <button type="submit" className="h-9 rounded-lg bg-foreground px-4 text-[13.5px] font-semibold text-background">Ajouter</button>
          </form>
          {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
        </Panel>
      </div>
    </div>
  );
}
