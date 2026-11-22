# QG Vik

Le QG privé de Vik Studios (Maximilien et Adrien). Le brief complet est dans [`CLAUDE.md`](./CLAUDE.md).

## Déploiement

Dépôt GitHub privé `maxkender/qg-vik`, relié au projet Vercel `qg-vik` : chaque push sur `main` se déploie tout seul sur https://qg-vik.vercel.app.

## Lancer en local

```bash
pnpm install
cp .env.example .env.local   # puis remplir
pnpm dev
```

## Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | local + Vercel | Adresse du projet Supabase **du QG** (`jvptwclrlxiyzahmqbbx`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | local + Vercel | Clé publique (protégée par la RLS) |
| `SUPABASE_SECRET_KEY` | local + Vercel, jamais dans le code | Clé secrète : `pnpm seed`, routes serveur |
| `ALLOWED_EMAILS` | local + Vercel | Identifiants des 2 comptes autorisés : `max:…,adrien:…` |
| `NEXT_PUBLIC_GOOGLE_AUTH` | Vercel (optionnel) | `1` pour afficher « Continuer avec Google » |

Aucun mot de passe ni clé API dans le code ou dans la base. Le projet Supabase de l'OS (`mbikecieskoobeizixig`) n'est jamais utilisé ici.

## Connexion

Écran « Qui se connecte ? » : on clique sur sa carte, puis on tape son mot de passe. **Pas d'email.**
À la première connexion, chacun choisit son mot de passe (10 caractères minimum) ; il est haché dans la base, jamais stocké en clair ni dans le code.

`ALLOWED_EMAILS` contient les identifiants internes des 2 comptes (`max:…,adrien:…`). Ce ne sont ni de vraies adresses ni des secrets, mais ils restent côté serveur.

Trois verrous, du plus proche de l'écran au plus profond :

1. `src/proxy.ts` renvoie toute personne non connectée vers `/connexion` ;
2. la connexion ne peut viser que les 2 comptes de `ALLOWED_EMAILS` ;
3. dans la base, un trigger refuse toute création de compte hors de la table `allowed_emails`, et la RLS n'ouvre les données qu'aux 2 profils.

Mot de passe oublié : dans l'éditeur SQL du projet Supabase **qg-vik**, remettre le compte à zéro (remplacer `max` par `adrien` au besoin), puis rechoisir un mot de passe à la connexion suivante.

```sql
update public.allowed_emails set claimed_at = null where short = 'max';
update auth.users set encrypted_password = ''
 where email = (select email from public.allowed_emails where short = 'max');
```

Prévu pour plus tard (le code est déjà là, routes `/auth/callback` et `/auth/confirm`) : lien magique par email et Google, en mettant de vraies adresses dans `ALLOWED_EMAILS` et `NEXT_PUBLIC_GOOGLE_AUTH=1`.

En local, dans certains environnements derrière un proxy, lancer le serveur avec `NODE_USE_ENV_PROXY=1`.

## Sources de données (lecture seule)

Le QG ne fait que **lire** RevenueCat, Qonto, Meta et l'OS (uniquement des `GET`), et range ce qu'il lit dans **sa propre base**. Le dashboard ne lit que cette base : il reste rapide et marche même si une source est en panne.

| Source | Code | Tables | Variables Vercel |
|---|---|---|---|
| RevenueCat | `src/lib/sync/revenuecat.ts` | `rc_daily`, `rc_country_weekly` | `REVENUECAT_KEY_SOPHIA`, `_MICABO`, `_UNSWIPE` |
| Qonto | `src/lib/sync/qonto.ts`, `flags.ts` | `qonto_transactions`, `qonto_balance_daily`, `expense_flags` | `QONTO_LOGIN`, `QONTO_SECRET_KEY` |
| Meta Ads | `src/lib/sync/meta.ts` | `meta_spend_daily` | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` |
| OS | `src/lib/sync/os.ts` | `os_daily` | `OS_STATS_URL`, `OS_STATS_TOKEN` |

- Il faut aussi `SUPABASE_SECRET_KEY` (le serveur écrit dans la base du QG) et `CRON_SECRET`.
- Chaque synchro laisse une ligne dans `sync_runs`. Première synchro : tout depuis le 1er septembre 2026. Ensuite : les 10 derniers jours.
- Tous les jours à 6h, heure de Paris : `vercel.json` déclenche `/api/cron/sync` à 4h et 5h UTC, et seul l'appel qui tombe à 6h à Paris travaille.
- Bouton « Rafraîchir » du dashboard : `POST /api/sync?source=…`, réservé aux 2 membres.
- Tant qu'une source n'est pas branchée, le dashboard garde pour elle les chiffres du seed du 18/11.
- Ajouter une app (Runvik) : une ligne dans la table `apps` (clé, nom, identifiant de projet RevenueCat) et la variable `REVENUECAT_KEY_RUNVIK`.
- Postes de dépense : table `vendor_rules`, modifiable dans la page Dépenses. Un poste changé à la main sur une transaction n'est plus touché par la synchro.

## Assistant et profils

- **Assistant** (rond en bas à droite de chaque page, `src/components/assistant/bubble.tsx`, route `src/app/api/assistant/route.ts`) : répond à partir des données du QG et peut créer une tâche ou envoyer un message. Il lit la base avec la session de la personne connectée (RLS). Il utilise Gemini : variable Vercel `GEMINI_API_KEY` (et `GEMINI_MODEL` pour changer de modèle). Les données utiles à la réponse sont envoyées à l'API Gemini de Google à chaque question.
- **Profils** (`/profils`) : chiffres et activité de chacun, retours et liens envoyés à l'autre (table `messages`).

## Google Meet (générer un lien sans entrer dans la réunion)

Bouton « Générer un lien » d'une réunion → `POST /api/meet` → API Google Meet (`spaces.create`). Seul droit demandé : créer des salles.

1. Dans le projet Google Cloud de Vik Studios : activer « Google Meet REST API », créer un client OAuth « Application Web » avec l'URI de redirection `https://qg-vik.vercel.app/api/meet/callback`, et passer l'écran de consentement « En production » (en mode test, l'autorisation expire au bout de 7 jours).
2. Dans Vercel : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`, puis redéployer.
3. Dans le QG, cliquer « Générer un lien » puis « Autoriser » : Google affiche l'accord, le QG affiche une valeur à ranger dans Vercel sous `GOOGLE_MEET_REFRESH_TOKEN`. Redéployer.

## Base de données

- Schéma : `supabase/migrations/` (RLS activée sur toutes les tables, accès réservé aux 2 membres).
- Données de départ : `seed/*.json`.

```bash
pnpm seed           # importe le seed sans rien écraser
pnpm seed --reset   # remet les lignes du seed à leur valeur d'origine
pnpm seed --sql     # affiche le SQL équivalent (sans clé secrète)
```

## Commandes

```bash
pnpm dev        # développement
pnpm build      # build de production
pnpm typecheck  # TypeScript strict
pnpm lint       # ESLint
```

## Apps

La section « Apps » (`/apps`, `/apps/[slug]`) lit la table `app_metrics_daily`, remplie chaque jour à 6 h par le cron (`/api/cron/sync`, étape `apps`). Tout est en lecture seule.

Variables Vercel :

- `REVENUECAT_KEY_<SLUG>` : une clé secrète en lecture par projet RevenueCat (`REVENUECAT_KEY_SOPHIA`, `REVENUECAT_KEY_ARTURA`, `REVENUECAT_KEY_MICABO`, `REVENUECAT_KEY_UNSWAP`, `REVENUECAT_KEY_ATALA`, `REVENUECAT_KEY_NUTRIA`).
- `OS_QG_URL` : l'adresse complète de `GET /api/qg/apps` sur l'OS. `OS_QG_TOKEN` : la valeur de l'en-tête `x-qg-token`.

Ce que le QG lit dans la réponse de l'OS, par app (`src/lib/apps/os.ts`) : `application_id` ou `slug`, `accounts`, `cost_usd` (par semaine), `views_7d`, `posts_7d`, `median_views`, `viral_pct`, `countries` (`country`, `accounts`, `cost_usd`) et `labels` (`label`, `accounts`, `median_views`, `viral_pct`). Sans coût fourni, il est calculé : comptes × tarif de la zone du pays.

Une source qui ne répond pas s'affiche « données indisponibles », jamais zéro.

## Agent « Support & avis » et « Ma boîte »

Un cron Vercel toutes les heures (`/api/cron/agent`) lit les nouveaux mails et avis, les trie, les classe et prépare des brouillons. Code dans `src/lib/agent/`. `sync_state` garde le dernier élément lu par source.

Variables Vercel (une source sans sa clé reste « non branchée », le reste continue) :

- Gmail : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, puis `GMAIL_REFRESH_TOKEN_MAX` et `GMAIL_REFRESH_TOKEN_SUPPORT`. Les deux dernières s'obtiennent depuis la page « Santé de l'agent » (lien « obtenir l'autorisation », connecté à la bonne boîte). Dans la console Google, activer l'API Gmail et ajouter l'adresse de retour `https://qg-vik.vercel.app/api/gmail/callback`. Droits demandés : lecture et brouillons/envoi (`gmail.readonly`, `gmail.compose`).
- App Store : `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY`. Les apps sont reconnues par leur bundle id.
- Google Play : `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. L'identifiant Android d'une app est `apps.play_package` (à défaut, son bundle id).
- Modèle : `FAL_API_KEY`, `FAL_LLM_MODEL` (par défaut `google/gemini-2.5-flash`), et au besoin `FAL_LLM_ENDPOINT` (par défaut `fal-ai/any-llm`).

Tri : un mail de posteur (posts, TikTok, dashboard, Ruul, Upwork, paie, warm-up, ou expéditeur déjà vu comme posteur) est marqué `ignore_posteur`, sans classement, sans réponse, sans contenu gardé. Rien n'est envoyé sans un clic (« Envoyer », « Publier ») ; chaque envoi est dans `reply_log`.
