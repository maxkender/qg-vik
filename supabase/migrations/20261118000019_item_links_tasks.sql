-- Une réunion peut lister des tâches à discuter : un lien d'une tâche vers une autre tâche.
alter table public.item_links add column task_id text references public.items (id) on delete cascade;
create index item_links_task_idx on public.item_links (task_id);
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.item_links'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%page_id IS NOT NULL%' loop
    execute format('alter table public.item_links drop constraint %I', c);
  end loop;
end $$;
alter table public.item_links add constraint item_links_one_target
  check ((page_id is not null)::int + (url is not null)::int + (task_id is not null)::int = 1);
