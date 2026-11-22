import { NextResponse, type NextRequest } from "next/server";
import { runAgent } from "@/lib/agent/run";
import { adminDb } from "@/lib/sync/admin";

export const maxDuration = 300;

/** Toutes les heures (vercel.json), protégé par CRON_SECRET : lit les nouveaux mails et avis, les classe, prépare les brouillons. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  return NextResponse.json(await runAgent(adminDb()));
}
