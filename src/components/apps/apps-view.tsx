"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { AppForm } from "@/components/apps/app-form";
import { AppLogo, NA, PhaseBadge, money, useApi } from "@/components/apps/shared";
import type { AppSummary } from "@/lib/apps/report";
import { appsStore } from "@/lib/data";
import { useRows } from "@/lib/store";
import { cn } from "@/lib/utils";

/** La courbe des revenus sur 8 semaines. Une semaine sans donnée coupe le trait au lieu de tomber à zéro. */
function Spark({ values }: { values: (number | null)[] }) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return <p className="grid h-12 place-items-center text-[11.5px] text-faint">{NA}</p>;
  const max = Math.max(...known, 1);
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 30 - (v / max) * 26;
  const path = values.map((v, i) => (v === null ? "" : `${i === 0 || values[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label="Revenus des 8 dernières semaines">
      <path d={path} fill="none" stroke="var(--foreground)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Figure({ label, value, tone }: { label: string; value: string | null; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11.5px] text-muted-foreground">{label}</p>
      {value === null ? <p className="mt-1 text-[11.5px] leading-tight text-faint">{NA}</p> : <p className={cn("num mt-1 truncate text-[17px] leading-none font-medium tracking-[-0.01em]", tone)}>{value}</p>}
    </div>
  );
}

export function AppsView() {
  const apps = useRows(appsStore);
  const { data, error } = useApi<Record<string, AppSummary>>("/api/apps", apps.length);
  const [creating, setCreating] = useState(false);

  // Par marge, de la meilleure à la pire ; celles dont on ne connaît pas la marge ensuite, par revenu.
  const sorted = useMemo(() => {
    const rank = (slug: string) => [data?.[slug]?.margin ?? -Infinity, data?.[slug]?.rev7.value ?? -Infinity];
    return apps.filter((a) => a.active).sort((a, b) => rank(b.slug)[0] - rank(a.slug)[0] || rank(b.slug)[1] - rank(a.slug)[1] || a.sort_order - b.sort_order);
  }, [apps, data]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Apps">
        <button type="button" onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background">
          <Plus className="size-4" aria-hidden /> Nouvelle app
        </button>
      </ViewHeader>
      {error && <p className="px-6 text-[14px] text-bad">{error}</p>}
      <div className="grid grid-cols-1 gap-3 px-4 pb-24 sm:grid-cols-2 md:px-6 xl:grid-cols-3">
        {sorted.map((app) => {
          const m = data?.[app.slug];
          return (
            <Link key={app.slug} href={`/apps/${app.slug}`} className={cn("glass block min-w-0 rounded-2xl p-4 transition-colors duration-100 hover:border-line-strong", !data && "animate-pulse")}>
              <div className="flex items-center gap-3">
                <AppLogo app={app} />
                <p className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em]">{app.name}</p>
                <PhaseBadge phase={app.phase} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Figure label="Revenu 7 j" value={money(m?.rev7.value ?? null)} />
                <Figure label="Coût posteurs" value={money(m?.cost ?? null)} />
                <Figure label="Marge" value={money(m?.margin ?? null)} tone={m?.margin != null ? (m.margin >= 0 ? "text-good" : "text-bad") : undefined} />
              </div>
              <div className="mt-3"><Spark values={(m?.weeks ?? []).map((w) => w.revenue)} /></div>
            </Link>
          );
        })}
      </div>
      {creating && <AppForm onClose={() => setCreating(false)} />}
    </div>
  );
}
