import { NextResponse, type NextRequest } from "next/server";
import { refreshSnapshot } from "@/lib/integrations/snapshot";

// Appelé par Vercel chaque lundi matin (voir vercel.json). Protégé par CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const res = await refreshSnapshot("cron");
  return NextResponse.json(res, { status: res.ok ? 200 : 501 });
}
