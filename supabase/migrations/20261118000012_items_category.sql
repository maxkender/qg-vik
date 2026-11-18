-- Catégorie d'une tâche : support, recrutement, posts, légal, réunion, finance, produit.
alter table public.items add column category text
  check (category in ('support', 'recrutement', 'posts', 'legal', 'reunion', 'finance', 'produit'));
create index items_category_idx on public.items (category);
