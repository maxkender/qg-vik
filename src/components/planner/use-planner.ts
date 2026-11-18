"use client";

import { useMemo } from "react";
import { useView } from "@/components/app/view-state";
import { commentsStore, itemsStore } from "@/lib/data";
import { byOrder } from "@/lib/items";
import { useRows } from "@/lib/store";
import type { Item } from "@/lib/types";

/** Les tâches prêtes à afficher : racines visibles (filtre « Voir »), sous-objectifs, nombre de commentaires. */
export function usePlanner() {
  const all = useRows(itemsStore);
  const comments = useRows(commentsStore);
  const { sees } = useView();

  return useMemo(() => {
    const kidsOf = new Map<string, Item[]>();
    const roots: Item[] = [];
    for (const item of all) {
      if (item.parent_id) {
        const list = kidsOf.get(item.parent_id);
        if (list) list.push(item);
        else kidsOf.set(item.parent_id, [item]);
      } else if (sees(item.owner)) {
        roots.push(item);
      }
    }
    roots.sort(byOrder);

    const commentsOf = new Map<string, number>();
    for (const c of comments) {
      if (c.item_id && !c.resolved_at) commentsOf.set(c.item_id, (commentsOf.get(c.item_id) ?? 0) + 1);
    }

    const inBucket = (bucket: string) => roots.filter((i) => i.bucket === bucket);
    return { all, roots, kidsOf, commentsOf, inBucket, loaded: itemsStore.loaded };
  }, [all, comments, sees]);
}

/** Déplace une tâche (et ses sous-objectifs) vers un horizon, à une position donnée. */
export function moveToBucket(item: Item, bucket: string, sortOrder: number, kids: Item[]) {
  void itemsStore.update(item.id, { bucket, sort_order: sortOrder });
  if (bucket !== item.bucket) kids.forEach((k) => void itemsStore.update(k.id, { bucket }));
}
