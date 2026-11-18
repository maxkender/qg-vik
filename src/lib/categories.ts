/** Les catégories d'une tâche. La couleur sert au petit point devant le nom. */
export const CATEGORIES = [
  { key: "support", label: "Support", color: "var(--viz-1)" },
  { key: "recrutement", label: "Recrutement", color: "var(--viz-3)" },
  { key: "posts", label: "Posts", color: "var(--viz-2)" },
  { key: "legal", label: "Légal", color: "var(--viz-4)" },
  { key: "reunion", label: "Réunion", color: "var(--viz-5)" },
  { key: "finance", label: "Finance", color: "var(--viz-6)" },
  { key: "produit", label: "Produit", color: "var(--both)" },
] as const;

export type Category = (typeof CATEGORIES)[number]["key"];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as Category[];
export const categoryOf = (key: string | null | undefined) => CATEGORIES.find((c) => c.key === key);

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** « #support », « #réunion », « #legal » → la catégorie. Un début de mot suffit (« #recrut »). */
export function parseCategory(word: string): Category | undefined {
  const w = plain(word);
  if (w.length < 3) return undefined;
  return CATEGORIES.find((c) => c.key.startsWith(w) || plain(c.label).startsWith(w))?.key;
}
