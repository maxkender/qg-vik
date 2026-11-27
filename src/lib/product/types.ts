/** Ce que la page Produit affiche pour une app. Un chiffre inconnu reste à null, jamais à zéro. */
export type Step = { key: string; users: number };
export type FunnelDay = { day: string; started: number; completed: number | null };
export type Funnel = { started: number; completed: number | null; steps: Step[]; daily: FunnelDay[] };

export type Option = { value: string; users: number };
/** `multi` : plusieurs réponses possibles par personne, les parts ne font pas 100 %. */
export type Question = { key: string; answered: number; multi: boolean; options: Option[] };

export const RETENTION_DAYS = [1, 3, 7, 14, 30] as const;
export type RetentionKey = "d1" | "d3" | "d7" | "d14" | "d30";
/** Une cohorte : les personnes arrivées ce jour-là, et celles revenues à J+n (null tant que J+n n'est pas passé). */
export type Cohort = { day: string; size: number } & Record<RetentionKey, number | null>;
export type Retention = { cohorts: Cohort[]; rates: Record<RetentionKey, number | null> };

export type PaywallRow = { id: string; viewers: number; started: number; buyers: number };
export type Paywall = { viewers: number; started: number; buyers: number; rows: PaywallRow[] };

export type Product = {
  app: string;
  days: number;
  from: string;
  to: string;
  /** Dernière donnée reçue de l'app. */
  updated_at: string | null;
  /** Ce qu'on compte : des installations (Sophia) ou des appareils. */
  unit: "installs" | "appareils";
  onboarding: Funnel;
  questions: Question[];
  retention: Retention;
  paywall: Paywall;
};

/** `connected: false` : l'app n'a pas de source, ou ses variables Vercel manquent. */
export type ProductResponse = ({ connected: true } & Product) | { connected: false; reason: string };
