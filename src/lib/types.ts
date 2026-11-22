import type { Category } from "@/lib/categories";
import type { Owner } from "@/lib/members";

export type Prio = "urgent" | "doing" | "normal";
export type RepeatRule = "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";

export type Item = {
  id: string;
  title: string;
  notes: string | null;
  bucket: string;
  owner: Owner;
  prio: Prio;
  category: Category | null;
  /** Labels libres : Sophia, Micabo, Atala… */
  tags: string[];
  page_id: string | null;
  /** L'app concernée (sa fiche liste ses tâches). */
  app_slug?: string | null;
  /** Heure d'une réunion, « 14:30 ». */
  at_time: string | null;
  meet_url: string | null;
  repeat_rule: RepeatRule | null;
  parent_id: string | null;
  done: boolean;
  done_at: string | null;
  sort_order: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
};

export type Decision = {
  id: string;
  date: string;
  title: string;
  why: string | null;
  domain: string | null;
  app_slug?: string | null;
  created_at: string;
  created_by: string | null;
};

export type LinkRow = {
  id: string;
  group: string;
  title: string;
  url: string;
  note: string | null;
  sort_order: number;
  created_at: string;
};

export type AccessRow = {
  id: string;
  kind: "access" | "key";
  service: string;
  url: string | null;
  login_hint: string | null;
  secret_location: string | null;
  two_fa: boolean;
  who: string | null;
  used_by: string | null;
  rotated_at: string | null;
  account_email: string | null;
  owner: "Max" | "Adrien" | "Vik Studios" | null;
  payment_method: string | null;
  monthly_cost: number | null;
  renewal_date: string | null;
  created_at: string;
};

export type Legal = {
  id: true;
  raison_sociale: string | null;
  forme: string | null;
  siren: string | null;
  siret: string | null;
  tva: string | null;
  siege: string | null;
  date_creation: string | null;
  dirigeant: string | null;
  comptable: string | null;
  banque: string | null;
  nom_commercial: string | null;
  code_ape: string | null;
  capital: string | null;
  ville_rcs: string | null;
  iban: string | null;
  bic: string | null;
  banque_titulaire: string | null;
  banque_domiciliation: string | null;
  vault_url: string | null;
  updated_at: string;
};

export type ExpenseCheck = {
  anomaly_id: string;
  ok: boolean;
  note: string | null;
  checked_by: string | null;
  checked_at: string;
};

export type MetricsWeek = {
  label: string;
  lundi: string;
  rev: number;
  dep: number;
  tresor: number;
  viraux: number;
  vues: number;
  actifs: number;
  kills: number;
  doubles: number;
  sophia: number;
  micabo: number;
  unswipe: number;
  support: number | null;
  partial: boolean;
};
export type MetricsMonth = { label: string; postes: Record<string, number> };
export type MetricsAnomaly = { id: string; vendor: string; mois: string; amount: number; why: string };
export type MetricsCountry = {
  pays: string;
  code: string;
  zone: string;
  verdict: string;
  eur_par_user: number | null;
  revenus_semaine: number | null;
  comptes_actifs: number | null;
  vues_mediane: number | null;
  cout_semaine_usd: number | null;
};
export type MetricsPayload = {
  asOf: string;
  weeks: MetricsWeek[];
  months: MetricsMonth[];
  anomalies: MetricsAnomaly[];
  countries: MetricsCountry[];
  source?: string;
};
export type MetricsSnapshot = {
  id: string;
  as_of: string;
  payload: MetricsPayload;
  source: string;
  created_at: string;
};

export type Actor = "max" | "adrien" | "os" | "hm" | "poster" | "claude" | "both";
export type ProcessStep = {
  kind?: "start" | "gate" | "end";
  title: string;
  who: Actor;
  desc?: string;
  yes?: string;
  no?: string;
};
export type ProcessRow = {
  id: string;
  title: string;
  meta: string | null;
  steps: ProcessStep[];
  rules: [string, string][];
  sort_order: number;
  updated_at: string;
};
export type Routine = {
  id: string;
  day: number | null;
  title: string;
  sub: string | null;
  who: "max" | "adrien" | "both" | "os";
  sort_order: number;
  /** Lien direct vers l'endroit où ça se fait (une page de l'OS, par exemple). */
  url?: string | null;
};

export type PageRow = {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  content: unknown[];
  sort_order: number;
  favorite: boolean;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentRow = {
  id: string;
  page_id: string | null;
  item_id: string | null;
  block_id: string | null;
  parent_id: string | null;
  body: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseKind = "api" | "abonnement" | "posteurs" | "materiel" | "admin" | "pub" | "transfert" | "autre";
export type AppKey = "sophia" | "micabo" | "unswipe" | "runvik" | "commun";
export type Expense = {
  id: string;
  date: string;
  vendor: string;
  label: string | null;
  amount: number;
  currency: string;
  category: string | null;
  kind: ExpenseKind;
  app: AppKey;
  source: "qonto" | "manual";
  external_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};
export type ExpenseRule = {
  id: string;
  pattern: string;
  category: string | null;
  kind: ExpenseKind | null;
  app: AppKey | null;
  sort_order: number;
  created_at: string;
};

export type Profile = { id: string; name: string; short: "max" | "adrien"; color: string; avatar?: string | null };

export type ReadRow = {
  id: string;
  page_id: string;
  for_who: "max" | "adrien";
  note: string | null;
  sent_by: string | null;
  created_at: string;
  read_at: string | null;
};

// ------------------------------------------------ données des vraies sources
export type AppPhase = "preparation" | "test" | "validation" | "croissance";
export type AppRow = {
  slug: string; name: string; revenuecat_project_id: string | null; color: string | null; sort_order: number; active: boolean;
  logo_url: string | null; bundle_id: string | null; os_application_id: string | null; store_url: string | null; repo_url: string | null; notion_url: string | null;
  slack_channel: string | null; phase: AppPhase; launch_date: string | null; pays_cibles: string[]; owner: Owner; created_at?: string;
};
export type SourceName = "revenuecat" | "qonto" | "meta" | "os";
export type SyncRun = { id: string; source: SourceName; started_at: string; finished_at: string | null; ok: boolean | null; rows: number; error: string | null; trigger: string };
export type RcDaily = {
  date: string; app: string; revenue: number | null; new_subs: number | null; trials: number | null; trial_conversions: number | null;
  refunds: number | null; refund_count: number | null; actives: number | null; mrr: number | null; new_customers?: number | null;
};
export type RcCountryWeekly = { week: string; app: string; country: string; country_name: string | null; revenue: number | null; new_users: number | null };
export type CountryVerdict = { code: string; zone: string | null; verdict: string | null };
export type QontoTx = {
  id: string; date: string; amount: number; side: "debit" | "credit"; operation_type: string | null; counterparty: string; label: string | null;
  reference: string | null; qonto_category: string | null; poste: string; app: string | null; poste_locked: boolean;
  /** Remboursement d'un fournisseur : montant négatif, déduit des dépenses de son poste. */
  refund?: boolean;
};
export type QontoBalance = { date: string; balance: number };
export type ExpenseFlag = {
  id: string; kind: "new_vendor" | "unknown_vendor" | "spike" | "big_transfer"; title: string; detail: string | null; vendor: string | null;
  amount: number | null; tx_id: string | null; month: string | null; created_at: string; checked: boolean; checked_by: string | null; checked_at: string | null; comment: string | null;
};
export type MetaSpend = { date: string; campaign_id: string; campaign_name: string | null; app: string | null; spend: number; currency: string | null };
export type OsDaily = {
  date: string; app: string; comptes_actifs: number | null; posts_faits: number | null; posts_prevus: number | null; posts_viraux: number | null;
  vues_total: number | null; vues_mediane: number | null; nouveaux_posteurs: number | null; kills: number | null; doubles: number | null;
  tickets_ouverts: number | null; tickets_resolus: number | null; paie_upwork: number | null; paie_ruul: number | null;
  /** Seulement pour les chiffres repris du seed (pas de détail par post ni par ticket). */
  viraux_pct?: number | null; support_pct?: number | null;
};

export const DOC_CATEGORIES = ["Société", "Fiscal & social", "Banque", "Contrats", "Apps & stores", "Juridique", "Assurances"] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];
export type DocRow = {
  id: string; name: string; category: DocCategory; doc_date: string | null; expires_at: string | null; notes: string | null;
  path: string; mime: string | null; size: number | null; alerted_for: string | null; added_by: string | null; created_at: string;
};
export type DocLog = { id: string; document_id: string | null; document_name: string; action: "ajouté" | "ouvert" | "téléchargé" | "supprimé"; actor: string; at: string };

/** Un retour ou un lien envoyé directement à l'autre membre. */
export type MessageRow = {
  id: string; to_who: "max" | "adrien"; from_who: "max" | "adrien"; body: string | null; url: string | null;
  read_at: string | null; created_by: string | null; created_at: string;
};

/** Une page ou un lien rattaché à une tâche. */
export type ItemLink = { id: string; item_id: string; page_id: string | null; url: string | null; task_id?: string | null; title: string | null; created_by: string | null; created_at: string };

/** Une habitude de la semaine type cochée pour un jour donné. */
export type RoutineCheck = { id: string; routine_id: string; date: string; checked_by: string | null; created_at: string };

/** La couleur choisie pour un label. */
export type TagColor = { name: string; color: string; updated_at: string };

/** Un fichier de la page Ressources (logo, icône d'app, visuel…). */
export type Asset = { id: string; name: string; folder: string; path: string; mime: string | null; size: number | null; added_by: string | null; created_at: string };
