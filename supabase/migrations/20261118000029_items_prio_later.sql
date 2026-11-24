-- « Plus tard » : le bas de la colonne À faire, sous la ligne de séparation.
alter table public.items drop constraint items_prio_check;
alter table public.items add constraint items_prio_check check (prio in ('urgent', 'doing', 'normal', 'later'));
