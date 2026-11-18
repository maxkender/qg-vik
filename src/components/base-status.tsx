"use client";

import { useEffect, useState } from "react";

type State = "checking" | "ok" | "down" | "unset";

const LABEL: Record<State, string> = {
  checking: "Vérification de la base…",
  ok: "Base du QG connectée",
  down: "Base injoignable",
  unset: "Base non configurée",
};

const DOT: Record<State, string> = {
  checking: "bg-faint",
  ok: "bg-good",
  down: "bg-bad",
  unset: "bg-warn",
};

/** Petit voyant : la base Supabase du QG répond-elle depuis ce navigateur ? */
export function BaseStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const [state, setState] = useState<State>(url && key ? "checking" : "unset");

  useEffect(() => {
    if (!url || !key) return;
    const ctrl = new AbortController();
    fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: ctrl.signal })
      .then((r) => setState(r.ok ? "ok" : "down"))
      .catch(() => {
        if (!ctrl.signal.aborted) setState("down");
      });
    return () => ctrl.abort();
  }, [url, key]);

  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground" role="status">
      <span className={`size-1.5 rounded-full ${DOT[state]}`} aria-hidden />
      {LABEL[state]}
    </span>
  );
}
