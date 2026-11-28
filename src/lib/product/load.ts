import "server-only";
import { readAggregates } from "@/lib/product/aggregates";
import { readEvents } from "@/lib/product/events";
import { SOURCES, appDb, isoDay, sourceReady } from "@/lib/product/sources";
import type { Product, ProductResponse } from "@/lib/product/types";

export const PERIODS = [7, 14, 28];
// Les apps rafraîchissent leurs chiffres toutes les 5 minutes : inutile de les relire plus souvent.
const TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<Product> }>();

export function loadProduct(app: string, days: number): Promise<ProductResponse> {
  const source = SOURCES[app];
  if (!source) return Promise.resolve({ connected: false, reason: "Cette app n'envoie pas encore ses chiffres au QG." });
  if (!sourceReady(app)) return Promise.resolve({ connected: false, reason: `Variables Vercel manquantes : APPDB_${app.toUpperCase()}_URL et APPDB_${app.toUpperCase()}_KEY.` });
  const key = `${app}:${days}`;
  const hit = cache.get(key);
  let value = hit && Date.now() - hit.at < TTL ? hit.value : undefined;
  if (!value) {
    const today = isoDay(new Date());
    const db = appDb(app);
    value = source.kind === "aggregates" ? readAggregates(db, app, source, days, today) : readEvents(db, app, days, today);
    cache.set(key, { at: Date.now(), value });
    // Un échec ne reste pas en mémoire : le prochain appel réessaie.
    value.catch(() => cache.delete(key));
  }
  return value.then((p) => ({ connected: true as const, ...p }));
}
