"use client";

import { useMemo } from "react";
import {
  appsStore, flagsStore, metaStore, metricsStore, osStore, qontoBalanceStore, qontoTxStore, rcCountryStore, rcDailyStore, syncRunsStore, verdictsStore,
} from "@/lib/data";
import { seedBalance, seedOs, seedRc, seedTx } from "@/lib/dash";
import { useRows } from "@/lib/store";
import type { SourceName, SyncRun } from "@/lib/types";

export type SourceInfo = { name: string; live: boolean; last: SyncRun | undefined; lastOk: SyncRun | undefined };
export const SOURCE_LABEL: Record<SourceName, string> = { revenuecat: "RevenueCat", qonto: "Qonto", meta: "Meta Ads", os: "OS" };

/** Toutes les données du dashboard : celles des synchros quand elles existent, sinon le seed du 18/11. */
export function useDash() {
  const apps = useRows(appsStore);
  const rc = useRows(rcDailyStore);
  const rcCountry = useRows(rcCountryStore);
  const tx = useRows(qontoTxStore);
  const bal = useRows(qontoBalanceStore);
  const meta = useRows(metaStore);
  const os = useRows(osStore);
  const runs = useRows(syncRunsStore);
  const flags = useRows(flagsStore);
  const verdicts = useRows(verdictsStore);
  const snapshots = useRows(metricsStore);

  return useMemo(() => {
    const seed = [...snapshots].sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
    const payload = seed?.payload;
    const live = { revenuecat: rc.length > 0, qonto: tx.length > 0, meta: meta.length > 0, os: os.length > 0 };
    const info = (s: SourceName): SourceInfo => {
      const mine = runs.filter((r) => r.source === s).sort((a, b) => b.started_at.localeCompare(a.started_at));
      return { name: SOURCE_LABEL[s], live: live[s], last: mine[0], lastOk: mine.find((r) => r.ok) };
    };
    return {
      apps: [...apps].filter((a) => a.active).sort((a, b) => a.sort_order - b.sort_order),
      rc: live.revenuecat ? rc : seedRc(payload),
      rcCountry,
      tx: live.qonto ? tx : seedTx(payload),
      bal: bal.length ? bal : seedBalance(payload),
      meta,
      os: live.os ? os : seedOs(payload),
      flags,
      verdicts,
      seed: payload,
      seedDate: seed?.as_of ?? null,
      live,
      sources: { revenuecat: info("revenuecat"), qonto: info("qonto"), meta: info("meta"), os: info("os") } as Record<SourceName, SourceInfo>,
      loaded: metricsStore.loaded && appsStore.loaded,
    };
  }, [apps, rc, rcCountry, tx, bal, meta, os, runs, flags, verdicts, snapshots]);
}
export type Dash = ReturnType<typeof useDash>;
