# Message pour Adrien : un accès en lecture seule de l'OS vers le QG

Salut Adrien,

Le QG a maintenant un dashboard qui se met à jour tout seul chaque matin. Il lit déjà RevenueCat et Qonto. Il me manque les chiffres de l'OS (comptes, vues, posteurs, support, paie). Je ne veux surtout pas que le QG touche à la base de l'OS : est-ce que tu peux exposer **un petit accès en lecture seule, réservé au QG** ?

## Ce que je propose (le plus simple)

Une **edge function** dans le Supabase de l'OS, par exemple `qg-stats`, protégée par un jeton.

- Appel : `GET https://<projet-os>.supabase.co/functions/v1/qg-stats?from=2026-09-01&to=2026-11-18`
- En-tête : `Authorization: Bearer <jeton>`. Le jeton est une longue chaîne au hasard que tu ranges dans les secrets de la fonction. Sans le bon jeton : réponse 401.
- La fonction ne fait que des `SELECT` et ne renvoie **que des chiffres agrégés par jour**. Aucun nom de posteur, aucun email, aucun ticket en clair.
- Réponse en JSON :

```json
{
  "rows": [
    {
      "date": "2026-11-17",
      "app": "sophia",
      "comptes_actifs": 412,
      "posts_faits": 790,
      "posts_prevus": 824,
      "posts_viraux": 68,
      "vues_total": 3120450,
      "vues_mediane": 1630,
      "nouveaux_posteurs": 6,
      "kills": 0,
      "doubles": 0,
      "tickets_ouverts": 14,
      "tickets_resolus": 11,
      "paie_upwork": 0,
      "paie_ruul": 0
    }
  ]
}
```

## Les champs, un par un

Une ligne **par jour et par app** (`sophia`, `micabo`, `unswipe`, plus tard `runvik`). Si un chiffre n'a pas de sens par app, mets-le sur une ligne `"app": "all"` et laisse `null` ailleurs.

| Champ | Ce que c'est |
|---|---|
| `comptes_actifs` | comptes TikTok actifs ce jour-là |
| `posts_faits` / `posts_prevus` | posts publiés et posts attendus ce jour-là |
| `posts_viraux` | posts publiés ce jour-là qui ont atteint 10 000 vues ou plus |
| `vues_total` | vues gagnées ce jour-là, tous les comptes de l'app |
| `vues_mediane` | médiane des vues par post |
| `nouveaux_posteurs` | posteurs qui ont démarré ce jour-là |
| `kills`, `doubles` | comptes coupés et comptes doublés ce jour-là |
| `tickets_ouverts`, `tickets_resolus` | tickets support ouverts ce jour-là, et parmi eux ceux qui sont résolus |
| `paie_upwork`, `paie_ruul` | montant payé ce jour-là (en dollars), donc surtout le lundi |

Dates en `AAAA-MM-JJ`, heure de Paris. Le QG demande tout depuis le 1er septembre la première fois, puis les 10 derniers jours chaque matin à 6h.

## L'autre option, si tu préfères

Un rôle Postgres `qg_readonly` avec seulement `SELECT` sur une vue `qg_daily_stats` qui a ces mêmes colonnes, et rien d'autre. La fonction avec jeton me paraît plus sûre : le QG n'a alors aucun accès direct à la base.

## Ce qu'il me faut ensuite

1. L'adresse de la fonction.
2. Le jeton, que tu me passes par 1Password (pas par Slack).

Je les mets dans les variables d'environnement Vercel du QG (`OS_STATS_URL` et `OS_STATS_TOKEN`), nulle part ailleurs. Le QG ne fera jamais autre chose que ce `GET`.

Merci !
Max
