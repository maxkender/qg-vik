import { NextResponse } from "next/server";
import { PERIODS, loadProduct } from "@/lib/product/load";
import { requireMember } from "@/lib/sync/guard";

/** Les chiffres produit d'une app (onboarding, réponses, rétention, paywall), lus dans la base de l'app. LECTURE SEULE. */
export async function GET(request: Request) {
  const denied = await requireMember();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const app = (params.get("app") ?? "").toLowerCase();
  const days = Number(params.get("days"));
  if (!/^[a-z0-9_]{1,40}$/.test(app)) return NextResponse.json({ error: "App inconnue." }, { status: 400 });
  try {
    return NextResponse.json(await loadProduct(app, PERIODS.includes(days) ? days : PERIODS[0]), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("produit:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Impossible de lire les chiffres de cette app." }, { status: 500 });
  }
}
