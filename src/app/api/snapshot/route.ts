import { NextResponse } from "next/server";
import { requireMember } from "@/lib/integrations/guard";
import { integrationStatus, refreshSnapshot } from "@/lib/integrations/snapshot";

// GET : où en est la configuration (sans jamais renvoyer une clé).
export async function GET() {
  const denied = await requireMember();
  if (denied) return denied;
  return NextResponse.json(integrationStatus());
}

// POST : un membre demande une mise à jour des chiffres maintenant.
export async function POST() {
  const denied = await requireMember();
  if (denied) return denied;
  const res = await refreshSnapshot("manuel");
  return NextResponse.json(res, { status: res.ok ? 200 : 501 });
}
