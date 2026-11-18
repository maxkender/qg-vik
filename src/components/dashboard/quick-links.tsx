"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { linksStore } from "@/lib/data";
import { useRows } from "@/lib/store";

export const QUICK_GROUP = "Accès rapides";
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function Icon({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const h = host(url);
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted font-heading text-[16px] font-semibold text-muted-foreground">
      {failed || !h ? (
        title[0]?.toUpperCase()
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://icons.duckduckgo.com/ip3/${h}.ico`} alt="" width={22} height={22} loading="lazy" onError={() => setFailed(true)} className="size-[22px] rounded-[5px]" />
      )}
    </span>
  );
}

/** Les grands liens du quotidien, en grand en haut du dashboard. Ils se gèrent dans « Liens & guides » (groupe « Accès rapides »). */
export function QuickLinks() {
  const links = useRows(linksStore);
  const quick = useMemo(() => links.filter((l) => l.group === QUICK_GROUP).sort((a, b) => a.sort_order - b.sort_order), [links]);
  if (!quick.length) return null;
  return (
    <nav aria-label="Accès rapides" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {quick.map((l) => (
        <a
          key={l.id}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="glass group flex min-w-0 items-center gap-3 rounded-2xl p-4 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong"
        >
          <Icon url={l.url} title={l.title} />
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-1 font-heading text-[15.5px] leading-tight font-semibold tracking-[-0.01em]">
              <span className="line-clamp-2">{l.title}</span>
              <ArrowUpRight className="size-4 shrink-0 text-faint transition-colors duration-100 group-hover:text-now" aria-hidden />
            </span>
            <span className="num mt-0.5 block truncate text-[11.5px] text-muted-foreground">{host(l.url)}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}
