import "server-only";
import { adminDb } from "@/lib/sync/admin";
import { metaReady, syncMeta } from "@/lib/sync/meta";
import { osReady, syncOs } from "@/lib/sync/os";
import { qontoHint, qontoReady, syncQonto } from "@/lib/sync/qonto";
import { PartialSync, rcKey, syncRevenueCat } from "@/lib/sync/revenuecat";

export const SOURCES = ["revenuecat", "qonto", "meta", "os"] as const;
export type Source = (typeof SOURCES)[number];
export const isSource = (v: unknown): v is Source => SOURCES.includes(v as Source);

const RUNNERS = { revenuecat: syncRevenueCat, qonto: syncQonto, meta: syncMeta, os: syncOs };

/** Ce qui est configuré, sans jamais renvoyer une clé. */
export function syncStatus() {
  const base = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  const rc = ["sophia", "micabo", "unswipe", "runvik"].filter((a) => rcKey(a));
  return { base, revenuecat: rc.length > 0, revenuecat_apps: rc, qonto: qontoReady(), qonto_forme: qontoHint(), meta: metaReady(), os: osReady() };
}

export type RunResult = { source: Source; ok: boolean; rows: number; error: string | null; skipped?: boolean };

/** Lance la synchro d'une source et en garde la trace dans sync_runs. */
export async function runSync(source: Source, trigger: "cron" | "manuel"): Promise<RunResult> {
  const status = syncStatus();
  if (!status.base) return { source, ok: false, rows: 0, error: "SUPABASE_SECRET_KEY manquante dans Vercel" };
  // Une source pas encore branchée n'est pas une panne : on ne crée pas de ligne d'erreur.
  if (!status[source]) return { source, ok: false, rows: 0, error: "Pas encore configuré", skipped: true };

  const db = adminDb();
  const { data: run } = await db.from("sync_runs").insert({ source, trigger }).select("id").single();
  let ok = true, rows = 0, error: string | null = null;
  try {
    rows = await RUNNERS[source](db);
  } catch (e) {
    if (e instanceof PartialSync) rows = e.rows;
    ok = false;
    error = (e as Error).message.slice(0, 500);
  }
  if (run) await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok, rows, error }).eq("id", run.id);
  return { source, ok, rows, error };
}
