/**
 * pnpm seed            → importe seed/*.json dans le Supabase du QG (n'écrase rien d'existant)
 * pnpm seed --reset    → pareil, mais remet les lignes du seed à leur valeur d'origine
 * pnpm seed --sql      → n'écrit rien : affiche le SQL équivalent (à coller dans l'éditeur SQL)
 *
 * Besoin, dans .env.local : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY
 * (la clé « secret » du projet QG, jamais commitée ; inutile avec --sql).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const OS_PROJECT_REF = "mbikecieskoobeizixig"; // projet de l'OS : interdit
const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const SQL_ONLY = args.has("--sql");

try {
  process.loadEnvFile(join(process.cwd(), ".env.local"));
} catch {
  // pas de .env.local : on compte sur les variables déjà présentes
}

type Row = Record<string, unknown>;
type Table = {
  name: string;
  conflict: string;
  /** colonne → type Postgres */
  columns: Record<string, string>;
  rows: Row[];
};

const read = <T>(file: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), "seed", file), "utf8")) as T;

const iso = (ms: unknown): string | null =>
  typeof ms === "number" ? new Date(ms).toISOString() : null;
const blank = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

// ------------------------------------------------------------------ items
type SeedItem = {
  id: string; title: string; bucket: string; owner: string; prio: string;
  parentId: string | null; done: boolean; order: number; createdAt: number; doneAt?: number;
};
const items: Table = {
  name: "items",
  conflict: "id",
  columns: {
    id: "text", title: "text", bucket: "text", owner: "text", prio: "text",
    parent_id: "text", done: "boolean", done_at: "timestamptz",
    sort_order: "double precision", created_at: "timestamptz",
  },
  rows: read<SeedItem[]>("items.json").map((i) => ({
    id: i.id,
    title: i.title,
    bucket: i.bucket,
    owner: i.owner,
    prio: i.prio,
    parent_id: i.parentId,
    done: i.done,
    done_at: iso(i.doneAt),
    sort_order: i.order,
    created_at: iso(i.createdAt),
  })),
};

// -------------------------------------------------------------- decisions
type SeedDecision = { id: string; date: string; title: string; why: string; domain: string; createdAt: number };
const decisions: Table = {
  name: "decisions",
  conflict: "id",
  columns: { id: "text", date: "date", title: "text", why: "text", domain: "text", created_at: "timestamptz" },
  rows: read<SeedDecision[]>("decisions.json").map((d) => ({
    id: d.id, date: d.date, title: d.title, why: blank(d.why), domain: blank(d.domain), created_at: iso(d.createdAt),
  })),
};

// ------------------------------------------------------------------ links
type SeedLink = { id: string; group: string; title: string; url: string; note: string; order: number };
const links: Table = {
  name: "links",
  conflict: "id",
  columns: { id: "text", group: "text", title: "text", url: "text", note: "text", sort_order: "double precision" },
  rows: read<SeedLink[]>("links.json").map((l) => ({
    id: l.id, group: l.group, title: l.title, url: l.url, note: blank(l.note), sort_order: l.order,
  })),
};

// ----------------------------------------------------------------- access
// Aucun secret : seulement où il est rangé.
type SeedAccess = {
  id: string; kind: "access" | "key"; service: string; url?: string; login?: string;
  where?: string; who?: string; twofa?: boolean; usedBy?: string; rotated?: string; createdAt: number;
};
const access: Table = {
  name: "access",
  conflict: "id",
  columns: {
    id: "text", kind: "text", service: "text", url: "text", login_hint: "text",
    secret_location: "text", two_fa: "boolean", who: "text", used_by: "text",
    rotated_at: "date", created_at: "timestamptz",
  },
  rows: read<SeedAccess[]>("access.json").map((a) => ({
    id: a.id,
    kind: a.kind,
    service: a.service,
    url: blank(a.url),
    login_hint: blank(a.login),
    secret_location: blank(a.where),
    two_fa: a.twofa ?? false,
    who: blank(a.who),
    used_by: blank(a.usedBy),
    rotated_at: blank(a.rotated),
    created_at: iso(a.createdAt),
  })),
};

// ---------------------------------------------------------------- metrics
type SeedMetrics = { asOf: string; weeks: { lundi: string }[] };
const metricsRaw = read<SeedMetrics>("metrics.json");
function asOfDate(m: SeedMetrics): string {
  const [day, month] = m.asOf.split("/").map(Number);
  const year = Number((m.weeks.at(-1)?.lundi ?? "").slice(0, 4));
  if (!day || !month || !year) throw new Error(`metrics.json : date « ${m.asOf} » illisible`);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
const metrics: Table = {
  name: "metrics_snapshots",
  conflict: "as_of",
  columns: { as_of: "date", payload: "jsonb", source: "text" },
  rows: [{ as_of: asOfDate(metricsRaw), payload: metricsRaw, source: "seed" }],
};

// ---------------------------------------------------- processes + routines
type SeedProcesses = {
  routines: { id: string; day: number | null; title: string; sub: string; who: string }[];
  processes: { id: string; title: string; meta: string; steps: unknown[]; rules: unknown[] }[];
};
const proc = read<SeedProcesses>("processes.json");
const processes: Table = {
  name: "processes",
  conflict: "id",
  columns: { id: "text", title: "text", meta: "text", steps: "jsonb", rules: "jsonb", sort_order: "double precision" },
  rows: proc.processes.map((p, i) => ({
    id: p.id, title: p.title, meta: p.meta, steps: p.steps, rules: p.rules, sort_order: i + 1,
  })),
};
const routines: Table = {
  name: "routines",
  conflict: "id",
  columns: { id: "text", day: "smallint", title: "text", sub: "text", who: "text", sort_order: "double precision" },
  rows: proc.routines.map((r, i) => ({
    id: r.id, day: r.day, title: r.title, sub: blank(r.sub), who: r.who, sort_order: i + 1,
  })),
};

const legal: Table = { name: "legal", conflict: "id", columns: { id: "boolean" }, rows: [{ id: true }] };

const TABLES = [items, decisions, links, access, metrics, processes, routines, legal];

// -------------------------------------------------------------------- SQL
const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
function toSql(t: Table): string {
  const cols = Object.keys(t.columns);
  const json = JSON.stringify(t.rows);
  const tag = "$seed$";
  if (json.includes(tag)) throw new Error(`${t.name} : le contenu contient ${tag}`);
  const typed = cols.map((c) => `${q(c)} ${t.columns[c]}`).join(", ");
  const updates = cols.filter((c) => c !== t.conflict).map((c) => `${q(c)} = excluded.${q(c)}`);
  const onConflict =
    RESET && updates.length
      ? `on conflict (${q(t.conflict)}) do update set ${updates.join(", ")}`
      : `on conflict (${q(t.conflict)}) do nothing`;
  return [
    `insert into public.${q(t.name)} (${cols.map(q).join(", ")})`,
    `select ${cols.map(q).join(", ")}`,
    `from jsonb_to_recordset(${tag}${json}${tag}::jsonb) as x(${typed})`,
    `${onConflict};`,
  ].join("\n");
}

async function main() {
  if (SQL_ONLY) {
    console.log("begin;\n" + TABLES.map(toSql).join("\n\n") + "\ncommit;");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error(
      "Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY dans .env.local.\n" +
        "Sans clé secrète, utilise : pnpm seed --sql  (puis colle le résultat dans l'éditeur SQL du projet QG).",
    );
    process.exit(1);
  }
  if (url.includes(OS_PROJECT_REF)) {
    console.error("Refusé : cette adresse est celle du projet Supabase de l'OS. Le QG a son propre projet.");
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const t of TABLES) {
    const { error } = await db
      .from(t.name)
      .upsert(t.rows, { onConflict: t.conflict, ignoreDuplicates: !RESET });
    if (error) {
      console.error(`✗ ${t.name} : ${error.message}`);
      process.exit(1);
    }
    const { count } = await db.from(t.name).select("*", { count: "exact", head: true });
    console.log(`✓ ${t.name.padEnd(18)} ${String(t.rows.length).padStart(3)} dans le seed · ${count ?? "?"} en base`);
  }
  console.log(RESET ? "Seed réappliqué (valeurs d'origine)." : "Seed importé (rien d'existant n'a été écrasé).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
