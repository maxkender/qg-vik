"use client";

import { useEffect, useState } from "react";
import type { ControlData } from "@/lib/control/read";

// Un seul appel partagé entre la page et le badge du menu, rafraîchi toutes les 10 minutes.
let cache: { at: number; data: ControlData } | null = null;
let pending: Promise<ControlData | null> | null = null;
const load = () =>
  (pending ??= fetch("/api/control")
    .then((r) => (r.ok ? (r.json() as Promise<ControlData>) : null))
    .then((data) => { if (data) cache = { at: Date.now(), data }; return data; })
    .catch(() => null)
    .finally(() => { pending = null; }));

export function useControl(): { data: ControlData | null; failed: boolean } {
  const [state, setState] = useState<{ data: ControlData | null; failed: boolean }>({ data: cache?.data ?? null, failed: false });
  useEffect(() => {
    let alive = true;
    const run = () => void load().then((data) => alive && setState(data ? { data, failed: false } : (s) => ({ ...s, failed: true })));
    if (!cache || Date.now() - cache.at > 60_000) run();
    const timer = setInterval(run, 600_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return state;
}
