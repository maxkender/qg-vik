-- Dépenses ligne par ligne : d'où vient chaque euro, pour quelle app, quel type (API, abonnement…).
-- Source : Qonto en lecture seule (phase 2) ou saisie à la main. Aucun identifiant bancaire ici.
create table public.expenses (
  id text primary key default gen_random_uuid()::text,
  date date not null,
  vendor text not null,
  label text,
  amount numeric(12, 2) not null,
  currency text not null default 'EUR',
  -- Poste comptable : « Posteurs », « Contenu & IA », « Outils & abonnements »…
  category text,
  kind text not null default 'autre'
    check (kind in ('api', 'abonnement', 'posteurs', 'materiel', 'admin', 'pub', 'transfert', 'autre')),
  app text not null default 'commun'
    check (app in ('sophia', 'micabo', 'unswipe', 'runvik', 'commun')),
  source text not null default 'manual' check (source in ('qonto', 'manual')),
  -- Identifiant de la transaction d'origine, pour ne jamais importer deux fois la même.
  external_id text unique,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (date desc);
create index expenses_app_idx on public.expenses (app);
create index expenses_vendor_idx on public.expenses (vendor);
create trigger expenses_touch before update on public.expenses
  for each row execute function private.touch_updated_at();

-- Règles de rangement automatique : « si le fournisseur contient X → app, poste, type ».
create table public.expense_rules (
  id text primary key default gen_random_uuid()::text,
  pattern text not null,
  category text,
  kind text check (kind in ('api', 'abonnement', 'posteurs', 'materiel', 'admin', 'pub', 'transfert', 'autre')),
  app text check (app in ('sophia', 'micabo', 'unswipe', 'runvik', 'commun')),
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;
alter table public.expense_rules enable row level security;
revoke all on public.expenses, public.expense_rules from anon;
grant select, insert, update, delete on public.expenses, public.expense_rules to authenticated;

create policy "membres : tout" on public.expenses
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.expense_rules
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

alter publication supabase_realtime add table public.expenses, public.expense_rules;
