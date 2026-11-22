import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readState, writeState } from "@/lib/agent/state";
import type { Kind } from "@/lib/control/read";

/**
 * OS → control_snapshots. LECTURE SEULE : des GET sur /api/qg/control/* avec l'en-tête x-qg-token.
 * Variables Vercel : OS_QG_TOKEN et OS_API_URL (l'adresse de l'OS : on n'en garde que le domaine).
 */
const ROUTES: Record<Kind, string[]> = { recrutement: ["recruitment", "recrutement"], paie: ["payroll", "paie"], problemes: ["issues", "problems", "problemes"] };
export const KINDS = Object.keys(ROUTES) as Kind[];

export function osBase(): string | null {
  const raw = process.env.OS_QG_BASE_URL || process.env.OS_API_URL || process.env.OS_QG_URL;
  try {
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
}
export const controlReady = () => Boolean(osBase() && process.env.OS_QG_TOKEN);

async function fetchKind(kind: Kind): Promise<unknown> {
  let last = "route introuvable";
  for (const name of ROUTES[kind]) {
    const res = await fetch(`${osBase()}/api/qg/control/${name}`, { headers: { "x-qg-token": process.env.OS_QG_TOKEN!, Accept: "application/json" }, cache: "no-store" });
    if (res.ok) return await res.json();
    last = `réponse ${res.status}`;
    if (res.status !== 404) break;
  }
  throw new Error(`OS /api/qg/control (${kind}) : ${last}`);
}

/** Une photo par onglet. Un onglet en erreur n'empêche pas les autres ; la panne est datée dans sync_state. */
export async function syncControl(db: SupabaseClient) {
  if (!controlReady()) return "non branchée";
  const out: Record<string, string> = {};
  await Promise.all(KINDS.map(async (kind) => {
    const state = await readState(db, `control:${kind}`);
    try {
      const payload = await fetchKind(kind);
      const { error } = await db.from("control_snapshots").insert({ kind, payload });
      if (error) throw new Error(error.message);
      await writeState(db, state, { add: { lus: 1 } });
      out[kind] = "ok";
    } catch (e) {
      await writeState(db, state, { error: e instanceof Error ? e.message : String(e) });
      out[kind] = "erreur";
    }
  }));
  return out;
}
