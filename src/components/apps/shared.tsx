"use client";

import { useEffect, useState } from "react";
import type { AppPhase, AppRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export const PHASES: { key: AppPhase; label: string; detail: string; tone: string }[] = [
  { key: "preparation", label: "Préparation", detail: "Avant le lancement", tone: "bg-muted text-muted-foreground" },
  { key: "test", label: "Test", detail: "S1-S2 · 15 à 20 comptes", tone: "bg-info-soft text-info" },
  { key: "validation", label: "Validation", detail: "S3-S4 · 40 à 60 comptes", tone: "bg-warn-soft text-warn" },
  { key: "croissance", label: "Croissance", detail: "S5 et plus", tone: "bg-good-soft text-good" },
];
export const phaseOf = (key: AppPhase) => PHASES.find((p) => p.key === key) ?? PHASES[0];

export const NA = "données indisponibles";
export const money = (v: number | null, digits = 0) => (v === null ? null : `${v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`);

export function PhaseBadge({ phase, className }: { phase: AppPhase; className?: string }) {
  const p = phaseOf(phase);
  return <span className={cn("inline-flex h-[22px] items-center rounded-md px-2 text-[11.5px] font-semibold", p.tone, className)}>{p.label}</span>;
}

/** Le logo de l'app, ou son initiale si on n'en a pas (ou s'il ne charge pas). */
export function AppLogo({ app, size = 44 }: { app: Pick<AppRow, "name" | "logo_url">; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const style = { width: size, height: size, borderRadius: size * 0.24 };
  if (!app.logo_url || broken === app.logo_url) {
    return <span style={{ ...style, fontSize: size * 0.42 }} className="grid shrink-0 place-items-center bg-muted font-semibold text-muted-foreground" aria-hidden>{app.name.charAt(0).toUpperCase()}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element -- icône servie par le store, adresse libre
  return <img src={app.logo_url} alt="" style={style} onError={() => setBroken(app.logo_url)} className="shrink-0 border border-line object-cover" />;
}

/** Un chiffre qui vient d'une route du QG, rechargé quand `key` change. */
export function useApi<T>(url: string, key: unknown = 0): { data?: T; error?: string } {
  const [state, setState] = useState<{ url: string; data?: T; error?: string }>({ url: "" });
  useEffect(() => {
    let alive = true;
    void fetch(url)
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as T & { error?: string } }))
      .then(({ ok, body }) => alive && setState(ok ? { url, data: body } : { url, error: body.error ?? "Impossible de charger." }))
      .catch(() => alive && setState({ url, error: "Impossible de charger." }));
    return () => {
      alive = false;
    };
  }, [url, key]);
  return state.url === url ? state : {};
}
