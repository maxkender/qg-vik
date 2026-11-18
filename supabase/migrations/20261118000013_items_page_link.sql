-- Une tâche peut être reliée à une page (compte rendu, guide, brief…).
alter table public.items add column page_id uuid references public.pages (id) on delete set null;
create index items_page_idx on public.items (page_id);
