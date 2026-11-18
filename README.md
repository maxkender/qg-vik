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
| `ALLOWED_EMAILS` | local + Vercel | Les 2 emails autorisés : `max:…,adrien:…` |
| `NEXT_PUBLIC_GOOGLE_AUTH` | Vercel (optionnel) | `1` pour afficher « Continuer avec Google » |

Aucun mot de passe ni clé API dans le code ou dans la base. Le projet Supabase de l'OS (`mbikecieskoobeizixig`) n'est jamais utilisé ici.

## Connexion

Écran « Qui se connecte ? » : un clic envoie un lien magique à l'email de la personne (lu dans `ALLOWED_EMAILS`, jamais affiché).

Trois verrous, du plus proche de l'écran au plus profond :

1. `src/proxy.ts` renvoie toute personne non connectée vers `/connexion` ;
2. au retour du lien, l'email est comparé à `ALLOWED_EMAILS`, sinon déconnexion ;
3. dans la base, un trigger refuse toute création de compte hors de la table `allowed_emails`, et la RLS n'ouvre les données qu'aux 2 profils.

À régler une fois dans Supabase (projet **qg-vik**), menu Authentication :

- **URL Configuration** : Site URL = `https://qg-vik.vercel.app`, et dans Redirect URLs : `https://qg-vik.vercel.app/**` et `http://localhost:3000/**`.
- **Google (optionnel)** : activer le provider Google avec un client OAuth, puis mettre `NEXT_PUBLIC_GOOGLE_AUTH=1` dans Vercel pour afficher le bouton.
- **Lien utilisable sur un autre appareil (optionnel)** : dans Emails > Magic Link, remplacer le lien par
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

La liste blanche de la base suit `ALLOWED_EMAILS` : relancer `pnpm seed` après tout changement d'email.

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
