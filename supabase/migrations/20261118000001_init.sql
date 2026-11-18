-- QG Vik Studios — schéma initial
-- Règles : RLS partout, seuls les 2 membres (table profiles) lisent et écrivent.
-- Aucune colonne ne contient de mot de passe ni de clé API.

create schema if not exists private;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  short text not null unique check (short in ('max', 'adrien')),
  color text not null,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Les 2 membres du QG. Créés côté serveur uniquement (liste blanche ALLOWED_EMAILS).';

-- Vrai si la personne connectée est un des 2 membres.
create function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
  );
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------- items
-- Tâches et objectifs : un seul modèle, comme dans Timestripe.
create table public.items (
  id text primary key default gen_random_uuid()::text,
  title text not null default '',
  notes text,
  bucket text not null default 'inbox'
    check (bucket ~ '^(inbox|life|d:\d{4}-\d{2}-\d{2}|w:\d{4}-W\d{2}|m:\d{4}-\d{2}|y:\d{4})$'),
  owner text not null default 'both' check (owner in ('max', 'adrien', 'both')),
  prio text not null default 'normal' check (prio in ('urgent', 'normal', 'later')),
  parent_id text references public.items (id) on delete cascade,
  done boolean not null default false,
  done_at timestamptz,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index items_bucket_idx on public.items (bucket);
create index items_parent_idx on public.items (parent_id);
create index items_created_by_idx on public.items (created_by);
create trigger items_touch before update on public.items
  for each row execute function private.touch_updated_at();

-- --------------------------------------------------------------- decisions
create table public.decisions (
  id text primary key default gen_random_uuid()::text,
  date date not null default current_date,
  title text not null,
  why text,
  domain text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
create index decisions_date_idx on public.decisions (date desc);
create index decisions_created_by_idx on public.decisions (created_by);

-- ------------------------------------------------------------------- links
create table public.links (
  id text primary key default gen_random_uuid()::text,
  "group" text not null default 'Autres',
  title text not null,
  url text not null check (url ~ '^https?://'),
  note text,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ access
-- Où se connecter et OÙ est rangé le secret. Jamais le secret lui-même.
create table public.access (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('access', 'key')),
  service text not null,
  url text,
  login_hint text,
  secret_location text,
  two_fa boolean not null default false,
  who text,
  used_by text,
  rotated_at date,
  created_at timestamptz not null default now()
);
comment on table public.access is 'Aucun mot de passe ni clé API ici : seulement où ils sont rangés (1Password, Bitwarden…).';
comment on column public.access.secret_location is 'Emplacement du secret (ex. « 1Password, coffre Vik »). Jamais le secret.';
comment on column public.access.login_hint is 'Quel compte est utilisé (ex. « compte Google de Max »). Jamais un mot de passe.';

-- ------------------------------------------------------------------- legal
-- Une seule ligne.
create table public.legal (
  id boolean primary key default true check (id),
  raison_sociale text,
  forme text,
  siren text,
  siret text,
  tva text,
  siege text,
  date_creation text,
  dirigeant text,
  comptable text,
  banque text,
  updated_at timestamptz not null default now()
);
create trigger legal_touch before update on public.legal
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------- expense_checks
create table public.expense_checks (
  anomaly_id text primary key,
  ok boolean not null default false,
  note text,
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz not null default now()
);
create index expense_checks_checked_by_idx on public.expense_checks (checked_by);

-- -------------------------------------------------------- metrics_snapshots
-- Source du dashboard. Un snapshot par date.
create table public.metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of date not null unique,
  payload jsonb not null,
  source text not null default 'seed',
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- processes
-- Les schémas « Comment ça marche ». Étapes en JSON pour rester modifiables.
create table public.processes (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  meta text,
  steps jsonb not null default '[]'::jsonb,
  rules jsonb not null default '[]'::jsonb,
  sort_order double precision not null default 0,
  updated_at timestamptz not null default now()
);
create trigger processes_touch before update on public.processes
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- routines
-- La semaine type. day : 1 = lundi … 7 = dimanche, null = tous les jours.
create table public.routines (
  id text primary key default gen_random_uuid()::text,
  day smallint check (day between 1 and 7),
  title text not null,
  sub text,
  who text not null default 'both' check (who in ('max', 'adrien', 'both', 'os')),
  sort_order double precision not null default 0
);

-- ------------------------------------------------------------------- pages
-- Pages libres façon Notion : arborescence, titre, icône, blocs en JSON.
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.pages (id) on delete cascade,
  title text not null default '',
  icon text,
  content jsonb not null default '[]'::jsonb,
  sort_order double precision not null default 0,
  favorite boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pages_parent_idx on public.pages (parent_id);
create index pages_created_by_idx on public.pages (created_by);
create index pages_updated_by_idx on public.pages (updated_by);
create trigger pages_touch before update on public.pages
  for each row execute function private.touch_updated_at();

-- --------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.decisions enable row level security;
alter table public.links enable row level security;
alter table public.access enable row level security;
alter table public.legal enable row level security;
alter table public.expense_checks enable row level security;
alter table public.metrics_snapshots enable row level security;
alter table public.processes enable row level security;
alter table public.routines enable row level security;
alter table public.pages enable row level security;

-- Rien pour les visiteurs non connectés.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on
  public.items, public.decisions, public.links, public.access, public.legal,
  public.expense_checks, public.processes, public.routines, public.pages
  to authenticated;
-- Les snapshots sont écrits côté serveur (seed, cron) : lecture seule pour l'app.
grant select on public.metrics_snapshots to authenticated;

create policy "membres : lire les profils" on public.profiles
  for select to authenticated using ((select private.is_member()));

create policy "membres : tout" on public.items
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.decisions
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.links
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.access
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.legal
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.expense_checks
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.processes
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.routines
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : tout" on public.pages
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy "membres : lire les chiffres" on public.metrics_snapshots
  for select to authenticated using ((select private.is_member()));

-- ---------------------------------------------------------------- Realtime
alter publication supabase_realtime add table
  public.items, public.decisions, public.links, public.access, public.legal,
  public.expense_checks, public.metrics_snapshots, public.processes,
  public.routines, public.pages;
