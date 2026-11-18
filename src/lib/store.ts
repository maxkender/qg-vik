"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Magasin de données temps réel.
 * - chaque table est chargée une fois, puis tenue à jour par Supabase Realtime ;
 * - les écritures sont optimistes : l'écran change tout de suite, la base suit,
 *   et on revient en arrière si la base refuse.
 */

type Row = Record<string, unknown>;
type Listener = () => void;

// ------------------------------------------------------------ état de synchro
export type SyncState = { pending: number; error: string | null; online: boolean; live: boolean };
let sync: SyncState = { pending: 0, error: null, online: true, live: false };
const syncListeners = new Set<Listener>();
const liveByTable = new Map<string, boolean>();
function setSync(patch: Partial<SyncState>) {
  sync = { ...sync, ...patch };
  syncListeners.forEach((l) => l());
}
const SERVER_SYNC: SyncState = { pending: 0, error: null, online: true, live: false };
export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    },
    () => sync,
    () => SERVER_SYNC,
  );
}
if (typeof window !== "undefined") {
  sync = { ...sync, online: navigator.onLine };
  window.addEventListener("online", () => setSync({ online: true }));
  window.addEventListener("offline", () => setSync({ online: false }));
}

const FRIENDLY = "Pas enregistré, réessaie.";

// ------------------------------------------------------------------- tables
export class TableStore<T extends Row> {
  private rows = new Map<string, T>();
  private snapshot: T[] = [];
  private listeners = new Set<Listener>();
  private started = false;
  private channel: RealtimeChannel | null = null;
  loaded = false;

  constructor(
    readonly table: string,
    readonly pk: keyof T & string,
  ) {}

  private key = (row: Row) => String(row[this.pk]);

  private emit() {
    this.snapshot = [...this.rows.values()];
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    this.start();
    return () => {
      this.listeners.delete(l);
    };
  };
  getSnapshot = () => this.snapshot;

  get(id: string): T | undefined {
    return this.rows.get(id);
  }

  private start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    void this.load();
    const supabase = supabaseBrowser();
    this.channel = supabase
      .channel(`qg:${this.table}`)
      .on("postgres_changes", { event: "*", schema: "public", table: this.table }, (payload) => {
        if (payload.eventType === "DELETE") this.rows.delete(this.key(payload.old as Row));
        else this.rows.set(this.key(payload.new as Row), payload.new as T);
        this.emit();
      })
      .subscribe((status) => {
        const live = status === "SUBSCRIBED";
        const was = liveByTable.get(this.table);
        liveByTable.set(this.table, live);
        setSync({ live: [...liveByTable.values()].every(Boolean) });
        // Reconnexion après une coupure : on recharge pour ne rien avoir raté.
        if (live && was === false) void this.load();
      });
  }

  async load() {
    const { data, error } = await supabaseBrowser().from(this.table).select("*");
    if (error) {
      setSync({ error: `Impossible de charger « ${this.table} ».` });
      return;
    }
    this.rows = new Map((data as T[]).map((r) => [this.key(r), r]));
    this.loaded = true;
    this.emit();
  }

  private async write(run: () => PromiseLike<{ error: { message: string } | null }>, undo: () => void) {
    setSync({ pending: sync.pending + 1, error: null });
    let failed = false;
    try {
      const { error } = await run();
      failed = Boolean(error);
    } catch {
      failed = true;
    }
    if (failed) {
      undo();
      this.emit();
    }
    setSync({ pending: Math.max(0, sync.pending - 1), ...(failed ? { error: FRIENDLY } : {}) });
    return !failed;
  }

  insert(row: T): Promise<boolean> {
    const id = this.key(row);
    this.rows.set(id, row);
    this.emit();
    return this.write(
      () => supabaseBrowser().from(this.table).insert(row as never),
      () => this.rows.delete(id),
    );
  }

  update(id: string, patch: Partial<T>): Promise<boolean> {
    const prev = this.rows.get(id);
    if (!prev) return Promise.resolve(false);
    this.rows.set(id, { ...prev, ...patch });
    this.emit();
    return this.write(
      () => supabaseBrowser().from(this.table).update(patch as never).eq(this.pk as string, id),
      () => this.rows.set(id, prev),
    );
  }

  upsert(row: T): Promise<boolean> {
    const id = this.key(row);
    const prev = this.rows.get(id);
    this.rows.set(id, { ...prev, ...row });
    this.emit();
    return this.write(
      () => supabaseBrowser().from(this.table).upsert(row as never, { onConflict: this.pk }),
      () => (prev ? this.rows.set(id, prev) : this.rows.delete(id)),
    );
  }

  remove(id: string): Promise<boolean> {
    const prev = this.rows.get(id);
    if (!prev) return Promise.resolve(false);
    this.rows.delete(id);
    this.emit();
    return this.write(
      () => supabaseBrowser().from(this.table).delete().eq(this.pk as string, id),
      () => this.rows.set(id, prev),
    );
  }
}

const EMPTY: never[] = [];
/** Les lignes d'une table, tenues à jour en direct. */
export function useRows<T extends Row>(store: TableStore<T>): T[] {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY as T[]);
}

export const newId = () => crypto.randomUUID();
