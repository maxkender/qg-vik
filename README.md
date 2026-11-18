# QG Vik

Le QG privé de Vik Studios (Maximilien et Adrien). Le brief complet est dans [`CLAUDE.md`](./CLAUDE.md).

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

## Phase 2 : chiffres en direct

Deux intégrations **en lecture seule** (uniquement des `GET`, aucun virement, aucune écriture ailleurs que dans la base du QG) :

- `src/lib/integrations/qonto.ts` : soldes et sorties d'argent ;
- `src/lib/integrations/revenuecat.ts` : revenus par app et par pays.

`POST /api/snapshot` (bouton « Mettre à jour » du dashboard) et `GET /api/cron/snapshot` (Vercel, chaque lundi à 6h UTC, soit 7h à Paris en hiver) créent un nouveau snapshot et importent les nouvelles dépenses. Les chiffres qui viennent de l'OS (vues, posts viraux, comptes, kills, support) ne sont pas encore branchés : ils sont repris du snapshot précédent.

Variables à poser dans Vercel pour l'activer : `SUPABASE_SECRET_KEY`, `QONTO_LOGIN`, `QONTO_SECRET_KEY`, `REVENUECAT_KEY_SOPHIA`, `REVENUECAT_KEY_MICABO`, `REVENUECAT_KEY_UNSWIPE`, `CRON_SECRET`. Tant qu'elles manquent, les routes répondent « pas encore configuré » et le dashboard reste sur le dernier snapshot.

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
