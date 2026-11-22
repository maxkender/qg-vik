import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BOXES, GMAIL_SCOPES, googleClientReady, isBox } from "@/lib/agent/gmail";
import { requireMember } from "@/lib/sync/guard";

/** Départ de l'autorisation Gmail d'une boîte (?box=max ou ?box=support) : lecture et brouillons. */
export async function GET(request: Request) {
  const denied = await requireMember();
  if (denied) return denied;
  const url = new URL(request.url);
  const box = url.searchParams.get("box");
  if (!isBox(box) || !googleClientReady()) return NextResponse.json({ error: "Boîte inconnue, ou GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants." }, { status: 400 });
  const state = `${box}.${randomBytes(16).toString("hex")}`;
  (await cookies()).set("qg_gmail_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/gmail" });
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${url.origin}/api/gmail/callback`, response_type: "code", scope: GMAIL_SCOPES, access_type: "offline", prompt: "consent", login_hint: BOXES[box].email, state });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}
