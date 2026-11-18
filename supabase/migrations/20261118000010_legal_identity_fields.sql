-- Fiche société complète (identité et coordonnées bancaires, qui ne sont pas des secrets).
alter table public.legal
  add column nom_commercial text,
  add column code_ape text,
  add column capital text,
  add column ville_rcs text,
  add column iban text,
  add column bic text,
  add column banque_titulaire text,
  add column banque_domiciliation text;
