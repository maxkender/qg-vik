-- Un lien direct par habitude de la semaine type (page de l'OS où elle se fait).
alter table public.routines add column url text check (url ~ '^https?://');
