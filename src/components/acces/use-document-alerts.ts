"use client";

import { useEffect } from "react";
import { expiryState } from "@/components/acces/documents";
import { useMe } from "@/components/session-provider";
import { documentsStore } from "@/lib/data";
import { dayKey } from "@/lib/dates";
import { shortDate } from "@/lib/format";
import { useRows } from "@/lib/store";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Un document qui expire dans 30 jours (ou déjà expiré) crée une tâche « Urgent » dans la to-do,
 * une seule fois par date d'expiration. L'identifiant de la tâche est fixé d'avance : même si
 * Max et Adrien ouvrent le QG en même temps, elle n'est créée qu'une fois.
 */
export function useDocumentAlerts() {
  const me = useMe();
  const docs = useRows(documentsStore);
  useEffect(() => {
    docs
      .filter((d) => d.expires_at && expiryState(d) && d.alerted_for !== d.expires_at)
      .forEach((d) => {
        const expired = expiryState(d) === "expired";
        void supabaseBrowser()
          .from("items")
          .upsert(
            {
              id: `doc-${d.id}-${d.expires_at}`,
              title: `Renouveler : ${d.name} (${expired ? "expiré" : "expire"} le ${shortDate(d.expires_at!)})`,
              notes: `Document de la page Légal & accès, catégorie ${d.category}. Ajoute la nouvelle version puis coche cette tâche.`,
              bucket: dayKey(new Date()),
              owner: "both",
              prio: "urgent",
              sort_order: Date.now(),
              created_by: me.id,
            },
            { onConflict: "id", ignoreDuplicates: true },
          )
          .then(({ error }) => {
            if (!error) void documentsStore.update(d.id, { alerted_for: d.expires_at });
          });
      });
  }, [docs, me.id]);
}
