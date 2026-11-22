import { NextResponse } from "next/server";
import { agentStatus, runAgent } from "@/lib/agent/run";
import { FAL_MODEL } from "@/lib/agent/fal";
import { controlReady, osHint, syncControl } from "@/lib/control/sync";
import { adminDb } from "@/lib/sync/admin";
import { requireMember } from "@/lib/sync/guard";

export const maxDuration = 300;

// GET : ce qui est branché (jamais une clé). POST : un membre lance un passage maintenant.
export async function GET() {
  const denied = await requireMember();
  if (denied) return denied;
  return NextResponse.json({ sources: { ...agentStatus(), os: controlReady() }, modele: FAL_MODEL(), base: Boolean(process.env.SUPABASE_SECRET_KEY), os: osHint() });
}
export async function POST() {
  const denied = await requireMember();
  if (denied) return denied;
  if (!process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ error: "SUPABASE_SECRET_KEY manquante dans Vercel." }, { status: 503 });
  const db = adminDb();
  const control = await syncControl(db).catch((e) => String(e));
  return NextResponse.json({ control, ...(await runAgent(db)) });
}
