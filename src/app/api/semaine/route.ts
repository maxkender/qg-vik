import { NextResponse } from "next/server";
import { todayParis } from "@/lib/assistant/context";
import { requireMember } from "@/lib/sync/guard";
import { supabaseServer } from "@/lib/supabase/server";
import { addDaysIso, buildWeekReport, mondayOf, mondayOfWeekKey, type WeekInput } from "@/lib/week/report";

export const maxDuration = 60;

type Row = Record<string, unknown>;

/** Le rapport d'une semaine (« ?s=2026-W46 »). Sans paramètre : la dernière semaine pleine. */
export async function GET(request: Request) {
  const denied = await requireMember();
  if (denied) return denied;
  const db = await supabaseServer();

  const today = todayParis().toISOString().slice(0, 10);
  const lastFull = addDaysIso(mondayOf(today), -7);
  const params = new URL(request.url).searchParams;
  const asked = params.get("s");
  const week = (asked && mondayOfWeekKey(asked)) || lastFull;
  const from = addDaysIso(week, -28);
  const to = addDaysIso(week, 6);

  // Lit toutes les lignes d'une requête, par pages de 1 000.
  async function all(build: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<Row[]> {
    const out: Row[] = [];
    for (let i = 0; i < 200_000; i += 1000) {
      const { data, error } = await build(i, i + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as Row[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  try {
    const [apps, rc, rcCountry, tx, posts, accounts, reserve, costs, osDaily, verdicts, snapshot, rates] = await Promise.all([
      all((a, b) => db.from("apps").select("key,name,sort_order").eq("active", true).order("sort_order").range(a, b)),
      all((a, b) => db.from("rc_daily").select("date,app,revenue,new_subs,trials,trial_conversions,refunds").gte("date", from).lte("date", to).order("date").range(a, b)),
      all((a, b) => db.from("rc_country_weekly").select("week,app,country,country_name,revenue,new_users,trials").gte("week", from).lte("week", week).order("week").range(a, b)),
      all((a, b) => db.from("qonto_transactions").select("date,amount,side").eq("poste", "Posteurs").gte("date", from).lte("date", to).order("date").range(a, b)),
      all((a, b) => db.from("os_posts_daily").select("date,account,app,label,country,lang,posts_published,posts_planned,views,post_views,best_post_views,best_post_url,best_post_thumb,followers_gained").gte("date", from).lte("date", to).order("date").order("account").range(a, b)),
      all((a, b) => db.from("os_accounts_daily").select("date,app,label,country,active_accounts").gte("date", week).lte("date", to).order("date").range(a, b)),
      all((a, b) => db.from("os_reserve_daily").select("date,label,lang,ready").gte("date", addDaysIso(to, -7)).lte("date", to).order("date").range(a, b)),
      all((a, b) => db.from("os_cost_weekly").select("week,country,cost_usd").gte("week", from).lte("week", week).range(a, b)),
      all((a, b) => db.from("os_daily").select("date,app,comptes_actifs,posts_faits,posts_prevus,posts_viraux,vues_total,vues_mediane").gte("date", from).lte("date", to).order("date").range(a, b)),
      all((a, b) => db.from("country_verdicts").select("code,zone,verdict").range(a, b)),
      all((a, b) => db.from("metrics_snapshots").select("payload").order("as_of", { ascending: false }).limit(1).range(a, Math.min(b, a))),
      all((a, b) => db.from("zone_rates").select("zone,usd_per_account_week").range(a, b)),
    ]);

    const payload = snapshot[0]?.payload as { asOf?: string; weeks?: unknown[]; countries?: unknown[] } | undefined;
    const input: WeekInput = {
      week,
      app: apps.some((a) => a.key === params.get("app")) ? params.get("app") : null,
      zoneRates: Object.fromEntries(rates.map((r) => [String(r.zone), Number(r.usd_per_account_week)])),
      apps: apps as WeekInput["apps"],
      rc: rc as WeekInput["rc"],
      rcCountry: rcCountry as WeekInput["rcCountry"],
      posterCosts: tx.map((t) => ({ date: String(t.date), amount: (t.side === "credit" ? -1 : 1) * Math.abs(Number(t.amount)) })),
      posts: posts.map((p) => ({ ...p, views: Number(p.views), post_views: (p.post_views as number[] | null) ?? [] })) as WeekInput["posts"],
      accounts: accounts as WeekInput["accounts"],
      reserve: reserve as WeekInput["reserve"],
      costs: costs.map((c) => ({ ...c, cost_usd: Number(c.cost_usd) })) as WeekInput["costs"],
      osDaily: osDaily as WeekInput["osDaily"],
      verdicts: verdicts as WeekInput["verdicts"],
      seed: payload?.weeks ? { asOf: payload.asOf ?? "?", weeks: payload.weeks as never, countries: (payload.countries ?? []) as never } : null,
      usdToEur: Number(process.env.USD_TO_EUR) || 0.92,
    };
    const report = buildWeekReport(input);
    return NextResponse.json({ ...report, complete: to < today, lastFull: lastFull, usdToEur: input.usdToEur }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("semaine:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Impossible de calculer la semaine." }, { status: 500 });
  }
}
