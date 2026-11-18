"use client";

import { useEffect, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SOURCE_LABEL, type Dash, type SourceInfo } from "@/components/dashboard/use-dash";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortDate } from "@/lib/format";
import type { SourceName } from "@/lib/types";
import { cn } from "@/lib/utils";

/** « il y a 12 min », « il y a 3 h », « hier à 06:02 » */
export function since(iso: string, now: number): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
const hm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Petite infobulle « Source : Qonto, mis à jour à 06:02 » à côté d'un chiffre. */
export function Src({ s, seedDate, className }: { s: SourceInfo | SourceInfo[]; seedDate: string | null; className?: string }) {
  const list = Array.isArray(s) ? s : [s];
  const line = (x: SourceInfo) =>
    x.live && x.lastOk
      ? `${x.name}, mis à jour ${new Date(x.lastOk.started_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à ${hm(x.lastOk.started_at)}`
      : x.live
        ? `${x.name}`
        : `${x.name} pas encore branché${seedDate && x.name !== "Meta Ads" ? ` · chiffres du ${shortDate(seedDate)}` : ""}`;
  return (
    <Tooltip>
      <TooltipTrigger className={cn("inline-grid size-4 shrink-0 place-items-center rounded-full text-faint outline-none hover:text-foreground focus-visible:text-foreground", className)} aria-label={`Source : ${list.map(line).join(" ; ")}`}>
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-[12px]">
        {list.map((x) => (
          <p key={x.name}>Source : {line(x)}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

const ORDER: SourceName[] = ["revenuecat", "qonto", "meta", "os"];
type Status = Record<SourceName, boolean> & { base: boolean };

/** État de chaque source (« Mis à jour il y a X min », rouge si la dernière synchro a échoué) et bouton Rafraîchir. */
export function SyncBar({ dash }: { dash: Dash }) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<SourceName | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function refresh() {
    try {
      const status = (await (await fetch("/api/sync")).json()) as Status;
      if (!status.base) {
        toast.error("Synchro impossible", { description: "Il manque SUPABASE_SECRET_KEY dans les variables Vercel.", duration: 9000 });
        return;
      }
      const todo = ORDER.filter((s) => status[s]);
      if (!todo.length) {
        toast.error("Aucune source branchée pour l'instant", { description: "Ajoute les clés dans Vercel (voir le README).", duration: 9000 });
        return;
      }
      for (const s of todo) {
        setBusy(s);
        const res = (await (await fetch(`/api/sync?source=${s}`, { method: "POST" })).json()) as { ok: boolean; rows: number; error: string | null };
        if (res.ok) toast(`${SOURCE_LABEL[s]} à jour`, { description: `${res.rows.toLocaleString("fr-FR")} lignes` });
        else toast.error(`${SOURCE_LABEL[s]} : échec`, { description: res.error ?? undefined, duration: 12000 });
      }
    } catch {
      toast.error("Synchro impossible pour l'instant.");
    }
    setBusy(null);
    setNow(Date.now());
  }

  return (
    <div className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-2.5">
      {ORDER.map((key) => {
        const s = dash.sources[key];
        const failed = s.last && s.last.finished_at && s.last.ok === false;
        const running = busy === key || (s.last && !s.last.finished_at && now - new Date(s.last.started_at).getTime() < 6 * 60_000);
        const tone = failed ? "bg-bad" : s.lastOk ? "bg-good" : "bg-faint";
        return (
          <div key={key} role="status" className="flex min-w-0 items-center gap-2 text-[12.5px]" title={failed ? (s.last?.error ?? undefined) : undefined}>
            <span className={cn("size-1.5 shrink-0 rounded-full", tone, running && "animate-pulse")} aria-hidden />
            <span className="font-medium">{s.name}</span>
            <span className={cn("truncate", failed ? "text-bad" : "text-muted-foreground")}>
              {running
                ? "synchro en cours…"
                : failed
                  ? `échec ${since(s.last!.started_at, now)}${s.lastOk ? ` · dernière réussie ${since(s.lastOk.started_at, now)}` : ""}`
                  : s.lastOk
                    ? `mis à jour ${since(s.lastOk.started_at, now)}`
                    : "pas encore branché"}
            </span>
          </div>
        );
      })}
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={busy !== null}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
        Rafraîchir
      </button>
    </div>
  );
}
