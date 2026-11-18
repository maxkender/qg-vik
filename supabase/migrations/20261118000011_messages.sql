-- Retours et liens envoyés directement d'un membre à l'autre (page Profils).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  to_who text not null check (to_who in ('max', 'adrien')),
  from_who text not null check (from_who in ('max', 'adrien')),
  body text,
  url text,
  read_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (coalesce(body, url) is not null)
);
create index messages_to_idx on public.messages (to_who, created_at desc);
create index messages_created_by_idx on public.messages (created_by);

alter table public.messages enable row level security;
revoke all on public.messages from anon;
grant select, insert, update, delete on public.messages to authenticated;
create policy "membres : tout" on public.messages
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
alter publication supabase_realtime add table public.messages;
