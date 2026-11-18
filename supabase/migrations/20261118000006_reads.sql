-- « À lire » : un document envoyé à l'autre membre.
create table public.reads (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  for_who text not null check (for_who in ('max', 'adrien')),
  note text,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index reads_page_idx on public.reads (page_id);
create index reads_for_idx on public.reads (for_who) where read_at is null;
create index reads_sent_by_idx on public.reads (sent_by);

alter table public.reads enable row level security;
revoke all on public.reads from anon;
grant select, insert, update, delete on public.reads to authenticated;
create policy "membres : tout" on public.reads
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
alter publication supabase_realtime add table public.reads;
