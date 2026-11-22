import type { Owner } from "@/lib/members";
import type { Category } from "@/lib/categories";

/** La checklist « nouvelle app » : 11 tâches créées avec la fiche, réparties entre Max (contenu, recrutement) et Adrien (produit, OS). */
export const NEW_APP_CHECKLIST: { title: (app: string) => string; owner: Owner; category: Category | null }[] = [
  { title: (a) => `${a} : ajouter la clé RevenueCat dans Vercel`, owner: "adrien", category: "produit" },
  { title: (a) => `${a} : vérifier la fiche App Store (captures, description, pays ouverts)`, owner: "adrien", category: "produit" },
  { title: (a) => `${a} : tester le paywall et un achat de bout en bout`, owner: "adrien", category: "produit" },
  { title: (a) => `${a} : créer l'app dans l'OS (labels, pays cibles)`, owner: "adrien", category: "produit" },
  { title: (a) => `${a} : créer le canal Slack et la page Notion`, owner: "adrien", category: "produit" },
  { title: (a) => `${a} : définir 3 labels de contenu à tester`, owner: "max", category: "posts" },
  { title: (a) => `${a} : préparer la réserve de slideshows des 2 premières semaines`, owner: "max", category: "posts" },
  { title: (a) => `${a} : écrire le brief posteurs`, owner: "max", category: "posts" },
  { title: (a) => `${a} : recruter 15 à 20 comptes pour la phase Test`, owner: "max", category: "recrutement" },
  { title: (a) => `${a} : fixer la date de lancement et passer la fiche en Test`, owner: "max", category: "produit" },
  { title: (a) => `${a} : point de contrôle S2 (au moins 1 label à 5 % de viraux)`, owner: "both", category: "reunion" },
];
