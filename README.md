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

Aucun mot de passe ni clé API dans le code ou dans la base. Le projet Supabase de l'OS (`mbikecieskoobeizixig`) n'est jamais utilisé ici.

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
