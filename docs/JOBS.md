# Métiers rémunérés

Contrat partagé entre les couches (données Blender, API Laravel, socket Colyseus, front Three.js/Vue) pour les métiers.
Premier métier ouvert : **développeur au Tech Hub**. Les mini-jeux facultatifs et leurs bonus, puis les métiers
commerce, restauration, clinique et barman viendront ensuite sur ce socle.

Décision produit (01/11/2026) : un métier **paie automatiquement** tant que le personnage reste assis à son poste,
sans action périodique. Cette règle remplace, pour les métiers uniquement, l'ancienne règle « pas de revenu passif »
(les autres gains restent liés à une action de jeu).

## 1. Parcours joueur

1. Le joueur entre à pied au Tech Hub (quartier d'affaires) et vise l'un des 8 ordinateurs (`station_dev_01` à `_08`).
2. Poste libre : prompt « Commencer à travailler · Développeur · Tech Hub » sur la touche d'interaction (clic droit / G
   par défaut). Poste occupé : étiquette « Occupé · <pseudo> », pas de prompt.
3. Le serveur accepte : le personnage est assis sur la chaise, face aux écrans ; les autres joueurs le voient assis.
   Un panneau discret (en haut à gauche) affiche : Développeur, salaire par minute, temps travaillé, prochain
   versement, coins gagnés pendant ce poste, et un bouton « J : quitter le poste ».
4. Le salaire tombe toutes les 60 s, sans rien faire, onglet en arrière-plan compris tant que la connexion reste
   ouverte. Le panneau et le solde (`api/session.ts`, `applyCachedBalanceAfterPurchase`) suivent les messages du
   serveur ; le minuteur du navigateur ne sert qu'à l'affichage.
5. Quitter : touche **J** (configurable, action `leaveJob`) ou bouton du panneau (souris libérée par Échap). Les
   touches de déplacement ne quittent pas le poste : elles rappellent seulement la touche, pour éviter un départ
   involontaire. Le joueur peut ouvrir l'inventaire, la montre ou un échange, manger et boire sans quitter le poste ;
   il ne peut ni se déplacer, ni frapper, ni s'asseoir au pub, ni jouer à un mini-jeu. (Le jeu n'a pas encore de chat
   textuel.)

Textes en français et en anglais (`front/src/i18n/messages.ts`, section `jobs`), selon la langue du joueur.

## 2. Règles

| Règle | Où |
|---|---|
| 10 coins jaunes par période complète de 60 s, jamais de gems premium, aucun bonus | `backend/config/jobs.php` |
| Un seul métier actif et un seul poste par compte | socket (`player.job`) + index unique partiel `ux_job_shifts_open_account` |
| Un seul joueur par poste | socket (`room.jobStations`, réservé avant tout `await`) |
| Prise de poste : compte actif, poste existant, dans le bâtiment, à 2,2 m de la chaise, même étage (±1 m), poste libre, pas d'autre poste, pas KO / en convalescence / assis au pub / en mini-jeu | `socket/src/jobs.ts`, `jobRules.ts` |
| Aucune rémunération hors connexion, ni pour la simple proximité d'un bureau | le salaire ne court que pour un poste accepté |
| Quitter avant la fin d'une période : cette période n'est pas payée | `workedMs` s'arrête à la fin du poste |
| Reprendre un poste ouvre un nouveau shift (périodes recomptées depuis 1) | nouvelle ligne `job_shifts` |

Le barème est provisoire (équilibrage global plus tard). Variables d'environnement du backend :

| Variable | Défaut | Effet |
|---|---|---|
| `JOB_DEV_SALARY_COINS` | `10` | coins par période |
| `JOB_DEV_PERIOD_SECONDS` | `60` | durée d'une période |
| `JOB_DEV_SURVIVAL_FACTOR` | `0.25` | vitesse de la faim et de la soif pendant le poste |

Chaque shift copie le salaire, la période et le facteur à son ouverture : un changement de config vaut pour les
shifts suivants. Le socket reçoit ces valeurs de l'API (`POST /jobs/shifts`) : il n'y a pas de copie dans le socket.

## 3. Faim, soif et survie

Pendant un poste **confirmé par l'API**, la faim et la soif baissent à `survival_drain_factor` (25 %) de leur vitesse
normale : `tickSurvival` multiplie le facteur d'échelle de `tickStats` par `survivalDrainFactor(player)`. Le facteur
revient à 1 au premier tick de survie (2 s) après la fin du poste. Les autres règles (dégâts quand une jauge est vide,
régénération, KO) ne changent pas, et la vitesse des joueurs qui ne travaillent pas non plus.

Un malaise (santé à 0 ou black-out) arrête le poste et libère la chaise avant l'hospitalisation habituelle.

## 4. Fin d'un poste

`endJob(room, player, reason)` (idempotent) libère la chaise immédiatement, prévient la salle (`user_working` avec
`stationId: null`) et ferme le shift côté API avec sa raison :

| Raison | Déclencheur |
|---|---|
| `stopped` | `job_stop` (touche J ou bouton) |
| `left_station` | un `move` à plus de 0,3 m de la chaise (client modifié, ou annulation pendant l'ouverture) |
| `disconnected` | `onLeave` : déconnexion ou connexion déclarée perdue par Colyseus |
| `replaced` | même compte ouvert dans un autre onglet (la règle « une session par compte » reste appliquée) |
| `knocked_out` | malaise / black-out (`knockOut`) |
| `teleported` | téléportation ou convocation par un admin (`teleportPlayer`) |
| `account_inactive` | l'API répond 401 / 403 à un versement (compte banni, suspendu, jeton révoqué) |
| `shift_closed` | l'API répond que le shift est terminé ou inconnu |

La libération ne touche la chaise que si elle appartient encore à ce joueur : une libération tardive ne libère jamais
le poste d'un autre. Un poste encore en cours d'ouverture côté API quand le joueur part est refermé dès la réponse.

## 5. Versements et doublons

```
socket (tickJobs, chaque seconde)            API (JobService)                         base
période n complète ? ── POST /jobs/shifts/{id}/salary {period: n} ──► verrou FOR UPDATE sur le shift
                                                                     déjà payée ? → already_paid, rien crédité
                                                                     n complète (started_at + n·période ≤ fin ou now, ±2 s) ?
                                                                     CoinRewardService::credit(job_salary_dev)  ─► transactions + wallet_ledger
                                                                     INSERT job_salary_payments (shift, n)      ─► UNIQUE (shift_id, period)
◄── job_paid {period, coins, earned, balanceAfter} ──────────────────
```

- **Une période payée une fois** : verrou sur la ligne du shift (les versements d'un shift sont sérialisés), puis
  contrainte `UNIQUE (shift_id, period)` dans la même transaction. Une répétition, deux traitements concurrents ou une
  nouvelle tentative après une réponse perdue renvoient `already_paid: true` sans créditer.
- **Côté socket** : une seule requête en vol par shift (`paying`), le numéro de période n'avance qu'à la réponse.
- **Échec** (réseau, 5xx) : le panneau affiche « Versement en retard, nouvel essai… » sans compter les coins ; nouvel
  essai après 2, 5, 10, 20 puis 30 s.
- **Rattrapage borné** : au plus 5 périodes dues sont gardées pendant une panne ; les plus anciennes sont abandonnées
  (`forfeitedPeriods`). Un arrêt ou un gel du serveur (veille, débogueur) n'est pas du travail : un écart de plus de
  5 s entre deux ticks est retiré du temps travaillé (`noteTick`). Quelques heures d'arrêt ne paient donc jamais
  quelques heures.
- **Fin de poste** : les périodes complètes avant la fin restent payées (5 tentatives au plus), jamais la période en
  cours ni une période après la fin (l'API compare avec `ended_at`).
- **Traçabilité** : `wallet_ledger.reason = job_salary_<métier>`, `transactions.type = reward` avec
  `meta_json = {source, amount, job, shift_id, period, building, station}`, et `job_salary_payments.tx_id`.

Le solde reste `SUM(wallet_ledger.delta)` : pas de solde parallèle.

## 6. Redémarrage et sessions orphelines

L'occupation des postes ne vit que dans la mémoire du socket : après un redémarrage, tous les postes sont libres et
aucune ancienne session ne produit de coins (plus personne ne demande ses périodes). Côté base, un shift resté ouvert
est clôturé, à sa **dernière activité** (dernier versement, sinon son début), donc sans période payable de plus :

- dès que le même compte ouvre un nouveau shift (`end_reason = superseded`) ;
- sinon par `jobs:close-stale` (planifié chaque minute) quand aucun versement n'a eu lieu depuis 6 périodes
  (`end_reason = stale`).

Limite connue : l'unicité « un joueur par poste » est garantie par instance de salle `city` (30 joueurs). Si une
deuxième instance s'ouvrait, elle aurait ses propres postes.

## 7. Présentation

- Le joueur local voit depuis la chaise, à hauteur d'yeux assis, regard posé sur les écrans (`workingLook`).
- Les autres joueurs voient l'avatar assis sur la chaise, orienté vers le bureau, avec le clip **`Sit` existant**
  (avatar modulaire par défaut `wear/base` et skins premium `neon_ronin`, `street_luxe`, `astral_oracle`). Aucune
  animation de frappe au clavier n'a été ajoutée.
- **Repli** : les skins statiques `campus_classic`, `explorer`, `night_owl`, `scholar`, `street_runner` n'ont aucun clip ;
  ils restent dans leur pose debout, abaissés pour que les hanches arrivent au niveau de l'assise
  (`seatedAvatarFeetY`, le même repli que les sièges du pub).

## 8. Fichiers

| Couche | Fichiers |
|---|---|
| Données | `map-src/CampusCove/build_work_tech_hub.py` (`seatHeight` des postes), `front/public/assets/work/tech_hub/interior.layout.json`, `front/scripts/apply-jobs.mjs` → `world.manifest.json` `jobs.stations` (coordonnées monde) |
| API | `config/jobs.php`, migration `2026_11_01_100000_create_job_shifts_and_salary_payments` (`down()` supprime les deux tables), `JobService`, `JobController`, `JobRejectedException`, commande `jobs:close-stale`, `CoinRewardService::credit` (rend le `tx_id`) |
| Socket | `src/jobRules.ts` (règles pures), `src/jobs.ts` (messages, versements), `world.ts` (postes + emprise des bâtiments), branchements dans `CityRoom`, `survival.ts`, `admin.ts`, `pub.ts`, `punch.ts`, `players.ts` |
| Front | `game/jobs/stations.ts` (visée, pose, horloge d'affichage), `composables/game/useJobs.ts`, `components/game/GameJobHud.vue`, routage dans `useGameRealtime.ts`, assemblage dans `GameView.vue`, touche `leaveJob` |

Messages : client → serveur `job_start { stationId }`, `job_stop`. Serveur → client `job_started`, `job_paid`,
`job_payment_delayed`, `job_ended { reason, earned }`, `job_error { code, message, occupant? }` ; à toute la salle
`user_working { sessionId, stationId | null }` ; `stationId` est aussi dans `init` / `user_joined`.

Routes API (réservées au socket, en-tête `X-Realtime-Secret`) : `POST /api/jobs/shifts`,
`POST /api/jobs/shifts/{id}/end`, `POST /api/jobs/shifts/{id}/salary`.

## 9. Commandes utiles

```bash
make migrate                 # crée job_shifts et job_salary_payments
make jobs-apply              # réécrit jobs.stations de world.manifest.json depuis les interior.layout.json
make close-stale-shifts      # clôture les shifts orphelins (planifié chaque minute)
make test                    # dont JobApiTest et JobConcurrencyTest
cd socket && npm test && npx tsc
cd front && node --experimental-strip-types --test "src/**/*.test.ts"
docker compose exec -T backend php artisan migrate:rollback --step=1   # retire les deux tables
```

Vérifier les versements d'un compte :

```sql
SELECT s.shift_id, s.station_id, s.end_reason, p.period, p.coins, l.reason
FROM job_shifts s LEFT JOIN job_salary_payments p USING (shift_id)
LEFT JOIN wallet_ledger l ON l.tx_id = p.tx_id
WHERE s.account_id = 42 ORDER BY s.shift_id, p.period;
```

Après un changement de fichier front, si Vite (conteneur sous Windows) sert encore l'ancienne version :
`docker compose restart front`.

## 10. Scénarios de test

Automatisés :

- `backend/tests/Feature/JobApiTest.php` : règles du shift, salaire configurable, premier versement après une période
  complète (coins exacts, premium inchangé, ledger tracé), rejeu sans double crédit, contraintes uniques, remplacement
  d'un shift orphelin, fin de shift, compte étranger, secret temps réel, compte banni, `jobs:close-stale`.
- `backend/tests/Feature/JobConcurrencyTest.php` : 6 processus PHP (connexions distinctes) paient la même période au
  même instant → un seul crédit ; 6 ouvertures simultanées pour un compte → un seul shift ouvert. Retirer le
  `lockForUpdate` fait échouer le premier test.
- `socket/src/jobs.test.ts` : prise valide, refus (distance, autre bâtiment, autre étage, poste inconnu), poste occupé
  avec le nom, deux joueurs pendant que l'API répond encore, un seul poste par joueur, plusieurs postes, premier
  salaire, pas de doublon en vol, panne puis reprise, rattrapage borné, gel du serveur, départ en cours de période,
  déconnexion, ouverture annulée sans libérer le poste d'un autre, téléportation, malaise, compte banni, faim et soif.
- `front/src/game/jobs/stations.test.ts` : visée d'un poste, pose assise, horloge du panneau.

À jouer (deux comptes, deux navigateurs ou deux origines `localhost` / `127.0.0.1`) : entrer au Tech Hub, prendre un
ordinateur, attendre un versement, passer l'onglet en arrière-plan une minute, quitter puis reprendre, tenter le poste
occupé par l'autre joueur, puis travailler côte à côte sur deux postes.

## 11. Ajouter un métier

1. Donner aux postes du bâtiment un `job` et un `seatHeight` (script Blender `build_work_<clé>.py`, puis
   `interior.layout.json`) ; un poste debout devra définir sa propre pose (pas encore géré).
2. Ajouter le métier dans `backend/config/jobs.php` (bâtiments, salaire, période, facteur de survie).
3. Ajouter le métier à `OPEN_JOBS` dans `front/scripts/apply-jobs.mjs`, puis `make jobs-apply`.
4. Ajouter son nom FR/EN dans `jobs.names` (et le bâtiment dans `jobs.buildings`).
5. Les mini-jeux et bonus se brancheront sur le shift ouvert (`player.job`) ; un bonus devra passer par un versement
   distinct et idempotent, comme le salaire.
