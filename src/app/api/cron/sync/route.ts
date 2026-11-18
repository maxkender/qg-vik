import { NextResponse, type NextRequest } from "next/server";
import { SOURCES, runSync } from "@/lib/sync/run";

export const maxDuration = 300;

/**
 * Appelé par Vercel Cron (voir vercel.json), protégé par CRON_SECRET.
 * Vercel planifie en UTC : deux rendez-vous (4h et 5h UTC), et seul celui qui tombe
 * à 6h à Paris travaille. Ainsi c'est 6h heure de Paris été comme hiver.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date()).slice(0, 2));
  if (hour !== 6 && request.nextUrl.searchParams.get("force") !== "1") {
    return NextResponse.json({ skipped: true, reason: `Il est ${hour}h à Paris, la synchro tourne à 6h.` });
  }
  const results = await Promise.all(SOURCES.map((s) => runSync(s, "cron")));
  return NextResponse.json({ results });
}
