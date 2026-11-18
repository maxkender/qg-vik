import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memberForEmail } from "@/lib/allowed";

export function backToLogin(request: NextRequest, erreur: string) {
  return NextResponse.redirect(new URL(`/connexion?erreur=${erreur}`, request.url));
}

/**
 * Dernière vérification après une connexion réussie : l'email doit être
 * dans ALLOWED_EMAILS. Sinon on déconnecte tout de suite.
 */
export async function finishLogin(request: NextRequest, supabase: SupabaseClient) {
  const { data } = await supabase.auth.getUser();
  if (!memberForEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return backToLogin(request, "refuse");
  }
  return NextResponse.redirect(new URL("/", request.url));
}
