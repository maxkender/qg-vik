# Page « Control » : ce que le QG attend de l'OS

Le QG appelle l'OS toutes les heures, en lecture seule, avec l'en-tête `x-qg-token`. Trois routes, qui renvoient du JSON :

- `GET /api/qg/control/recruitment`
- `GET /api/qg/control/payroll`
- `GET /api/qg/control/issues`

Un champ absent s'affiche « – » dans le QG, jamais zéro. Les noms français (`recrutement`, `paie`, `problemes`, `objectif`, `prets`…) sont aussi acceptés.

## recruitment

```json
{
  "cohort": { "name": "Cohorte S48", "start_date": "2026-11-23", "target": 40, "ready": 27 },
  "funnel": [ { "label": "Candidatures", "count": 310, "previous": 280 }, { "label": "Test envoyé", "count": 120, "previous": 131 } ],
  "blocked": [ { "label": "Contrat Ruul", "count": 9, "oldest_days": 6, "reason": "KYC en attente" } ],
  "by_country": [ { "country": "NO", "hm": "Ingrid", "target": 8, "ready": 6, "in_progress": 3, "blocked": 1 } ],
  "channels": [ { "name": "Upwork", "status": "ok", "applicants_7d": 140, "hired_7d": 12, "note": "" } ]
}
```

`status` d'un canal : `ok`, `warn` ou `down`. Le verdict de la cohorte est calculé par le QG : vert à 80 % de l'objectif ou plus, orange entre 50 et 80 %, rouge en dessous.

## payroll

```json
{
  "calendar": [ { "date": "2026-11-26", "type": "doublement", "label": "Doublements", "count": 14 }, { "date": "2026-11-27", "type": "bonus", "label": "Bonus" }, { "date": "2026-11-28", "type": "comment_masters", "label": "Comment Masters" } ],
  "monday_check": { "week": "S47", "currency": "USD", "expected": 6120, "paid": 6050,
    "lines": [ { "label": "Ruul · lot 3", "expected": 1400, "paid": 1330, "reason": "2 posteurs sans IBAN" } ] },
  "complaints": [ { "id": "c1", "poster": "@compte", "date": "2026-11-21", "message": "Pas reçu mon bonus", "payslip": { "expected": 24, "paid": 14 }, "verdict": "fondee", "status": "open" } ],
  "counters": { "posteurs_payes": 412, "plaintes_ouvertes": 3 }
}
```

L'écart est calculé (payé − attendu) s'il n'est pas fourni (`gap`).

## issues

```json
{ "issues": [ { "id": "i1", "title": "Les kills du jeudi ne partent plus", "severity": "critical", "status": "open", "since": "2026-11-19",
  "detail": "Aucun kill exécuté depuis jeudi.", "expected_fix": "Relancer le job et rattraper les kills manqués." } ] }
```

`severity` : `critical`, `high`, `medium`, `low`. Un problème dont le `status` est `resolved`, `fixed`, `closed` ou `done` n'est plus listé. Le bouton « Copier le prompt pour l'OS » copie le titre, le détail et la correction attendue (ou le champ `prompt` s'il est fourni).
