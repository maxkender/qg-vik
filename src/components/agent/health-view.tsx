"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ViewHeader } from "@/components/app/shell";
import { useApi } from "@/components/apps/shared";
import { Panel } from "@/components/dashboard/charts";
import { SOURCE_NAME, since } from "@/lib/agent/types";
import { feedbackStore, mailDigestStore, syncStateStore } from "@/lib/data";
import { useRows } from "@/lib/store";
import { cn } from "@/lib/utils";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(" ", " à ") : "jamais");
const ENV: Record<string, string> = { "gmail:max": "GMAIL_REFRESH_TOKEN_MAX", "gmail:support": "GMAIL_REFRESH_TOKEN_SUPPORT", app_store: "ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY", play: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", fal: "FAL_API_KEY ou GEMINI_API_KEY", os: "OS_API_URL, OS_QG_TOKEN" };

export function HealthView() {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const { data } = useApi<{ sources: Record<string, boolean>; modele: string; os: { domaine: string | null; token_longueur: number; token_espaces_en_trop: boolean; token_guillemets: boolean } }>("/api/agent/run", tick);
  const states = useRows(syncStateStore);
  const items = useRows(feedbackStore);
  const mails = useRows(mailDigestStore);
  const errors = [...items.filter((i) => i.erreur).map((i) => ({ id: i.id, at: i.recu_le, what: i.titre ?? i.id, error: i.erreur! })), ...mails.filter((m) => m.erreur).map((m) => ({ id: m.id, at: m.recu_le, what: m.objet ?? m.id, error: m.erreur! }))].sort((a, b) => b.at.localeCompare(a.at));

  async function run() {
    setBusy(true);
    const res = await fetch("/api/agent/run", { method: "POST" }).then(async (r) => ({ ok: r.ok, body: (await r.json()) as { error?: string } })).catch(() => ({ ok: false, body: { error: "Passage impossible." } }));
    setBusy(false);
    if (!res.ok) return void toast.error(res.body.error ?? "Passage impossible.");
    void Promise.all([syncStateStore.load(), feedbackStore.load(), mailDigestStore.load()]);
    setTick((t) => t + 1);
    toast("Passage terminé");
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Santé de l'agent" eyebrow="Support, avis et boîte mail · un passage par heure">
        <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium hover:border-line-strong disabled:opacity-50">
          <RefreshCw className={cn("size-4", busy && "animate-spin")} aria-hidden /> Lancer un passage
        </button>
      </ViewHeader>
      <div className="flex min-w-0 flex-col gap-3 px-4 pb-24 md:px-6 [&>*]:min-w-0">
        <Panel title="Sources">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <tbody>
                {[...Object.keys(SOURCE_NAME), "os"].map((s) => {
                  // L'OS : trois relevés (recrutement, paie, problèmes), montrés en une ligne.
                  const st = s === "os" ? (states.find((x) => x.source.startsWith("control:") && x.error) ?? states.find((x) => x.source.startsWith("control:"))) : states.find((x) => x.source === s);
                  const ready = data?.sources[s];
                  const state = ready === undefined ? null : !ready ? "off" : st?.error ? "ko" : st?.last_ok_at ? "ok" : "wait";
                  return (
                    <tr key={s} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 font-medium whitespace-nowrap">{s === "os" ? "OS · Control et Apps" : SOURCE_NAME[s]}{s === "fal" && data && <span className="num ml-2 font-normal text-muted-foreground">{data.modele}</span>}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {state === "off" && <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">Non branchée</span>}
                        {state === "ko" && <span className="rounded-md bg-bad-soft px-2 py-0.5 text-[11.5px] font-semibold text-bad">Indisponible depuis {since(st!.error_since ?? st!.last_run_at!)}</span>}
                        {state === "ok" && <span className="rounded-md bg-good-soft px-2 py-0.5 text-[11.5px] font-semibold text-good">En marche</span>}
                        {state === "wait" && <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">Branchée, pas encore passée</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {state === "off" ? <>Variable Vercel : <span className="num">{ENV[s]}</span>{s.startsWith("gmail:") && <> · <a href={`/api/gmail/connect?box=${s.slice(6)}`} className="underline underline-offset-4 hover:text-foreground">obtenir l&apos;autorisation</a></>}</> : st?.error ? <>{st.error}{s === "os" && data && <span className="block">Appelé : <span className="num">{data.os.domaine}</span> · token de <span className="num">{data.os.token_longueur}</span> caractères{data.os.token_espaces_en_trop && " · espace en trop"}{data.os.token_guillemets && " · guillemets en trop"}</span>}</> : <>dernière synchro le <span className="num">{when(st?.last_ok_at ?? null)}</span></>}
                      </td>
                      <td className="num py-2.5 text-right whitespace-nowrap text-muted-foreground">{!st || s === "os" ? "" : (s === "fal" ? `${st.stats.classes ?? 0} classés · ${st.stats.erreurs ?? 0} erreurs` : `${st.stats.lus ?? 0} lus`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Retours classés", items.filter((i) => i.classe_le).length], ["Retours en attente", items.filter((i) => !i.classe_le && !i.erreur).length],
            ["Mails de la boîte classés", mails.filter((m) => m.section).length], ["Mails de posteurs ignorés", mails.filter((m) => m.tri === "ignore_posteur").length],
          ].map(([label, n]) => (
            <div key={label} className="glass min-w-0 rounded-2xl p-4">
              <p className="truncate text-[12.5px] text-muted-foreground">{label}</p>
              <p className="num mt-1.5 text-[24px] leading-none font-medium">{Number(n).toLocaleString("fr-FR")}</p>
            </div>
          ))}
        </div>
        <Panel title={<>Erreurs du modèle <span className="num ml-1 text-[13px] font-normal text-muted-foreground">{errors.length}</span></>}>
          {errors.length ? (
            <ul className="divide-y divide-line">
              {errors.slice(0, 30).map((e) => <li key={e.id} className="py-2 text-[13px]"><span className="block truncate font-medium">{e.what}</span><span className="block text-[12.5px] text-muted-foreground">{e.error}</span></li>)}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Aucune erreur.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
