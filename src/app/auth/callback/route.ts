import type { NextRequest } from "next/server";
import { backToLogin, finishLogin } from "@/lib/auth-callback";
import { supabaseServer } from "@/lib/supabase/server";

/** Retour du lien magique ou de Google : on échange le code contre une session. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Supabase renvoie ici ses erreurs (lien expiré, compte refusé par la base…).
  if (params.get("error") || params.get("error_code")) {
    const refused = /database error|saving new user|membres du qg/i.test(params.get("error_description") ?? "");
    return backToLogin(request, refused ? "refuse" : "lien");
  }

  const code = params.get("code");
  if (!code) return backToLogin(request, "lien");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return backToLogin(request, "lien");

  return finishLogin(request, supabase);
}
