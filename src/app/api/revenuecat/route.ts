import { NextResponse } from "next/server";
import { notConfigured, requireMember } from "@/lib/integrations/guard";
import { RC_APPS, countryRevenue, rcConfigured, weeklyRevenue } from "@/lib/integrations/revenuecat";

// Lecture seule : revenus par app (5 dernières semaines) et par pays (Sophia, 4 semaines).
export async function GET() {
  const denied = await requireMember();
  if (denied) return denied;
  const ok = rcConfigured();
  if (!Object.values(ok).some(Boolean)) return notConfigured(RC_APPS.map((a) => `REVENUECAT_KEY_${a.toUpperCase()}`));
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10);
  try {
    const apps = Object.fromEntries(
      await Promise.all(RC_APPS.filter((a) => ok[a]).map(async (a) => [a, await weeklyRevenue(a, start, end)] as const)),
    );
    const pays = ok.sophia ? await countryRevenue("sophia", start, end) : [];
    return NextResponse.json({ apps, pays });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
