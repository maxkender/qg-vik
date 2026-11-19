-- Ressources : logos, icônes d'apps et autres fichiers de marque, faciles à télécharger.
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  folder text not null default 'Divers',
  path text not null unique,
  mime text,
  size bigint,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index assets_added_by_idx on public.assets (added_by);
alter table public.assets enable row level security;
revoke all on public.assets from anon;
grant select, insert, update, delete on public.assets to authenticated;
create policy "membres : tout" on public.assets
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
alter publication supabase_realtime add table public.assets;

-- Stockage privé (50 Mo par fichier), réservé aux 2 membres.
insert into storage.buckets (id, name, public, file_size_limit)
values ('ressources', 'ressources', false, 52428800)
on conflict (id) do nothing;
create policy "qg ressources : lire" on storage.objects for select to authenticated
  using (bucket_id = 'ressources' and (select private.is_member()));
create policy "qg ressources : ajouter" on storage.objects for insert to authenticated
  with check (bucket_id = 'ressources' and (select private.is_member()));
create policy "qg ressources : supprimer" on storage.objects for delete to authenticated
  using (bucket_id = 'ressources' and (select private.is_member()));
