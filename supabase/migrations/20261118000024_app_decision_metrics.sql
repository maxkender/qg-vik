-- Décider par app et par pays : essais par pays (RevenueCat), abonnés gagnés (OS), tarif posteur par zone.
alter table public.rc_country_weekly add column trials integer;
alter table public.os_posts_daily add column followers_gained integer;

create table public.zone_rates (
  zone text primary key,
  usd_per_account_week numeric(10, 2) not null check (usd_per_account_week >= 0),
  updated_at timestamptz not null default now()
);
insert into public.zone_rates (zone, usd_per_account_week) values ('A', 14), ('B', 10), ('C', 7);
alter table public.zone_rates enable row level security;
revoke all on public.zone_rates from anon;
grant select, insert, update, delete on public.zone_rates to authenticated;
create policy "membres : tout" on public.zone_rates
  for all to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
