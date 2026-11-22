alter table public.feedback_items add column demande text, add column agressif boolean not null default false;
alter table public.mail_digest_items add column texte text;
comment on column public.mail_digest_items.texte is 'Le corps du mail, gardé seulement jusqu''au classement, puis effacé : il ne reste que le résumé.';
