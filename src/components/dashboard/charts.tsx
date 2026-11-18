"use client";

import type { ReactNode } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

export type Serie = { key: string; label: string; color: string };
type Datum = Record<string, string | number | boolean | null>;

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" };

/** Panneau en verre : titre, légende d'une phrase, contenu. */
export function Panel({
  title, caption, children, className, action,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("glass min-w-0 rounded-2xl p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="font-sans text-[14.5px] font-semibold tracking-normal">{title}</h3>}
            {caption && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{caption}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn((title || action) && "mt-4")}>{children}</div>
    </section>
  );
}

/** Légende : toujours là dès qu'il y a 2 séries ou plus. */
export function Legend({ series }: { series: Serie[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

type TipProps = {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number | string; payload?: Datum }[];
  series: Serie[];
  format: (v: number) => string;
  total?: boolean;
};
function Tip({ active, label, payload, series, format, total }: TipProps) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .map((p) => ({ s: series.find((x) => x.key === p.dataKey), v: Number(p.value) }))
    .filter((r) => r.s && Number.isFinite(r.v));
  const partial = Boolean(payload[0]?.payload?.partial);
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-[12px] shadow-xl">
      <p className="num mb-1 text-[11px] text-muted-foreground">
        {label}
        {partial && " · semaine en cours"}
      </p>
      {rows.map((r) => (
        <p key={r.s!.key} className="flex items-center gap-2">
          <span className="size-2 rounded-[2px]" style={{ background: r.s!.color }} aria-hidden />
          <span className="text-muted-foreground">{r.s!.label}</span>
          <span className="num ml-auto pl-3 text-foreground">{format(r.v)}</span>
        </p>
      ))}
      {total && rows.length > 1 && (
        <p className="mt-1 flex border-t border-line pt-1 text-muted-foreground">
          Total <span className="num ml-auto pl-3 text-foreground">{format(rows.reduce((a, r) => a + r.v, 0))}</span>
        </p>
      )}
    </div>
  );
}

type ChartProps = {
  data: Datum[];
  x: string;
  series: Serie[];
  format: (v: number) => string;
  height?: number;
  stacked?: boolean;
  /** Libellé lu par les lecteurs d'écran. */
  label: string;
};

/** Barres (groupées ou empilées). Les semaines partielles sont plus pâles. */
export function Bars({ data, x, series, format, height = 220, stacked, label }: ChartProps) {
  return (
    <div role="img" aria-label={label}>
      {series.length > 1 && <Legend series={series} />}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => format(v)} />
          <Tooltip cursor={{ fill: "var(--accent)" }} content={<Tip series={series} format={format} total={stacked} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId={stacked ? "a" : undefined}
              fill={s.color}
              stroke={stacked ? "var(--viz-surface)" : undefined}
              strokeWidth={stacked ? 1.5 : 0}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
              maxBarSize={stacked ? 46 : 26}
              isAnimationActive={false}
            >
              {data.map((d, j) => (
                <Cell key={j} fillOpacity={d.partial ? 0.45 : 1} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Courbe(s) : trait de 2 px, points visibles. */
export function Lines({ data, x, series, format, height = 220, label }: ChartProps) {
  return (
    <div role="img" aria-label={label}>
      {series.length > 1 && <Legend series={series} />}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} padding={{ left: 14, right: 14 }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => format(v)} domain={[0, "auto"]} />
          <Tooltip cursor={{ stroke: "var(--line-strong)" }} content={<Tip series={series} format={format} />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 4, fill: s.color, stroke: "var(--viz-surface)", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "var(--viz-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
