-- Connexion sans email : chaque membre a un compte pré-créé et choisit son mot de passe
-- à la première connexion. Le mot de passe est haché par Postgres (bcrypt), jamais stocké en clair.
alter table public.allowed_emails add column claimed_at timestamptz;
comment on column public.allowed_emails.claimed_at is 'Quand le membre a choisi son mot de passe (null = pas encore fait).';

-- Crée le compte (déjà confirmé, sans mot de passe) de chaque membre de la liste blanche.
-- Réservé au serveur : appelé par `pnpm seed`.
create function public.qg_ensure_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  uid uuid;
  created integer := 0;
begin
  for a in select * from public.allowed_emails loop
    if not exists (select 1 from auth.users u where u.email = a.email) then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        a.email, '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', a.name),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        uid::text, uid,
        jsonb_build_object('sub', uid::text, 'email', a.email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      );
      created := created + 1;
    end if;
  end loop;
  return created;
end;
$$;
revoke all on function public.qg_ensure_accounts() from public, anon, authenticated;
grant execute on function public.qg_ensure_accounts() to service_role;

-- Où en est ce compte ? 'inconnu' | 'nouveau' (mot de passe à choisir) | 'pret'
create function public.qg_login_state(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when a.claimed_at is null then 'nouveau' else 'pret' end
     from public.allowed_emails a
     join auth.users u on u.email = a.email
     where a.email = lower(p_email)),
    'inconnu');
$$;

-- Première connexion : le membre choisit son mot de passe. Une seule fois par compte.
create function public.qg_claim(p_email text, p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(p_password) < 10 then
    return 'court';
  end if;
  update public.allowed_emails
     set claimed_at = now()
   where email = lower(p_email) and claimed_at is null;
  if not found then
    return case when exists (select 1 from public.allowed_emails where email = lower(p_email))
                then 'deja' else 'inconnu' end;
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where email = lower(p_email);
  if not found then
    raise exception 'Compte introuvable';
  end if;
  return 'ok';
end;
$$;

-- Appelées par le serveur du QG (clé publique). Les identifiants ne sont connus que du serveur.
revoke all on function public.qg_login_state(text) from public;
revoke all on function public.qg_claim(text, text) from public;
grant execute on function public.qg_login_state(text) to anon, authenticated, service_role;
grant execute on function public.qg_claim(text, text) to anon, authenticated, service_role;
