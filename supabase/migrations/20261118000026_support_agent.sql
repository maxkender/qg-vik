-- Agent « Support & avis » : retours des utilisateurs (mails, avis App Store et Play), sujets, brouillons, récap de la boîte de Max.
-- Aucun secret ici : les accès Gmail, App Store Connect, Google Play et FAL sont dans les variables Vercel.
alter table public.apps add column play_package text, add column asc_app_id text;

create table public.sync_state (
  source text primary key,
  cursor text,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  error text,
  error_since timestamptz,
  stats jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
comment on table public.sync_state is 'Le dernier élément lu par source (gmail:max, gmail:support, app_store, play, fal) : jamais de doublon ni de retraitement.';

create table public.feedback_topics (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null references public.apps (slug) on update cascade on delete cascade,
  titre text not null,
  cle text not null,
  categorie text not null,
  gravite text not null default 'normal',
  touche text,
  nombre integer not null default 0,
  premier_vu timestamptz,
  dernier_vu timestamptz,
  exemples jsonb not null default '[]',
  unique (app_slug, cle)
);

create table public.feedback_items (
  id text primary key,
  app_slug text references public.apps (slug) on update cascade on delete set null,
  source text not null check (source in ('mail', 'app_store', 'play')),
  box text,
  thread_id text,
  auteur text,
  auteur_email text,
  titre text,
  texte text,
  recu_le timestamptz not null,
  url text,
  note smallint check (note between 1 and 5),
  categorie text check (categorie in ('probleme', 'feature', 'abonnement_remboursement', 'question', 'eloge', 'autre')),
  gravite text check (gravite in ('urgent', 'normal', 'faible')),
  touche text,
  langue text,
  pays text,
  resume text,
  citation text,
  confiance real,
  topic_id uuid references public.feedback_topics (id) on delete set null,
  classe_le timestamptz,
  erreur text,
  created_at timestamptz not null default now()
);
create index feedback_items_app_idx on public.feedback_items (app_slug, recu_le desc);
create index feedback_items_topic_idx on public.feedback_items (topic_id);

create table public.app_todos (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null references public.apps (slug) on update cascade on delete cascade,
  type text not null check (type in ('urgent', 'proposition')),
  cle text not null,
  topic_id uuid references public.feedback_topics (id) on delete cascade,
  titre text not null,
  raison text,
  nombre integer not null default 0,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'fait', 'refuse')),
  item_id text references public.items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_slug, type, cle)
);

create table public.reply_drafts (
  id uuid primary key default gen_random_uuid(),
  feedback_id text not null unique references public.feedback_items (id) on delete cascade,
  app_slug text references public.apps (slug) on update cascade on delete set null,
  canal text not null check (canal in ('gmail', 'app_store', 'play')),
  langue text,
  texte text not null,
  gmail_draft_id text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoye', 'ignore')),
  auto_possible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reply_log (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.reply_drafts (id) on delete set null,
  feedback_id text,
  canal text not null,
  qui text not null,
  automatique boolean not null default false,
  texte text not null,
  envoye_le timestamptz not null default now()
);
comment on table public.reply_log is 'Chaque réponse envoyée ou publiée : qui, quand, quel texte.';

create table public.mail_digest_items (
  id text primary key,
  box text not null,
  thread_id text,
  expediteur text,
  expediteur_email text,
  objet text,
  recu_le timestamptz not null,
  url text,
  tri text not null check (tri in ('boite_max', 'ignore_posteur')),
  categorie text,
  section text check (section in ('a_lire', 'a_traiter', 'reste')),
  resume text,
  avis text check (avis in ('up', 'down')),
  erreur text,
  created_at timestamptz not null default now()
);
create index mail_digest_recu_idx on public.mail_digest_items (recu_le desc);

create table public.mail_prefs (
  id uuid primary key default gen_random_uuid(),
  liste text not null check (liste in ('interessant', 'pas_interessant')),
  genre text not null check (genre in ('expediteur', 'domaine', 'mot_cle', 'categorie')),
  valeur text not null,
  statut text not null default 'valide' check (statut in ('valide', 'suggestion')),
  created_at timestamptz not null default now(),
  unique (liste, genre, valeur)
);

create table public.app_faq (
  id uuid primary key default gen_random_uuid(),
  app_slug text references public.apps (slug) on update cascade on delete cascade,
  question text not null,
  reponse text not null,
  langue text not null default 'fr',
  sort_order double precision not null default 0
);
comment on column public.app_faq.app_slug is 'Vide = valable pour toutes les apps.';

create table public.auto_send_settings (
  app_slug text not null references public.apps (slug) on update cascade on delete cascade,
  categorie text not null check (categorie in ('question', 'abonnement')),
  auto_send_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (app_slug, categorie)
);

do $$
declare t text;
begin
  foreach t in array array['sync_state', 'feedback_topics', 'feedback_items', 'app_todos', 'reply_drafts', 'reply_log', 'mail_digest_items', 'mail_prefs', 'app_faq', 'auto_send_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "membres : tout" on public.%I for all to authenticated using ((select private.is_member())) with check ((select private.is_member()))', t);
  end loop;
end $$;
-- Le journal des envois et l'état des synchros ne se modifient pas à la main.
revoke insert, update, delete on public.reply_log, public.sync_state from authenticated;

alter publication supabase_realtime add table public.app_todos, public.reply_drafts, public.mail_digest_items, public.mail_prefs, public.app_faq, public.feedback_topics, public.auto_send_settings;

-- La FAQ de départ, valable pour toutes les apps.
insert into public.app_faq (question, reponse, langue, sort_order) values
  ('Comment annuler mon abonnement sur iPhone ?', 'Ouvrez Réglages, touchez votre nom, puis Abonnements. Choisissez l''app, puis « Annuler l''abonnement ». L''accès reste actif jusqu''à la fin de la période déjà payée.', 'fr', 1),
  ('Comment annuler mon abonnement sur Android ?', 'Ouvrez Google Play, touchez votre photo de profil, puis Paiements et abonnements > Abonnements. Choisissez l''app, puis « Annuler l''abonnement ».', 'fr', 2),
  ('Comment restaurer un achat ?', 'Ouvrez l''app avec le même compte Apple ou Google que lors de l''achat, allez dans les réglages de l''app (ou sur l''écran d''abonnement) et touchez « Restaurer les achats ».', 'fr', 3),
  ('Je n''arrive pas à me connecter', 'Vérifiez que l''app est à jour, puis fermez-la et rouvrez-la. Si le problème continue, répondez à ce mail avec le modèle de votre téléphone et l''adresse utilisée : nous regardons tout de suite.', 'fr', 4),
  ('Puis-je être remboursé ?', 'Les paiements passent par Apple ou Google, qui sont les seuls à pouvoir rembourser. Sur iPhone : reportaproblem.apple.com. Sur Android : play.google.com, Paiements et abonnements > Budget et historique, puis « Signaler un problème ».', 'fr', 5),
  ('Comment contacter le support ?', 'Écrivez-nous à support@vikstudios.com : nous répondons sous 48 heures ouvrées.', 'fr', 6);
