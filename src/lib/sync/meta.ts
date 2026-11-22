import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_START, daysAgo, getJson, isoDay, upsertChunks } from "@/lib/sync/admin";

/**
 * Meta Ads → meta_spend_daily. LECTURE SEULE (GET sur les statistiques, droit ads_read).
 * Variables : META_ACCESS_TOKEN et META_AD_ACCOUNT_ID (plusieurs comptes possibles, séparés par des virgules).
 */
type Row = { date_start: string; campaign_id: string; campaign_name: string; spend: string; impressions?: string; clicks?: string; account_currency?: string };

export const metaReady = () => Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);

export async function syncMeta(db: SupabaseClient): Promise<number> {
  if (!metaReady()) throw new Error("META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID manquante");
  const { data: apps } = await db.from("apps").select("key:slug, name");
  const { count } = await db.from("meta_spend_daily").select("date", { count: "exact", head: true });
  const since = count ? daysAgo(10) : HISTORY_START;
  const until = isoDay(new Date());
  // L'app est déduite du nom de la campagne quand il contient le nom d'une app.
  const appOf = (name: string) => (apps ?? []).find((a) => name.toLowerCase().includes(a.key) || name.toLowerCase().includes(a.name.toLowerCase()))?.key ?? null;

  const rows: Record<string, unknown>[] = [];
  for (const raw of process.env.META_AD_ACCOUNT_ID!.split(",").map((s) => s.trim()).filter(Boolean)) {
    const account = raw.startsWith("act_") ? raw : `act_${raw}`;
    const qs = new URLSearchParams({
      level: "campaign", time_increment: "1", limit: "500",
      fields: "campaign_id,campaign_name,spend,impressions,clicks,account_currency",
      time_range: JSON.stringify({ since, until }),
    });
    let url: string | null = `https://graph.facebook.com/${account}/insights?${qs}`;
    for (let page = 0; url && page < 100; page++) {
      const data: { data: Row[]; paging?: { next?: string } } = await getJson(url, { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` }, "Meta Ads");
      (data.data ?? []).forEach((r) =>
        rows.push({
          date: r.date_start, campaign_id: r.campaign_id, account_id: account, campaign_name: r.campaign_name, app: appOf(r.campaign_name ?? ""),
          spend: Number(r.spend ?? 0), currency: r.account_currency ?? null, impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0),
          updated_at: new Date().toISOString(),
        }),
      );
      url = data.paging?.next ?? null;
    }
  }
  await upsertChunks(db, "meta_spend_daily", rows, "date,campaign_id");
  return rows.length;
}
