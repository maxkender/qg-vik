import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** sync_state : où chaque source s'est arrêtée, et depuis quand elle est en erreur. */
export type SyncState = { source: string; cursor: string | null; last_run_at: string | null; last_ok_at: string | null; error: string | null; error_since: string | null; stats: Record<string, number> };

export async function readState(db: SupabaseClient, source: string): Promise<SyncState> {
  const { data } = await db.from("sync_state").select("*").eq("source", source).maybeSingle();
  return (data as SyncState | null) ?? { source, cursor: null, last_run_at: null, last_ok_at: null, error: null, error_since: null, stats: {} };
}

/** Fin d'un passage : nouveau curseur si tout va bien, sinon l'erreur (en gardant la date de la première). */
export async function writeState(db: SupabaseClient, before: SyncState, out: { cursor?: string | null; error?: string | null; add?: Record<string, number> }) {
  const now = new Date().toISOString();
  const stats = { ...before.stats };
  Object.entries(out.add ?? {}).forEach(([k, v]) => (stats[k] = (stats[k] ?? 0) + v));
  const error = out.error ? out.error.slice(0, 400) : null;
  await db.from("sync_state").upsert({
    source: before.source, cursor: out.cursor ?? before.cursor, last_run_at: now, last_ok_at: error ? before.last_ok_at : now,
    error, error_since: error ? (before.error_since ?? now) : null, stats, updated_at: now,
  });
}
