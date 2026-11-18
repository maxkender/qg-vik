import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ce que l'assistant sait : un résumé compact des données du QG, lu avec la session
 * de la personne connectée (donc protégé par la RLS). Aucun secret : il n'y en a pas en base.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Date du jour à Paris, en « jour UTC » pour calculer sans décalage. */
export function todayParis(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  return new Date(`${s}T00:00:00Z`);
}
const mondayOf = (isoDay: string) => {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
};
export function isoWeekKey(d: Date): string {
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - first.getTime()) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `w:${t.getUTCFullYear()}-W${pad(week)}`;
}

type Row = Record<string, unknown>;

/** Lit toutes les lignes d'une requête, par pages de 1000. */
async function all(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await build(from, from + 999);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function buildContext(db: SupabaseClient, me: "max" | "adrien"): Promise<string> {
  const today = todayParis();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - 84);
  const from = mondayOf(iso(since));
  const monthsFrom = `${iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1)))}`;

  const one = async (table: string, select: string, tweak?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = db.from(table).select(select);
    const { data } = await (tweak ? tweak(q) : q);
    return (data ?? []) as Row[];
  };

  const [legal, items, decisions, links, access, documents, pages, routines, processes, apps, verdicts, flags, messages, balance, snapshot, rc, os, countries, tx] = await Promise.all([
    one("legal", "*"),
    one("items", "id,title,notes,bucket,owner,prio,category,page_id,parent_id", (q) => q.eq("done", false).limit(400)),
    one("decisions", "date,title,why,domain", (q) => q.order("date", { ascending: false }).limit(40)),
    one("links", "group,title,url,note"),
    one("access", "kind,service,url,login_hint,secret_location,two_fa,who,used_by,rotated_at,owner,payment_method,monthly_cost,renewal_date"),
    one("documents", "name,category,doc_date,expires_at,notes"),
    one("pages", "id,title,updated_at", (q) => q.is("archived_at", null).order("updated_at", { ascending: false }).limit(200)),
    one("routines", "day,title,sub,who"),
    one("processes", "title,meta"),
    one("apps", "key,name,active"),
    one("country_verdicts", "code,zone,verdict"),
    one("expense_flags", "title,detail,amount,month", (q) => q.eq("checked", false).limit(60)),
    one("messages", "from_who,body,url,created_at", (q) => q.eq("to_who", me).is("read_at", null).limit(30)),
    one("qonto_balance_daily", "date,balance", (q) => q.order("date", { ascending: false }).limit(1)),
    one("metrics_snapshots", "as_of,payload", (q) => q.order("as_of", { ascending: false }).limit(1)),
    all((a, b) => db.from("rc_daily").select("date,app,revenue,new_subs,trials,trial_conversions,refunds,actives,mrr").gte("date", from).order("date").range(a, b)),
    all((a, b) => db.from("os_daily").select("*").gte("date", from).order("date").range(a, b)),
    all((a, b) => db.from("rc_country_weekly").select("week,app,country,country_name,revenue,new_users").gte("week", mondayOf(iso(new Date(today.getTime() - 35 * 864e5)))).order("week").range(a, b)),
    all((a, b) => db.from("qonto_transactions").select("date,amount,side,counterparty,poste,app").gte("date", monthsFrom).order("date").range(a, b)),
  ]);

  // Revenus et paywall par semaine et par app.
  const weekly = new Map<string, Row>();
  for (const r of rc) {
    const key = `${mondayOf(String(r.date))}|${r.app}`;
    const w = weekly.get(key) ?? { semaine_du: mondayOf(String(r.date)), app: r.app, revenus: 0, nouveaux_abonnes: 0, essais: 0, essais_convertis: 0, remboursements: 0, mrr: null, abonnes_actifs: null };
    w.revenus = round(num(w.revenus) + num(r.revenue));
    w.nouveaux_abonnes = num(w.nouveaux_abonnes) + num(r.new_subs);
    w.essais = num(w.essais) + num(r.trials);
    w.essais_convertis = num(w.essais_convertis) + num(r.trial_conversions);
    w.remboursements = round(num(w.remboursements) + num(r.refunds));
    if (r.mrr !== null) w.mrr = num(r.mrr);
    if (r.actives !== null) w.abonnes_actifs = num(r.actives);
    weekly.set(key, w);
  }

  // Contenu (OS). Tant que l'OS n'est pas branché, on reprend le dernier relevé manuel.
  let contenu: unknown;
  if (os.length) {
    const byWeek = new Map<string, Row>();
    for (const r of os) {
      const key = `${mondayOf(String(r.date))}|${r.app}`;
      const w = byWeek.get(key) ?? { semaine_du: mondayOf(String(r.date)), app: r.app, vues: 0, posts_faits: 0, posts_viraux: 0, kills: 0, doubles: 0, nouveaux_posteurs: 0, tickets_ouverts: 0, tickets_resolus: 0, comptes_actifs: null };
      w.vues = num(w.vues) + num(r.vues_total);
      w.posts_faits = num(w.posts_faits) + num(r.posts_faits);
      w.posts_viraux = num(w.posts_viraux) + num(r.posts_viraux);
      w.kills = num(w.kills) + num(r.kills);
      w.doubles = num(w.doubles) + num(r.doubles);
      w.nouveaux_posteurs = num(w.nouveaux_posteurs) + num(r.nouveaux_posteurs);
      w.tickets_ouverts = num(w.tickets_ouverts) + num(r.tickets_ouverts);
      w.tickets_resolus = num(w.tickets_resolus) + num(r.tickets_resolus);
      if (r.comptes_actifs !== null) w.comptes_actifs = num(r.comptes_actifs);
      byWeek.set(key, w);
    }
    contenu = { source: "OS, synchronisé", semaines: [...byWeek.values()] };
  } else {
    const p = snapshot[0]?.payload as { asOf?: string; weeks?: Row[] } | undefined;
    contenu = {
      source: `relevé manuel du ${p?.asOf ?? "?"} (l'OS n'est pas encore branché : pas de chiffres plus récents)`,
      semaines: (p?.weeks ?? []).slice(-8).map((w) => ({ semaine: w.label, lundi: w.lundi, vues: w.vues, pct_posts_viraux: w.viraux, comptes_actifs: w.actifs, kills: w.kills, doubles: w.doubles, pct_tickets_resolus: w.support, semaine_incomplete: w.partial })),
    };
  }

  // Pays : 4 dernières semaines pleines.
  const verdictOf = new Map(verdicts.map((v) => [String(v.code), v]));
  const byCountry = new Map<string, { pays: string; code: string; revenus: number; nouveaux_utilisateurs: number }>();
  const thisMonday = mondayOf(iso(today));
  for (const r of countries) {
    if (String(r.week) >= thisMonday) continue;
    const c = byCountry.get(String(r.country)) ?? { pays: String(r.country_name ?? r.country), code: String(r.country), revenus: 0, nouveaux_utilisateurs: 0 };
    c.revenus = round(c.revenus + num(r.revenue));
    c.nouveaux_utilisateurs += num(r.new_users);
    byCountry.set(c.code, c);
  }
  const pays = [...byCountry.values()]
    .sort((a, b) => b.revenus - a.revenus)
    .slice(0, 45)
    .map((c) => ({ ...c, eur_par_utilisateur: c.nouveaux_utilisateurs > 0 ? round(c.revenus / c.nouveaux_utilisateurs) : null, zone: verdictOf.get(c.code)?.zone ?? null, verdict: verdictOf.get(c.code)?.verdict ?? null }));

  // Dépenses nettes par mois et par poste (les remboursements d'un fournisseur sont déduits).
  const depenses = new Map<string, Record<string, number>>();
  const fournisseurs = new Map<string, number>();
  const thisMonth = iso(today).slice(0, 7);
  for (const t of tx) {
    const refund = t.side === "credit" && t.poste !== "Autre";
    if (t.side !== "debit" && !refund) continue;
    const amount = refund ? -Math.abs(num(t.amount)) : Math.abs(num(t.amount));
    const month = String(t.date).slice(0, 7);
    const m = depenses.get(month) ?? {};
    m[String(t.poste)] = round((m[String(t.poste)] ?? 0) + amount);
    depenses.set(month, m);
    if (month === thisMonth) fournisseurs.set(String(t.counterparty), round((fournisseurs.get(String(t.counterparty)) ?? 0) + amount));
  }

  const data = {
    aujourd_hui: iso(today),
    semaine_en_cours: isoWeekKey(today).slice(2),
    fiche_societe: legal[0] ?? null,
    apps,
    taches_ouvertes: items,
    semaine_type: routines,
    process: processes,
    decisions,
    liens: links,
    comptes_et_cles: access,
    documents,
    pages,
    messages_non_lus_pour_moi: messages,
    tresorerie: balance[0] ?? null,
    revenus_et_paywall_par_semaine: [...weekly.values()],
    contenu,
    pays_4_dernieres_semaines: pays,
    depenses_par_mois_et_poste: Object.fromEntries(depenses),
    top_fournisseurs_ce_mois: [...fournisseurs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    depenses_a_verifier: flags,
  };
  return JSON.stringify(data);
}

/** Le texte d'une page (blocs BlockNote) pour que l'assistant puisse la lire. */
export function blocksToText(blocks: unknown, depth = 0): string {
  if (!Array.isArray(blocks) || depth > 6) return "";
  return blocks
    .map((b) => {
      const block = b as { content?: unknown; children?: unknown; props?: { title?: string } };
      const line = Array.isArray(block.content) ? block.content.map((c) => (c as { text?: string }).text ?? "").join("") : (block.props?.title ?? "");
      return [line, blocksToText(block.children, depth + 1)].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n");
}
