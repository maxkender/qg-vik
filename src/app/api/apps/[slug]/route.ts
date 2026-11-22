import { NextResponse } from "next/server";
import { buildApp, type CountryWeek } from "@/lib/apps/report";
import { loadContext, loadRows } from "@/lib/apps/server";
import { selectAll } from "@/lib/sync/admin";
import { requireMember } from "@/lib/sync/guard";
import { supabaseServer } from "@/lib/supabase/server";

/** La fiche d'une app : KPI, semaines, pays, labels, points de contrôle. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await requireMember();
  if (denied) return denied;
  const { slug } = await params;
  const db = await supabaseServer();
  try {
    const { data: app, error } = await db.from("apps").select("slug, launch_date").eq("slug", slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) return NextResponse.json({ error: "App introuvable." }, { status: 404 });
    const ctx = await loadContext(db);
    // Depuis le lancement s'il est plus ancien que 11 semaines : les points de contrôle S2, S4 et S8 en ont besoin.
    const since = [app.launch_date, new Date(new Date(ctx.today).getTime() - 77 * 864e5).toISOString().slice(0, 10)].filter(Boolean).sort()[0] as string;
    const [rows, countryWeeks] = await Promise.all([
      loadRows(db, slug, ctx.today, since),
      selectAll<CountryWeek>((a, b) => db.from("rc_country_weekly").select("week, country, country_name, revenue, new_users").eq("app", slug).gte("week", new Date(new Date(ctx.today).getTime() - 42 * 864e5).toISOString().slice(0, 10)).order("week").range(a, b)),
    ]);
    return NextResponse.json(buildApp(app, rows, countryWeeks, ctx), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("app:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Impossible de charger cette app." }, { status: 500 });
  }
}
