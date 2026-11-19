-- Plusieurs pages et plusieurs liens peuvent être rattachés à une tâche.
create table public.item_links (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.items (id) on delete cascade,
  page_id uuid references public.pages (id) on delete cascade,
  url text check (url ~ '^https?://'),
  title text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((page_id is not null) <> (url is not null))
);
create index item_links_item_idx on public.item_links (item_id);
create index item_links_page_idx on public.item_links (page_id);
create index item_links_created_by_idx on public.item_links (created_by);

alter table public.item_links enable row level security;
revoke all on public.item_links from anon;
grant select, insert, update, delete on public.item_links to authenticated;
create policy "membres : tout" on public.item_links
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
alter publication supabase_realtime add table public.item_links;

-- Les pages déjà reliées (ancienne colonne items.page_id, plus utilisée).
insert into public.item_links (item_id, page_id, created_by)
select id, page_id, created_by from public.items where page_id is not null;
