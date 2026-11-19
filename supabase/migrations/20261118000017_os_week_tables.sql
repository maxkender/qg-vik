-- Données fines de l'OS pour la page « Semaine » (écrites par la synchro, lues par les 2 membres).
create table public.os_posts_daily (
  date date not null,
  account text not null,
  app text not null,
  label text not null default '',
  country text not null default '',
  lang text,
  posts_published integer not null default 0,
  posts_planned integer not null default 0,
  views bigint not null default 0,
  -- Les vues de chaque post publié ce jour-là : sert à la médiane et au % de viraux.
  post_views integer[] not null default '{}',
  best_post_views integer,
  best_post_url text,
  best_post_thumb text,
  updated_at timestamptz not null default now(),
  primary key (date, account)
);
create index os_posts_daily_date_idx on public.os_posts_daily (date);

create table public.os_accounts_daily (
  date date not null,
  app text not null,
  label text not null default '',
  country text not null default '',
  active_accounts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (date, app, label, country)
);

create table public.os_reserve_daily (
  date date not null,
  label text not null,
  lang text not null default '',
  ready integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (date, label, lang)
);

create table public.os_cost_weekly (
  week date not null,
  country text not null,
  cost_usd numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (week, country)
);

do $$
declare t text;
begin
  foreach t in array array['os_posts_daily', 'os_accounts_daily', 'os_reserve_daily', 'os_cost_weekly'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy "membres : lire" on public.%I for select to authenticated using ((select private.is_member()))', t);
  end loop;
end $$;
