import { NextResponse } from "next/server";
import { notConfigured, requireMember } from "@/lib/integrations/guard";
import { qontoAccounts, qontoConfigured, qontoDebits } from "@/lib/integrations/qonto";

// Lecture seule : trésorerie et sorties d'argent des 35 derniers jours.
export async function GET() {
  const denied = await requireMember();
  if (denied) return denied;
  if (!qontoConfigured()) return notConfigured(["QONTO_LOGIN", "QONTO_SECRET_KEY"]);
  try {
    const accounts = await qontoAccounts();
    const debits = await qontoDebits(new Date(Date.now() - 35 * 864e5).toISOString());
    return NextResponse.json({
      tresorerie: accounts.reduce((a, b) => a + Number(b.balance), 0),
      comptes: accounts.length,
      depenses: debits,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
