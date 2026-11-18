"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { startOfDay } from "@/lib/dates";
import type { Owner, Who } from "@/lib/members";
import { useMe } from "@/components/session-provider";

export type WhoFilter = "all" | Who;

type ViewState = {
  /** Filtre « Voir » : tout le monde, Max ou Adrien. */
  who: WhoFilter;
  setWho: (w: WhoFilter) => void;
  /** Une tâche est-elle visible avec le filtre courant ? */
  sees: (owner: Owner) => boolean;
  /** Aujourd'hui à minuit, mis à jour quand le jour change. */
  today: Date;
  quickAddOpen: boolean;
  setQuickAddOpen: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
};

const Ctx = createContext<ViewState | null>(null);

export function useView(): ViewState {
  const v = use(Ctx);
  if (!v) throw new Error("useView doit être utilisé dans <ViewStateProvider>.");
  return v;
}

const KEY = "qg-who";

export function ViewStateProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  // Par défaut on voit ses propres tâches ; le choix est gardé sur l'appareil.
  const [who, setWhoState] = useState<WhoFilter>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "all" || saved === "max" || saved === "adrien") return saved;
    } catch {}
    return me.short;
  });
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const setWho = useCallback((w: WhoFilter) => {
    setWhoState(w);
    try {
      localStorage.setItem(KEY, w);
    } catch {}
  }, []);

  // Le jour change : on recalcule « aujourd'hui » (au retour sur l'onglet et chaque minute).
  useEffect(() => {
    const tick = () => {
      const now = startOfDay(new Date());
      setToday((prev) => (prev.getTime() === now.getTime() ? prev : now));
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const value = useMemo<ViewState>(
    () => ({
      who,
      setWho,
      sees: (owner) => who === "all" || owner === who || owner === "both",
      today,
      quickAddOpen,
      setQuickAddOpen,
      searchOpen,
      setSearchOpen,
    }),
    [who, setWho, today, quickAddOpen, searchOpen],
  );

  return <Ctx value={value}>{children}</Ctx>;
}
