import { NextResponse } from "next/server";
import { createMeetLink, meetClientReady, meetReady } from "@/lib/meet";
import { requireMember } from "@/lib/sync/guard";

/** Où en est le branchement de Google Meet. */
export async function GET() {
  const denied = await requireMember();
  if (denied) return denied;
  return NextResponse.json({ ready: meetReady(), client: meetClientReady() }, { headers: { "Cache-Control": "no-store" } });
}

/** Crée un lien Meet, sans entrer dans la réunion. */
export async function POST() {
  const denied = await requireMember();
  if (denied) return denied;
  if (!meetReady()) return NextResponse.json({ error: "La génération de liens Meet n'est pas encore branchée.", client: meetClientReady() }, { status: 503 });
  try {
    return NextResponse.json({ url: await createMeetLink() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Meet n'a pas pu créer la salle." }, { status: 502 });
  }
}
