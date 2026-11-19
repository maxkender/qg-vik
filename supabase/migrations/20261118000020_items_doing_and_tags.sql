-- « En train de faire » remplace « Plus tard », et une tâche peut porter plusieurs labels libres.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.items'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%prio%' loop
    execute format('alter table public.items drop constraint %I', c);
  end loop;
end $$;
update public.items set prio = 'normal' where prio = 'later';
alter table public.items add constraint items_prio_check check (prio in ('urgent', 'doing', 'normal'));
alter table public.items add column tags text[] not null default '{}';
create index items_tags_idx on public.items using gin (tags);
