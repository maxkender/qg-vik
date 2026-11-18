import type { Owner } from "@/lib/members";

export type Prio = "urgent" | "normal" | "later";

export type Item = {
  id: string;
  title: string;
  notes: string | null;
  bucket: string;
  owner: Owner;
  prio: Prio;
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

export type Profile = { id: string; name: string; short: "max" | "adrien"; color: string };
