-- Les habitudes de la semaine type cochées jour par jour, depuis la to-do.
create table public.routine_checks (
  id uuid primary key default gen_random_uuid(),
  routine_id text not null references public.routines (id) on delete cascade,
  date date not null,
  checked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (routine_id, date)
);
create index routine_checks_date_idx on public.routine_checks (date);
create index routine_checks_checked_by_idx on public.routine_checks (checked_by);

alter table public.routine_checks enable row level security;
revoke all on public.routine_checks from anon;
grant select, insert, update, delete on public.routine_checks to authenticated;
create policy "membres : tout" on public.routine_checks
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
alter publication supabase_realtime add table public.routine_checks;
