import { NextResponse } from "next/server";
import { deliver, type DraftRow, type FeedbackRow } from "@/lib/agent/reply";
import { adminDb } from "@/lib/sync/admin";
import { supabaseServer } from "@/lib/supabase/server";

/** Un membre clique « Envoyer » (mail) ou « Publier » (avis). C'est le seul chemin d'envoi tant que l'automatique est désactivé. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const { data: profile } = auth.user ? await supabase.from("profiles").select("short").eq("id", auth.user.id).maybeSingle() : { data: null };
  if (!profile) return NextResponse.json({ error: "Accès réservé aux membres du QG." }, { status: 403 });
  const { draft_id, texte } = (await request.json().catch(() => ({}))) as { draft_id?: string; texte?: string };
  const body = (texte ?? "").trim();
  if (!draft_id || !body) return NextResponse.json({ error: "Réponse vide." }, { status: 400 });
  try {
    const db = adminDb();
    const { data: draft } = await db.from("reply_drafts").select("*").eq("id", draft_id).maybeSingle();
    if (!draft || draft.statut !== "brouillon") return NextResponse.json({ error: "Ce brouillon n'est plus à envoyer." }, { status: 409 });
    const { data: item } = await db.from("feedback_items").select("id, app_slug, source, box, thread_id, auteur_email, titre").eq("id", draft.feedback_id).maybeSingle();
    if (!item) return NextResponse.json({ error: "Retour d'origine introuvable." }, { status: 404 });
    await deliver(db, draft as DraftRow, item as FeedbackRow, body, profile.short);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("agent envoi:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 200) : "Envoi impossible." }, { status: 502 });
  }
}
