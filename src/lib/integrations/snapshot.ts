import "server-only";
import { createClient } from "@supabase/supabase-js";
import { qontoAccounts, qontoConfigured, qontoDebits } from "@/lib/integrations/qonto";
import { RC_APPS, countryRevenue, rcConfigured, weeklyRevenue, type RcApp } from "@/lib/integrations/revenuecat";
import type { ExpenseKind, ExpenseRule, MetricsPayload, MetricsWeek } from "@/lib/types";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
function mondayUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return addDays(x, -((x.getUTCDay() + 6) % 7));
}
function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

export type IntegrationStatus = { qonto: boolean; revenuecat: Record<RcApp, boolean>; base: boolean; missing: string[] };

export function integrationStatus(): IntegrationStatus {
  const rc = rcConfigured();
  const base = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  const missing: string[] = [];
  if (!base) missing.push("SUPABASE_SECRET_KEY");
  if (!qontoConfigured()) missing.push("QONTO_LOGIN", "QONTO_SECRET_KEY");
  RC_APPS.forEach((a) => !rc[a] && missing.push(`REVENUECAT_KEY_${a.toUpperCase()}`));
  return { qonto: qontoConfigured(), revenuecat: rc, base, missing };
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// RevenueCat nomme les pays en anglais ; le snapshot les garde en français avec leur code ISO.
const EN = new Intl.DisplayNames(["en"], { type: "region" });
const ALIASES: Record<string, string[]> = { TR: ["turkey", "turkiye"], US: ["united states", "usa"], GB: ["united kingdom", "uk"], KR: ["south korea"], CZ: ["czechia", "czech republic"] };
function countryNames(code: string, pays: string): Set<string> {
  const out = new Set<string>([norm(pays), norm(code), ...(ALIASES[code] ?? [])]);
  try {
    out.add(norm(EN.of(code) ?? ""));
  } catch {}
  return out;
}

function matchRule(vendor: string, rules: ExpenseRule[]) {
  const v = norm(vendor);
  return rules.find((r) => {
    const p = norm(r.pattern).trim();
    return p && new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(v);
  });
}

/**
 * Construit un nouveau snapshot du dashboard à partir de RevenueCat et de Qonto (lecture seule),
 * importe les nouvelles dépenses, et écrit le tout dans la base du QG.
 * Les chiffres qui viennent de l'OS (vues, posts viraux, comptes, kills, support) sont repris
 * du snapshot précédent quand la semaine existe déjà, sinon laissés vides.
 */
export async function refreshSnapshot(source: "cron" | "manuel") {
  const status = integrationStatus();
  if (!status.base) return { ok: false as const, status, error: "La clé serveur de la base (SUPABASE_SECRET_KEY) n'est pas configurée." };
  if (!status.qonto && !Object.values(status.revenuecat).some(Boolean)) {
    return { ok: false as const, status, error: "Ni Qonto ni RevenueCat ne sont configurés." };
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: last } = await db.from("metrics_snapshots").select("payload").order("as_of", { ascending: false }).limit(1).maybeSingle();
  const prev = (last?.payload ?? { asOf: "", weeks: [], months: [], anomalies: [], countries: [] }) as MetricsPayload;

  const now = new Date();
  const thisMonday = mondayUtc(now);
  const mondays = [-4, -3, -2, -1, 0].map((i) => addDays(thisMonday, i * 7));
  const start = iso(mondays[0]);
  const end = iso(now);
  const warnings: string[] = [];

  // ---------------------------------------------------------- RevenueCat
  const rev: Record<RcApp, Map<string, number>> = { sophia: new Map(), micabo: new Map(), unswipe: new Map() };
  for (const app of RC_APPS) {
    if (!status.revenuecat[app]) continue;
    try {
      (await weeklyRevenue(app, start, end)).forEach((w) => rev[app].set(w.lundi, w.revenue));
    } catch (e) {
      warnings.push(String((e as Error).message));
    }
  }
  let countryRev: { country: string; revenue: number }[] | null = null;
  if (status.revenuecat.sophia) {
    try {
      // Moyenne par semaine sur les 4 dernières semaines pleines.
      countryRev = (await countryRevenue("sophia", iso(mondays[0]), iso(addDays(thisMonday, -1)))).map((c) => ({ ...c, revenue: c.revenue / 4 }));
    } catch (e) {
      warnings.push(String((e as Error).message));
    }
  }

  // --------------------------------------------------------------- Qonto
  let tresor: number | null = null;
  const depByWeek = new Map<string, number>();
  let imported = 0;
  if (status.qonto) {
    try {
      tresor = (await qontoAccounts()).reduce((a, b) => a + Number(b.balance), 0);
      const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
      const debits = await qontoDebits(since.toISOString());
      debits.forEach((d) => {
        const k = iso(mondayUtc(new Date(d.date + "T00:00:00Z")));
        depByWeek.set(k, (depByWeek.get(k) ?? 0) + d.amount);
      });
      const { data: rules } = await db.from("expense_rules").select("*").order("sort_order");
      const rows = debits.map((d) => {
        const r = matchRule(d.vendor, (rules ?? []) as ExpenseRule[]);
        return {
          date: d.date, vendor: d.vendor, label: d.label, amount: d.amount, currency: d.currency,
          category: r?.category ?? null, kind: (r?.kind ?? "autre") as ExpenseKind, app: r?.app ?? "commun",
          source: "qonto", external_id: d.id,
        };
      });
      if (rows.length) {
        // Les lignes déjà importées (même identifiant de transaction) ne sont pas touchées.
        const { data: inserted, error } = await db.from("expenses").upsert(rows, { onConflict: "external_id", ignoreDuplicates: true }).select("id");
        if (error) warnings.push(`Dépenses : ${error.message}`);
        imported = inserted?.length ?? 0;
      }
    } catch (e) {
      warnings.push(String((e as Error).message));
    }
  }

  // ------------------------------------------------------------- semaines
  const prevByMonday = new Map(prev.weeks.map((w) => [w.lundi, w]));
  const weeks: MetricsWeek[] = mondays.map((m, i) => {
    const lundi = iso(m);
    const old = prevByMonday.get(lundi);
    const partial = i === mondays.length - 1;
    const get = (app: RcApp) => (status.revenuecat[app] && rev[app].has(lundi) ? Math.round(rev[app].get(lundi)!) : (old?.[app] ?? 0));
    const sophia = get("sophia"), micabo = get("micabo"), unswipe = get("unswipe");
    const anyRc = RC_APPS.some((a) => status.revenuecat[a]);
    return {
      label: `S${isoWeekNumber(m)}${partial ? "*" : ""}`,
      lundi,
      rev: anyRc ? sophia + micabo + unswipe : (old?.rev ?? 0),
      dep: status.qonto && depByWeek.has(lundi) ? Math.round(depByWeek.get(lundi)!) : (old?.dep ?? 0),
      tresor: partial && tresor !== null ? Math.round(tresor) : (old?.tresor ?? 0),
      // Chiffres de l'OS : repris tels quels s'ils existent déjà pour cette semaine.
      viraux: old?.viraux ?? (null as unknown as number),
      vues: old?.vues ?? (null as unknown as number),
      actifs: old?.actifs ?? (null as unknown as number),
      kills: old?.kills ?? (null as unknown as number),
      doubles: old?.doubles ?? (null as unknown as number),
      support: old?.support ?? null,
      sophia, micabo, unswipe,
      partial,
    };
  });

  // ----------------------------------------------------------------- mois
  let months = prev.months;
  if (status.qonto) {
    const from = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)));
    const { data: exp } = await db.from("expenses").select("date, amount, category").gte("date", from);
    if (exp?.length) {
      const map = new Map<string, Record<string, number>>();
      exp.forEach((e) => {
        const key = String(e.date).slice(0, 7);
        const postes = map.get(key) ?? {};
        const poste = e.category || "Autres";
        postes[poste] = Math.round((postes[poste] ?? 0) + Number(e.amount));
        map.set(key, postes);
      });
      const current = iso(now).slice(0, 7);
      months = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, postes]) => ({
        label: MONTHS[Number(k.slice(5, 7)) - 1] + (k === current ? ` (au ${now.getUTCDate()})` : ""),
        postes,
      }));
    }
  }

  // ----------------------------------------------------------------- pays
  const countries = countryRev
    ? prev.countries.map((c) => {
        const names = countryNames(c.code, c.pays);
        const hit = countryRev!.find((x) => names.has(norm(x.country)));
        return hit ? { ...c, revenus_semaine: Math.round(hit.revenue) } : c;
      })
    : prev.countries;

  const dd = String(now.getUTCDate()).padStart(2, "0") + "/" + String(now.getUTCMonth() + 1).padStart(2, "0");
  const payload: MetricsPayload = { ...prev, asOf: dd, weeks, months, countries };
  const { error } = await db.from("metrics_snapshots").upsert({ as_of: iso(now), payload, source }, { onConflict: "as_of" });
  if (error) return { ok: false as const, status, error: `Snapshot non enregistré : ${error.message}` };
  return { ok: true as const, status, as_of: iso(now), imported, warnings };
}
