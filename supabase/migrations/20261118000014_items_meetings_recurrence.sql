-- Réunions (heure + lien Meet) et tâches qui se répètent.
alter table public.items
  add column at_time text check (at_time ~ '^\d{2}:\d{2}$'),
  add column meet_url text check (meet_url ~ '^https://'),
  add column repeat_rule text check (repeat_rule in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly'));
