import { NextResponse } from "next/server";
import { readIssues, readPayroll, readRecruitment, type ControlData } from "@/lib/control/read";
import { osAppsReady, osAppsShape } from "@/lib/apps/os";
import { controlReady } from "@/lib/control/sync";
import { requireMember } from "@/lib/sync/guard";
import { supabaseServer } from "@/lib/supabase/server";

/** Le dernier relevé de chaque onglet de « Control », et depuis quand l'OS ne répond plus s'il est en panne. */
export async function GET(request: Request) {
  const denied = await requireMember();
  if (denied) return denied;
  // ?forme=apps : la forme (sans valeurs) de ce que l'OS répond sur /api/qg/apps, pour régler la lecture.
  if (new URL(request.url).searchParams.get("forme") === "apps") return NextResponse.json(osAppsReady() ? await osAppsShape().catch((e) => ({ erreur: String(e).slice(0, 300) })) : { erreur: "OS non branché" });
  const db = await supabaseServer();
  const configured = controlReady();
  const { data: states } = await db.from("sync_state").select("source, error_since").like("source", "control:%");
  const now = Date.now();
  const latest = async (kind: string) => {
    const { data } = await db.from("control_snapshots").select("payload, fetched_at").eq("kind", kind).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    return { payload: data?.payload ?? null, meta: { fetchedAt: (data?.fetched_at as string | undefined) ?? null, downSince: (states?.find((s) => s.source === `control:${kind}`)?.error_since as string | null | undefined) ?? null, configured } };
  };
  const [r, p, i] = await Promise.all([latest("recrutement"), latest("paie"), latest("problemes")]);
  // Les réponses brutes de l'OS restent sur le serveur : le navigateur ne reçoit que les vues compactes.
  const out: ControlData = {
    recrutement: { ...r.meta, view: r.payload ? readRecruitment(r.payload, now) : null },
    paie: { ...p.meta, view: p.payload ? readPayroll(p.payload) : null },
    problemes: { ...i.meta, view: i.payload ? readIssues(i.payload) : null },
  };
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
