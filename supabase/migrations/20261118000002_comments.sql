-- Commentaires façon Notion : sur une page (éventuellement ancrés à un bloc) ou sur une tâche.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references public.pages (id) on delete cascade,
  item_id text references public.items (id) on delete cascade,
  -- Bloc de la page auquel le fil est accroché (null = commentaire de page).
  block_id text,
  -- Réponse dans un fil (null = premier message du fil).
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un commentaire porte sur une page OU sur une tâche, jamais les deux.
  constraint comments_one_target check ((page_id is null) <> (item_id is null))
);
create index comments_page_idx on public.comments (page_id);
create index comments_item_idx on public.comments (item_id);
create index comments_parent_idx on public.comments (parent_id);
create index comments_created_by_idx on public.comments (created_by);
create index comments_resolved_by_idx on public.comments (resolved_by);
create trigger comments_touch before update on public.comments
  for each row execute function private.touch_updated_at();

alter table public.comments enable row level security;
revoke all on public.comments from anon;
grant select, insert, update, delete on public.comments to authenticated;

create policy "membres : tout" on public.comments
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

alter publication supabase_realtime add table public.comments;
