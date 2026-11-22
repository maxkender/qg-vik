-- Section « Apps » : une fiche par app, ses chiffres jour par jour, et le lien avec les tâches et les décisions.
alter table public.apps rename column key to slug;
alter table public.apps rename column rc_project_id to revenuecat_project_id;
alter table public.apps
  add column logo_url text,
  add column bundle_id text,
  add column os_application_id text,
  add column store_url text check (store_url is null or store_url ~ '^https://'),
  add column repo_url text check (repo_url is null or repo_url ~ '^https://'),
  add column notion_url text check (notion_url is null or notion_url ~ '^https://'),
  add column slack_channel text,
  add column phase text not null default 'preparation' check (phase in ('preparation', 'test', 'validation', 'croissance')),
  add column launch_date date,
  add column pays_cibles text[] not null default '{}',
  add column owner text not null default 'both' check (owner in ('max', 'adrien', 'both')),
  add column created_at timestamptz not null default now();
comment on table public.apps is 'Les apps de Vik Studios. La clé RevenueCat de chacune est dans la variable Vercel REVENUECAT_KEY_<SLUG>, jamais ici.';

grant select, insert, update, delete on public.apps to authenticated;

-- Les 6 apps. Logo et bundle id : ceux du projet RevenueCat (icon_url_large).
update public.apps set slug = 'unswap', name = 'UnSwap' where slug = 'unswipe';
insert into public.apps (slug, name, revenuecat_project_id, color, sort_order, bundle_id, logo_url, phase) values
  ('sophia', 'Sophia', 'proj3f496a80', 'viz-1', 1, 'app.rork.assvmps5x7hpyq0ezcsut', 'https://www.appatar.io/app.rork.assvmps5x7hpyq0ezcsut/large?store=app_store', 'croissance'),
  ('artura', 'Artura', 'proj3aaeb1df', 'viz-2', 2, 'com.vikstudios.artura', 'https://www.appatar.io/com.vikstudios.artura/large?store=app_store', 'preparation'),
  ('micabo', 'Micabo', 'proj415c7a8d', 'viz-4', 3, 'com.micabo.ios', 'https://www.appatar.io/com.micabo.ios/large?store=app_store&country=us', 'preparation'),
  ('unswap', 'UnSwap', 'proj5556884d', 'viz-5', 4, 'com.vikstudios.noreel', 'https://www.appatar.io/com.vikstudios.noreel/large?store=app_store', 'preparation'),
  ('atala', 'Atala', 'proja8073f10', 'viz-3', 5, 'com.atala.app', 'https://www.appatar.io/com.atala.app/large?store=app_store', 'preparation'),
  ('nutria', 'Nutria', 'proj0f84a0cc', 'viz-6', 6, 'com.nutria25.nutriaapp', 'https://www.appatar.io/com.nutria25.nutriaapp/large?store=app_store', 'preparation')
on conflict (slug) do update set
  name = excluded.name, revenuecat_project_id = excluded.revenuecat_project_id, sort_order = excluded.sort_order,
  bundle_id = excluded.bundle_id, logo_url = excluded.logo_url, phase = excluded.phase;

-- Les chiffres d'une app, un jour = une ligne. Écrit par le cron de 6 h (clé serveur), lu par les membres.
create table public.app_metrics_daily (
  app text not null references public.apps (slug) on update cascade on delete cascade,
  date date not null,
  metrics jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (app, date)
);
alter table public.app_metrics_daily enable row level security;
revoke all on public.app_metrics_daily from anon, authenticated;
grant select on public.app_metrics_daily to authenticated;
create policy "membres : lire" on public.app_metrics_daily
  for select to authenticated using ((select private.is_member()));

alter table public.rc_daily add column new_customers integer;

alter table public.items add column app_slug text references public.apps (slug) on update cascade on delete set null;
alter table public.decisions add column app_slug text references public.apps (slug) on update cascade on delete set null;
create index items_app_slug_idx on public.items (app_slug) where app_slug is not null;
create index decisions_app_slug_idx on public.decisions (app_slug) where app_slug is not null;

alter table public.sync_runs drop constraint sync_runs_source_check;
alter table public.sync_runs add constraint sync_runs_source_check check (source in ('revenuecat', 'qonto', 'meta', 'os', 'apps'));
