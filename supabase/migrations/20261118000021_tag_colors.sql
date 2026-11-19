-- La couleur choisie pour chaque label (sinon une couleur par défaut, côté app).
create table public.tag_colors (
  name text primary key,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now()
);
alter table public.tag_colors enable row level security;
revoke all on public.tag_colors from anon;
grant select, insert, update, delete on public.tag_colors to authenticated;
create policy "membres : tout" on public.tag_colors
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
alter publication supabase_realtime add table public.tag_colors;
