/** Postes de dépense et rangement des fournisseurs (partagé entre le serveur et l'écran). */
export const POSTES = [
  "Posteurs", "Contenu & IA", "Outils & abonnements", "Admin & compta",
  "Déplacements & repas", "Matériel", "Transferts", "Autre",
] as const;
export type Poste = (typeof POSTES)[number];

export type VendorRule = { id: string; pattern: string; poste: string; app: string | null; sort_order: number; created_at?: string };

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Première règle dont le motif apparaît, en mot entier, dans le nom de la contrepartie. */
export function matchRule(counterparty: string, rules: VendorRule[]): VendorRule | undefined {
  const v = norm(counterparty);
  return rules.find((r) => {
    const p = norm(r.pattern);
    return p !== "" && new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(v);
  });
}
