import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Vérifie que l'appel vient d'un des 2 membres connectés. Renvoie une réponse 401 sinon. */
export async function requireMember(): Promise<NextResponse | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Accès réservé aux membres du QG." }, { status: 403 });
  return null;
}

export const notConfigured = (missing: string[]) =>
  NextResponse.json({ error: "Pas encore configuré.", missing }, { status: 501 });
