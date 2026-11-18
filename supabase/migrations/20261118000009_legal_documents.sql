-- Légal & accès : documents privés, comptes enrichis, garde-fou anti-secret, session récente.

alter table public.access
  add column account_email text,
  add column owner text check (owner in ('Max', 'Adrien', 'Vik Studios')),
  add column payment_method text,
  add column monthly_cost numeric(10, 2),
  add column renewal_date date;
alter table public.legal add column vault_url text;

-- Vrai si la personne s'est connectée il y a moins de 12 heures.
create function private.is_fresh_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    extract(epoch from now()) - (
      select max((e ->> 'timestamp')::numeric)
      from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) e
    ) < 43200,
    false
  );
$$;
revoke all on function private.is_fresh_session() from public, anon;
grant execute on function private.is_fresh_session() to authenticated;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('Société', 'Fiscal & social', 'Banque', 'Contrats', 'Apps & stores', 'Juridique', 'Assurances')),
  doc_date date,
  expires_at date,
  notes text,
  path text not null unique,
  mime text,
  size bigint,
  -- Date d'expiration pour laquelle une tâche « Urgent » a déjà été créée.
  alerted_for date,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index documents_added_by_idx on public.documents (added_by);

-- Journal : qui a ouvert, téléchargé, ajouté ou supprimé quel document. On ajoute, on ne modifie jamais.
create table public.document_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents (id) on delete set null,
  document_name text not null,
  action text not null check (action in ('ajouté', 'ouvert', 'téléchargé', 'supprimé')),
  actor uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index document_log_at_idx on public.document_log (at desc);
create index document_log_document_idx on public.document_log (document_id);
create index document_log_actor_idx on public.document_log (actor);

alter table public.documents enable row level security;
alter table public.document_log enable row level security;
revoke all on public.documents, public.document_log from anon;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert on public.document_log to authenticated;

create policy "membres connectés depuis moins de 12 h" on public.documents for all to authenticated
  using ((select private.is_member()) and (select private.is_fresh_session()))
  with check ((select private.is_member()) and (select private.is_fresh_session()));
create policy "membres : lire le journal" on public.document_log for select to authenticated
  using ((select private.is_member()));
create policy "membres : écrire en son nom" on public.document_log for insert to authenticated
  with check ((select private.is_member()) and actor = (select auth.uid()));

alter publication supabase_realtime add table public.documents, public.document_log;

-- Stockage privé : aucun accès public, lecture seulement par lien signé.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "qg documents : lire" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select private.is_member()) and (select private.is_fresh_session()));
create policy "qg documents : ajouter" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_member()) and (select private.is_fresh_session()));
create policy "qg documents : supprimer" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select private.is_member()) and (select private.is_fresh_session()));

-- Garde-fou dans la base : aucun champ de ces tables ne peut contenir quelque chose qui ressemble à une clé.
create function private.reject_secrets()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v text;
begin
  for v in select value from jsonb_each_text(to_jsonb(new)) loop
    if v ~ '(^|[^A-Za-z0-9])(sk|pk|rk)[-_][-_A-Za-z0-9]{16,}'
       or v ~ '(ghp_|gho_|github_pat_|xox[abp]-|whsec_|sbp_|sb_secret_)[A-Za-z0-9_-]{8,}'
       or v ~ 'AKIA[0-9A-Z]{12,}'
       or v ~ 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}' then
      raise exception 'Range ça dans le coffre, pas ici';
    end if;
  end loop;
  return new;
end;
$$;
create trigger access_no_secret before insert or update on public.access for each row execute function private.reject_secrets();
create trigger legal_no_secret before insert or update on public.legal for each row execute function private.reject_secrets();
create trigger documents_no_secret before insert or update on public.documents for each row execute function private.reject_secrets();
