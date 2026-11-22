# Page « Control » : ce que le QG lit dans l'OS

Le QG appelle l'OS toutes les heures, en lecture seule, avec le jeton `OS_QG_TOKEN` (en-têtes `x-qg-token` et `Authorization: Bearer`), sur le domaine `OS_API_URL` :

- `GET /api/qg/control/recruitment` (et `?cohort=AAAA-MM-JJ` pour la cohorte d'avant) ;
- `GET /api/qg/control/payroll` ;
- `GET /api/qg/control/issues`.

Les réponses brutes sont rangées 48 heures dans `control_snapshots`. Le navigateur ne reçoit que des vues compactes, calculées dans `src/lib/control/read.ts` :

- **Recrutement** : `cohorte`, `totaux`, `entonnoir`, `bloques`, `par_pays`, `par_hm`, `sante_canaux`, `arretes`, `objectifs`. « Prêt » = a fait son premier post. Le verdict (vert à 80 % de l'objectif, orange de 50 à 80 %, rouge en dessous) demande que `objectifs` soit rempli dans l'OS.
- **Paie** : `semaine`, `paye_le`, `devise`, `totaux`, `posteurs` (attendu, payé, écart, raison), `plaintes_7j` (avec `paie_semaine`).
- **Autres problèmes** : déduits de `crons.en_echec_24h`, `bots`, `kills_non_finis`, `support_en_retard`, `incidents`, `shadowban_probable`, `posts_du_jour`, `comptes_introuvables`, `tickets_ouverts`.
