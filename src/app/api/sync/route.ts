import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/sync/guard";
import { isSource, runSync, syncStatus } from "@/lib/sync/run";

export const maxDuration = 300;

// GET : ce qui est configuré (jamais une clé).
export async function GET() {
  const denied = await requireMember();
  if (denied) return denied;
  return NextResponse.json(syncStatus());
}

// POST ?source=qonto : un membre demande de rafraîchir une source maintenant.
export async function POST(request: NextRequest) {
  const denied = await requireMember();
  if (denied) return denied;
  const source = request.nextUrl.searchParams.get("source");
  if (!isSource(source)) return NextResponse.json({ error: "Source inconnue." }, { status: 400 });
  return NextResponse.json(await runSync(source, "manuel"));
}
