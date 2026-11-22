create table public.control_snapshots (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('recrutement', 'paie', 'problemes')),
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);
create index control_snapshots_kind_idx on public.control_snapshots (kind, fetched_at desc);
comment on table public.control_snapshots is 'Ce que l''OS répond sur /api/qg/control/* (lecture seule), une photo par heure.';
alter table public.control_snapshots enable row level security;
revoke all on public.control_snapshots from anon, authenticated;
grant select on public.control_snapshots to authenticated;
create policy "membres : lire" on public.control_snapshots for select to authenticated using ((select private.is_member()));
