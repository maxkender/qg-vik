-- Liste blanche au niveau de la base : seuls ces emails peuvent avoir un compte.
-- Remplie depuis la variable ALLOWED_EMAILS par `pnpm seed`. Aucun accès depuis l'app.
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  short text not null unique check (short in ('max', 'adrien')),
  name text not null,
  color text not null
);
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;
comment on table public.allowed_emails is 'Liste blanche des 2 membres. Lisible et modifiable côté serveur uniquement (aucune policy).';

-- Refuse toute création de compte (ou changement d'email) hors liste blanche.
create function private.guard_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from public.allowed_emails a where a.email = lower(new.email)
  ) then
    raise exception 'Accès réservé aux membres du QG';
  end if;
  return new;
end;
$$;

-- Crée le profil du membre à la création de son compte.
create function private.create_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, short, color)
  select new.id, a.name, a.short, a.color
  from public.allowed_emails a
  where a.email = lower(new.email)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.guard_member_email() from public, anon, authenticated;
revoke all on function private.create_member_profile() from public, anon, authenticated;

create trigger qg_guard_member_email
  before insert or update of email on auth.users
  for each row execute function private.guard_member_email();

create trigger qg_create_member_profile
  after insert on auth.users
  for each row execute function private.create_member_profile();
