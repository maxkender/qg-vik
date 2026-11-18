import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { backToLogin, finishLogin } from "@/lib/auth-callback";
import { supabaseServer } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

/**
 * Variante du lien magique qui marche aussi quand on ouvre l'email sur un autre
 * appareil (à activer en changeant le modèle d'email dans Supabase, voir README).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token_hash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (!token_hash || !type || !TYPES.includes(type)) return backToLogin(request, "lien");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) return backToLogin(request, "lien");

  return finishLogin(request, supabase);
}
