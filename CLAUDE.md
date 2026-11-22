# QG Vik Studios

Le QG privé de Max (Maximilien) et Adrien, les deux fondateurs de Vik Studios. Vik Studios fait tourner environ 640 comptes TikTok de slideshows qui font la promo de trois apps : Sophia, Micabo et Unswipe. Runvik, une app de running, arrive.

Ce QG sert à piloter la boîte. L'opérationnel (posteurs, paie, support, kills) reste dans un autre outil, « l'OS ».

Le QG doit être **beau, rapide et agréable**. Il faut que ça donne envie de l'ouvrir tous les matins. La référence d'interaction est **Timestripe** (voir `reference/timestripe-*.png`). `reference/maquette-qg.html` est une première maquette HTML qui fonctionne : ouvre-la dans un navigateur pour voir le contenu et les écrans attendus. Le design final doit aller beaucoup plus loin.

## Stack

- Next.js (App Router, dernière version stable), TypeScript strict, Tailwind CSS, shadcn/ui
- Supabase : Postgres, Auth et Realtime, sur un **nouveau projet Supabase dédié au QG**
- Glisser-déposer : dnd-kit. Graphiques : Recharts. Schémas de process : React Flow. Animations : Framer Motion, avec retenue.
- Hébergement : Vercel. Un dépôt GitHub privé, déployé à chaque push sur `main`.
- Langue de l'interface : français. Dates au format français (« mercredi 18 novembre », semaines « S47 »). Semaines ISO, lundi → dimanche.

## Règles à ne jamais enfreindre

1. **Ne jamais toucher au projet Supabase de l'OS** (`mbikecieskoobeizixig`), ni en lecture ni en écriture. Le QG a son propre projet.
2. **Aucun mot de passe ni aucune clé API stockés dans la base, ni dans le code.** Les clés vont dans les variables d'environnement Vercel. La page « Légal & accès » indique seulement *où* se trouve chaque secret (1Password, Bitwarden…), jamais le secret lui-même. Affiche un avertissement en haut de cette page.
3. **Seuls Max et Adrien peuvent se connecter.** Liste blanche de 2 emails, définie dans les variables d'environnement `ALLOWED_EMAILS`. Row Level Security activée sur toutes les tables.
4. **Aucune action qui envoie, paie ou modifie quelque chose ailleurs.** Les intégrations (RevenueCat, Qonto) sont en lecture seule. Deux exceptions demandées par Max, toujours sur un clic d'un membre : créer un lien Google Meet, et l'agent Support (bouton « Envoyer » un mail, bouton « Publier » une réponse à un avis). L'agent pose aussi des brouillons Gmail. L'envoi automatique existe mais reste désactivé.
5. Avant chaque étape, montre ton plan. À la fin de chaque étape, lance l'app en local et vérifie qu'elle fonctionne avant de passer à la suite.

## Connexion

- L'écran d'accueil demande « Qui se connecte ? » avec deux grandes cartes : **Maximilien** et **Adrien**, chacune avec avatar, initiale et couleur.
- Un clic envoie un lien magique Supabase à l'email de la personne, pris dans les variables d'environnement. Prévoir aussi Google OAuth, restreint aux deux mêmes emails.
- Ensuite, « moi » est connu partout : filtres par défaut, assignation par défaut, « Salut Max » en haut.
- Couleurs des personnes : Max en teal, Adrien en rose. « Les deux » en gris.

## Modèle de données (Supabase)

- `profiles` : `id` (auth uid), `name`, `short` (`max` | `adrien`), `color`
- `items` (tâches et objectifs, un seul modèle comme dans Timestripe) :
  - `id`, `title`, `notes`
  - `bucket` : `inbox` | `life` | `d:2026-11-18` | `w:2026-W47` | `m:2026-11` | `y:2026`
  - `owner` : `max` | `adrien` | `both`
  - `prio` : `urgent` | `normal` | `later`
  - `parent_id` (sous-objectifs), `done`, `done_at`, `sort_order`, `created_at`, `created_by`
- `decisions` : `date`, `title`, `why`, `domain`, `created_by`
- `links` : `group`, `title`, `url`, `note`, `sort_order`
- `access` : `kind` (`access` | `key`), `service`, `url`, `login_hint`, `secret_location`, `two_fa`, `who`, `used_by`, `rotated_at`. **Aucune colonne pour un secret.**
- `legal` : une seule ligne avec raison sociale, forme, SIREN, SIRET, TVA, siège, date de création, dirigeant, comptable, banque
- `expense_checks` : `anomaly_id`, `ok`, `note`, `checked_by`
- `metrics_snapshots` : `as_of`, `payload jsonb`. C'est la source du dashboard.

Le dossier `seed/` contient les **vraies données à importer** : `items`, `decisions`, `links`, `access` et `metrics`. Écris un script `pnpm seed` qui les charge.

## Écrans

Navigation : un rail à gauche comme dans Timestripe, qui devient une barre en haut sur mobile.

Raccourcis clavier :

| Touche | Action |
|---|---|
| `N` | Nouvelle tâche |
| `1` à `6` | Changer de vue |
| `/` | Recherche |

### 1. À faire (écran d'accueil)

- Trois colonnes : **Urgent**, **À faire**, **Plus tard**. On glisse une carte d'une colonne à l'autre pour changer sa priorité.
- Chaque carte affiche :
  - la case à cocher ;
  - le titre, modifiable directement ;
  - l'avatar de la personne assignée (un clic pour changer) ;
  - l'horizon (« Aujourd'hui », « S47 », « Novembre ») ;
  - « en retard » en rouge si la date est passée ;
  - le nombre de sous-objectifs.
- En haut : « Salut Max · 3 urgents pour toi », et un filtre Moi / Adrien / Tous.
- Ajout rapide en une ligne. On peut taper « !urgent @adrien demain » pour remplir la priorité, la personne et la date en même temps.

### 2. Horizons (comme Timestripe)

- La colonne **Aujourd'hui** est large. À droite, des bandes verticales repliées : **Inbox**, **Semaine**, **Mois**, **Année**, **Vie**. Un clic sur une bande l'ouvre en colonne.
- Les tâches en retard remontent en haut d'Aujourd'hui.
- Glisser-déposer entre toutes les colonnes. Sous-objectifs dépliables (« 3/11 sous-objectifs »).

### 3. Jours, Semaines, Mois, Années

- Des colonnes qui défilent horizontalement, comme sur les captures Timestripe. La colonne en cours est en orange.
- Flèches ‹ Aujourd'hui › pour se déplacer dans le temps.
- La vue Années se termine par une colonne « Vie ».

### 4. Dashboard

Données tirées de `metrics_snapshots`.

- **Cartes KPI** :
  - trésorerie ;
  - revenus, dépenses et marge de la dernière semaine pleine, avec la variation par rapport à la semaine d'avant ;
  - % de posts viraux ;
  - comptes actifs ;
  - % de tickets support résolus.
- **Graphiques** :
  - revenus et dépenses par semaine ;
  - revenus par app (Sophia, Micabo, Unswipe) ;
  - dépenses par mois et par poste ;
  - % de posts viraux ;
  - vues totales ;
  - comptes actifs, kills et doublés.
- **Dépenses à vérifier** : une liste à cocher (table `expense_checks`).
- **Pays** : un tableau trié par € par utilisateur, avec un badge de verdict (Recruter vert, Garder bleu, À corriger jaune, Couper rouge).
- **Décisions** : un journal daté, avec ajout rapide.
- **Phase 2** : routes serveur en lecture seule vers l'API RevenueCat (revenus par app et par pays) et l'API Qonto (transactions), avec les clés dans les variables d'environnement Vercel. Un cron Vercel le lundi à 7h crée un nouveau snapshot.

### 5. Process

- **La semaine type** : 7 colonnes du lundi au dimanche, plus une ligne « tous les jours ». Chaque process est une puce colorée selon qui le fait (Max, Adrien, l'OS).
- **« Comment ça marche »** : des schémas React Flow animés, un par process. Chaque étape affiche son acteur (HM, Claude, OS, posteur, Max, Adrien). Les branches en losange montrent les cas « oui / non ». Contenu exact dans `reference/maquette-qg.html` (constante `FLOWS`) :
  1. Le job d'une HM
  2. L'onboarding d'un posteur Ruul
  3. Kills et doublement
  4. Support posteurs
  5. Paie et parrainage
- Les process doivent être modifiables plus tard : stocke-les en base (table `processes` avec ses étapes en JSON), pas en dur dans le code.

### 6. Liens & guides

- Des liens groupés : guides Notion (Poster Guide, Hiring Manager Guide, job post template, règles Ruul), outils (Hub, RevenueCat, Qonto, Upwork, Ruul, Supabase, App Store Connect, Meta Ads, Lovable, Slack).
- Icône de chaque site, ajout et suppression.

### 7. Légal & accès

- Fiche légale modifiable.
- Tableau des connexions : service, compte utilisé, où est le mot de passe, 2FA, qui a accès.
- Tableau des clés API : service, utilisée par, stockée où, dernière rotation.
- Le gros avertissement en haut : rien de secret ici.

## Design

- **Blanc et verre dépoli**, sobre : fond gris très clair, cartes blanches translucides, texte presque noir. Thème sombre neutre en option. Pas de bleu dominant. Logo Vik Studios dans `src/components/logo.tsx`.
- **Orange** pour « maintenant » (aujourd'hui, semaine en cours).
- **Typographie** : Geist pour les titres et le texte, Geist Mono pour les chiffres et les dates.
- **Clair et concis partout** : pas de sous-titre explicatif, pas d'élément décoratif inutile.
- **Densité** : élevée mais aérée. Survols subtils, transitions courtes (moins de 150 ms). Respecter `prefers-reduced-motion`.
- **Réactivité** : les modifications sont optimistes et se synchronisent en temps réel entre Max et Adrien (Supabase Realtime). Indicateur discret « synchronisé ».
- **Mobile** : utilisable sur téléphone (PWA installable, icône sur l'écran d'accueil).
- **À éviter** : les dégradés violets, les emojis en guise d'icônes (utilise Lucide), les cartes toutes identiques.

## Ordre de construction

1. Mise en place : dépôt, Next.js, Tailwind, shadcn, projet Supabase, schéma, RLS, script de seed. Déploiement Vercel vide.
2. Connexion Max / Adrien.
3. Vue À faire, puis Horizons, puis Jours / Semaines / Mois / Années, avec le glisser-déposer et le temps réel.
4. Dashboard (depuis le snapshot), décisions, dépenses à vérifier, pays.
5. Process (React Flow), Liens & guides, Légal & accès.
6. Finitions du design, mobile / PWA, raccourcis clavier.
7. Phase 2 : RevenueCat et Qonto en direct, cron du lundi.
