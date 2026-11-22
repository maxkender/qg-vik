import { NextResponse } from "next/server";
import { requireMember } from "@/lib/sync/guard";

/**
 * Le logo d'une app : `icon_url_large` de son projet RevenueCat. LECTURE SEULE (GET /v2/projects).
 * Une clé RevenueCat ne voit que son projet : on essaie celles qui sont dans les variables Vercel.
 */
export async function POST(request: Request) {
  const denied = await requireMember();
  if (denied) return denied;
  const { project_id } = (await request.json().catch(() => ({}))) as { project_id?: string };
  if (!project_id || !/^proj[a-z0-9]+$/i.test(project_id)) return NextResponse.json({ logo_url: null });
  const keys = Object.entries(process.env).filter(([name, value]) => name.startsWith("REVENUECAT_KEY_") && value).map(([, value]) => value!.trim());
  for (const key of keys.slice(0, 20)) {
    try {
      const res = await fetch("https://api.revenuecat.com/v2/projects?limit=50", { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as { items?: { id: string; icon_url_large?: string | null }[] };
      const url = data.items?.find((p) => p.id === project_id)?.icon_url_large;
      if (url && /^https:\/\//.test(url)) return NextResponse.json({ logo_url: url });
    } catch {}
  }
  return NextResponse.json({ logo_url: null });
}
