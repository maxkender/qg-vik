import { NextResponse } from "next/server";
import { MEET_SCOPE, meetClientReady, redirectUri } from "@/lib/meet";
import { requireMember } from "@/lib/sync/guard";

/** Première étape, une seule fois : envoyer le membre chez Google pour autoriser la création de salles Meet. */
export async function GET(request: Request) {
  const denied = await requireMember();
  if (denied) return denied;
  if (!meetClientReady()) return NextResponse.json({ error: "Il manque GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans Vercel." }, { status: 503 });
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(origin), response_type: "code", scope: MEET_SCOPE, access_type: "offline", prompt: "consent", state }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("qg_meet_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/meet" });
  return res;
}
