import { NextResponse } from "next/server";
import { buildApp, type AppSummary, type Row } from "@/lib/apps/report";
import { loadContext, loadRows } from "@/lib/apps/server";
import { requireMember } from "@/lib/sync/guard";
import { supabaseServer } from "@/lib/supabase/server";

/** Les chiffres de toutes les apps, pour la grille de /apps. */
export async function GET() {
  const denied = await requireMember();
  if (denied) return denied;
  const db = await supabaseServer();
  try {
    const ctx = await loadContext(db);
    const [{ data: apps, error }, rows] = await Promise.all([db.from("apps").select("slug, launch_date").eq("active", true), loadRows(db, null, ctx.today)]);
    if (error) throw new Error(error.message);
    const out: Record<string, AppSummary> = {};
    for (const app of apps ?? []) {
      // La grille n'a pas besoin du détail par pays, par label ni des points de contrôle.
      const { countries: _c, labels: _l, checkpoints: _k, ...summary } = buildApp(app, rows.filter((r) => r.app === app.slug) as Row[], [], ctx);
      void _c; void _l; void _k;
      out[app.slug] = summary;
    }
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("apps:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Impossible de charger les apps." }, { status: 500 });
  }
}
