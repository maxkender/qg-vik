-- Données venues des vraies sources (RevenueCat, Qonto, Meta, OS), rangées dans la base du QG.
-- Le QG ne fait que LIRE ces sources. Ces tables sont écrites par le serveur (clé secrète) ;
-- l'app les lit, et ne modifie que les règles, les postes et les cases « vérifié ».

create table public.apps (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  name text not null,
  rc_project_id text,
  color text,
  sort_order double precision not null default 0,
  active boolean not null default true
);
comment on table public.apps is 'Les apps suivies. La clé RevenueCat de chacune est dans la variable REVENUECAT_KEY_<KEY>.';
insert into public.apps (key, name, rc_project_id, color, sort_order) values
  ('sophia', 'Sophia', 'proj3f496a80', 'viz-1', 1),
  ('micabo', 'Micabo', 'proj415c7a8d', 'viz-4', 2),
  ('unswipe', 'Unswipe', 'proj5556884d', 'viz-5', 3);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('revenuecat', 'qonto', 'meta', 'os')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  rows integer not null default 0,
  error text,
  trigger text not null default 'manuel'
);
create index sync_runs_source_idx on public.sync_runs (source, started_at desc);

create table public.rc_daily (
  date date not null,
  app text not null,
  revenue numeric(14, 2),
  new_subs integer,
  trials integer,
  trial_conversions integer,
  refunds numeric(14, 2),
  refund_count integer,
  actives integer,
  mrr numeric(14, 2),
  updated_at timestamptz not null default now(),
  primary key (date, app)
);

create table public.rc_country_weekly (
  week date not null,
  app text not null,
  country text not null,
  country_name text,
  revenue numeric(14, 2),
  new_users integer,
  updated_at timestamptz not null default now(),
  primary key (week, app, country)
);

create table public.country_verdicts (
  code text primary key,
  zone text,
  verdict text check (verdict in ('Recruter', 'Garder', 'À corriger', 'Couper'))
);

create table public.qonto_transactions (
  id text primary key,
  transaction_id text,
  date date not null,
  settled_at timestamptz,
  emitted_at timestamptz,
  amount numeric(14, 2) not null,
  side text not null check (side in ('debit', 'credit')),
  operation_type text,
  currency text not null default 'EUR',
  local_amount numeric(14, 2),
  local_currency text,
  counterparty text not null,
  label text,
  reference text,
  note text,
  qonto_category text,
  status text,
  settled_balance numeric(14, 2),
  poste text not null default 'Autre',
  app text,
  -- Poste choisi à la main dans le QG : la synchro n'y touche plus.
  poste_locked boolean not null default false,
  updated_at timestamptz not null default now()
);
create index qonto_tx_date_idx on public.qonto_transactions (date desc);
create index qonto_tx_counterparty_idx on public.qonto_transactions (counterparty);

create table public.qonto_balance_daily (
  date date primary key,
  balance numeric(14, 2) not null
);

create table public.vendor_rules (
  id text primary key default gen_random_uuid()::text,
  pattern text not null,
  poste text not null,
  app text,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);
insert into public.vendor_rules (id, pattern, poste, sort_order) values
  ('vr-upwork', 'upwork', 'Posteurs', 1), ('vr-ruul', 'ruul', 'Posteurs', 2),
  ('vr-anthropic', 'anthropic', 'Contenu & IA', 10), ('vr-claude', 'claude', 'Contenu & IA', 11), ('vr-fal', 'fal', 'Contenu & IA', 12),
  ('vr-elevenlabs', 'elevenlabs', 'Contenu & IA', 13), ('vr-apify', 'apify', 'Contenu & IA', 14),
  ('vr-higgsfield', 'higgsfield', 'Contenu & IA', 15), ('vr-replicate', 'replicate', 'Contenu & IA', 16),
  ('vr-revenuecat', 'revenuecat', 'Outils & abonnements', 20), ('vr-lovable', 'lovable', 'Outils & abonnements', 21),
  ('vr-supabase', 'supabase', 'Outils & abonnements', 22), ('vr-cursor', 'cursor', 'Outils & abonnements', 23),
  ('vr-notion', 'notion', 'Outils & abonnements', 24), ('vr-vercel', 'vercel', 'Outils & abonnements', 25),
  ('vr-gworkspace', 'google workspace', 'Outils & abonnements', 26), ('vr-brevo', 'brevo', 'Outils & abonnements', 27),
  ('vr-gcloud', 'google cloud', 'Outils & abonnements', 28),
  ('vr-dougs', 'dougs', 'Admin & compta', 40), ('vr-impact', 'impact audit', 'Admin & compta', 41),
  ('vr-urssaf', 'urssaf', 'Admin & compta', 42), ('vr-qonto', 'qonto', 'Admin & compta', 43);

create table public.expense_flags (
  id text primary key,
  kind text not null check (kind in ('new_vendor', 'unknown_vendor', 'spike', 'big_transfer')),
  title text not null,
  detail text,
  vendor text,
  amount numeric(14, 2),
  tx_id text,
  month text,
  created_at timestamptz not null default now(),
  checked boolean not null default false,
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz,
  comment text
);
create index expense_flags_checked_by_idx on public.expense_flags (checked_by);

create table public.meta_spend_daily (
  date date not null,
  campaign_id text not null,
  account_id text,
  campaign_name text,
  app text,
  spend numeric(14, 2) not null default 0,
  currency text,
  impressions bigint,
  clicks bigint,
  updated_at timestamptz not null default now(),
  primary key (date, campaign_id)
);

create table public.os_daily (
  date date not null,
  app text not null,
  comptes_actifs integer,
  posts_faits integer,
  posts_prevus integer,
  posts_viraux integer,
  vues_total bigint,
  vues_mediane numeric(14, 2),
  nouveaux_posteurs integer,
  kills integer,
  doubles integer,
  tickets_ouverts integer,
  tickets_resolus integer,
  paie_upwork numeric(14, 2),
  paie_ruul numeric(14, 2),
  updated_at timestamptz not null default now(),
  primary key (date, app)
);

do $$
declare t text;
begin
  foreach t in array array['apps', 'sync_runs', 'rc_daily', 'rc_country_weekly', 'country_verdicts', 'qonto_transactions',
                           'qonto_balance_daily', 'vendor_rules', 'expense_flags', 'meta_spend_daily', 'os_daily'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy "membres : lire" on public.%I for select to authenticated using ((select private.is_member()))', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

-- Ce que les membres peuvent modifier depuis le QG.
grant insert, update, delete on public.vendor_rules, public.apps, public.country_verdicts to authenticated;
create policy "membres : écrire" on public.vendor_rules for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : écrire" on public.apps for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : écrire" on public.country_verdicts for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

grant update (checked, checked_by, checked_at, comment) on public.expense_flags to authenticated;
create policy "membres : vérifier" on public.expense_flags for update to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

grant update (poste, app, poste_locked) on public.qonto_transactions to authenticated;
create policy "membres : ranger" on public.qonto_transactions for update to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
