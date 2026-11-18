"use client";

import { useMemo, useState } from "react";
import { ViewHeader } from "@/components/app/shell";
import { useView } from "@/components/app/view-state";
import { Flags, MonthlyByPoste, TopVendors, Transactions, VendorRules } from "@/components/dashboard/expenses";
import { SyncBar } from "@/components/dashboard/sync-bar";
import { useDash } from "@/components/dashboard/use-dash";
import { debitsIn, periodOf, spendIn, total, type PeriodKind } from "@/lib/dash";
import { eur } from "@/lib/format";
import { POSTES } from "@/lib/postes";

const field = "h-9 min-w-0 rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none transition-colors duration-100 focus:border-line-strong";

// Le détail des dépenses : postes, fournisseurs, anomalies, transactions et règles de rangement.
export default function ExpensesPage() {
  const dash = useDash();
  const { today } = useView();
  const [kind, setKind] = useState<PeriodKind>("month");
  const period = useMemo(() => periodOf(kind, today), [kind, today]);
  const debits = debitsIn(dash.tx, period);
  const meta = spendIn(dash.meta, period);
  const sum = total(debits) + meta;
  const tiles = POSTES.map((p) => ({ p, v: total(debits.filter((t) => t.poste === p)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Dépenses" sub="D'où part l'argent : par poste, par fournisseur, et ce qui mérite un coup d'œil.">
        <select value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)} aria-label="Période" className={field}>
          <option value="month">Mois en cours</option>
          <option value="7">7 derniers jours</option>
          <option value="30">30 derniers jours</option>
          <option value="90">90 derniers jours</option>
        </select>
      </ViewHeader>
      <div className="flex flex-col gap-3 px-4 pb-16 md:px-6">
        <SyncBar dash={dash} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="glass flex min-w-0 flex-col gap-1 rounded-2xl p-4">
            <p className="text-[12.5px] text-muted-foreground">Total</p>
            <p className="font-heading text-[30px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{eur(sum)}</p>
            <p className="text-[11.5px] text-faint">Qonto {eur(total(debits))}{dash.live.meta ? ` · Meta ${eur(meta)}` : ""}</p>
          </div>
          {tiles.map(({ p, v }) => (
            <div key={p} className="glass flex min-w-0 flex-col gap-1 rounded-2xl p-4">
              <p className="truncate text-[12.5px] text-muted-foreground">{p}</p>
              <p className="font-heading text-[24px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{eur(v)}</p>
              <p className="text-[11.5px] text-faint">{sum ? Math.round((v / sum) * 100) : 0} % du total</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <MonthlyByPoste dash={dash} />
          <TopVendors dash={dash} period={period} app="all" />
        </div>
        <Flags dash={dash} />
        <Transactions dash={dash} period={period} app="all" />
        <VendorRules dash={dash} />
      </div>
    </div>
  );
}
