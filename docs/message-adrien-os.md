# Message pour Adrien : un accès en lecture seule de l'OS vers le QG

Salut Adrien,

Le QG a maintenant une page « Semaine » pour la réunion du lundi : comment la semaine s'est passée et où sont les trous (pays sous-couverts, labels en baisse, réserve de contenu à sec). Il lit déjà RevenueCat et Qonto. Il me manque les chiffres de l'OS. Je ne veux surtout pas que le QG touche à la base de l'OS : est-ce que tu peux exposer **un accès en lecture seule, réservé au QG** ?

## Ce que je propose

Une **edge function** dans le Supabase de l'OS, par exemple `qg-stats`, protégée par un jeton.

- Appel : `GET https://<projet-os>.supabase.co/functions/v1/qg-stats?from=2026-09-01&to=2026-11-18`
- En-tête : `Authorization: Bearer <jeton>`. Le jeton est une longue chaîne au hasard que tu ranges dans les secrets de la fonction. Sans le bon jeton : réponse 401.
- La fonction ne fait que des `SELECT`. Aucun nom de posteur, aucun email, aucun ticket en clair.
- Le QG l'appelle chaque matin à 6h : tout depuis le 1er septembre la première fois, puis les 10 derniers jours.
- Dates en `AAAA-MM-JJ`, heure de Paris. Pays en code à 2 lettres (`NO`, `DE`, `JP`).

La réponse est un JSON avec **5 listes**. Les 4 dernières sont nouvelles ; si tu en livres une partie d'abord, le QG prend ce qui est là.

```json
{
  "rows":     [ … ],
  "posts":    [ … ],
  "accounts": [ … ],
  "reserve":  [ … ],
  "costs":    [ … ]
}
```

## 1. `rows` : les totaux par jour et par app

Une ligne par jour et par app (`sophia`, `micabo`, `unswipe`, `runvik`). Si un chiffre n'a pas de sens par app, mets-le sur une ligne `"app": "all"`.

```json
{ "date": "2026-11-17", "app": "sophia", "comptes_actifs": 412, "posts_faits": 790, "posts_prevus": 824, "posts_viraux": 68,
  "vues_total": 3120450, "vues_mediane": 1630, "nouveaux_posteurs": 6, "kills": 0, "doubles": 0,
  "tickets_ouverts": 14, "tickets_resolus": 11, "paie_upwork": 0, "paie_ruul": 0 }
```

## 2. `posts` : les posts, par jour et par compte

Une ligne par **jour × compte**. C'est la liste la plus importante : elle donne les vues, la médiane, le % de viraux, le top des posts et les comptes en baisse, par app, par label et par pays.

```json
{ "date": "2026-11-17", "account": "@sophia.study.no", "app": "sophia", "label": "study_notes", "country": "NO", "lang": "no",
  "posts_published": 2, "posts_planned": 3, "views": 18420, "post_views": [15200, 3220],
  "best_post_views": 15200, "best_post_url": "https://www.tiktok.com/@…/video/…", "best_post_thumb": "https://…/miniature.jpg" }
```

| Champ | Ce que c'est |
|---|---|
| `account` | l'identifiant du compte (le @ TikTok, ou un id stable) |
| `label`, `country`, `lang` | le label de contenu, le pays visé, la langue |
| `posts_published` / `posts_planned` | posts publiés et posts attendus ce jour-là pour ce compte |
| `views` | vues gagnées ce jour-là par le compte |
| `post_views` | les vues de **chaque post publié ce jour-là** (sert à la médiane ; un post à 10 000 ou plus compte comme viral) |
| `best_post_*` | le meilleur post du jour : ses vues, son lien, sa miniature |

## 3. `accounts` : les comptes actifs

Une ligne par **jour × app × label × pays**.

```json
{ "date": "2026-11-17", "app": "sophia", "label": "study_notes", "country": "NO", "active_accounts": 11 }
```

## 4. `reserve` : la réserve de contenu

Une ligne par **jour × label × langue** : le nombre de slideshows prêts à poster.

```json
{ "date": "2026-11-17", "label": "study_notes", "lang": "no", "ready": 42 }
```

## 5. `costs` : le coût posteurs

Une ligne par **semaine × pays** (`week` = le lundi de la semaine), en dollars.

```json
{ "week": "2026-11-09", "country": "NO", "cost_usd": 154 }
```

## L'autre option, si tu préfères

Un rôle Postgres `qg_readonly` avec seulement `SELECT` sur 5 vues qui ont ces mêmes colonnes, et rien d'autre. La fonction avec jeton me paraît plus sûre : le QG n'a alors aucun accès direct à la base.

Quand c'est prêt, donne-moi l'adresse de la fonction et le jeton : je les mets dans les variables Vercel du QG (`OS_STATS_URL`, `OS_STATS_TOKEN`), jamais dans le code.
