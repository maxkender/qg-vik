import { NextResponse } from "next/server";
import type { ControlData } from "@/lib/control/read";
import { KINDS, controlReady } from "@/lib/control/sync";
import { requireMember } from "@/lib/sync/guard";
import { supabaseServer } from "@/lib/supabase/server";

/** Le dernier relevé de chaque onglet de « Control », et depuis quand l'OS ne répond plus s'il est en panne. */
export async function GET() {
  const denied = await requireMember();
  if (denied) return denied;
  const db = await supabaseServer();
  const configured = controlReady();
  const { data: states } = await db.from("sync_state").select("source, error_since").like("source", "control:%");
  const out = {} as ControlData;
  await Promise.all(KINDS.map(async (kind) => {
    const { data } = await db.from("control_snapshots").select("payload, fetched_at").eq("kind", kind).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    out[kind] = { payload: data?.payload ?? null, fetchedAt: data?.fetched_at ?? null, downSince: states?.find((s) => s.source === `control:${kind}`)?.error_since ?? null, configured };
  }));
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
