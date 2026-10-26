# Open World — CampusCove

> Document de conception technique.
> Objectif : passer d'un monde « ville + intérieurs téléportés » à un **open world sans téléportation**, façon Garry's Mod RP, sur le web.
> Date : Octobre 2026 · Version 0.2 (proposition, corrigée après revue adverse)

---

## 1. Objectif

- Plus aucune téléportation : on entre dans une maison, un lieu de travail ou une zone commune en marchant.
- **Maisons** : sans propriétaire, la porte est ouverte. Avec un propriétaire, il a les clés et peut verrouiller.
- **Zones communes et lieux de travail** : ouverts à tout le monde.
- **Visiteurs** : lecture seule sur les meubles (pas d'interaction pour l'instant).
- Le monde doit pouvoir **grandir** (nouvelles zones) sans réécrire le moteur.

---

## 2. État actuel (point de départ)

| Élément | Fonctionnement actuel | Fichier |
|---------|----------------------|---------|
| Chargement ville | `town.glb` + 10 extérieurs de maisons + quartier pro + parc, chargés en une fois et gardés en cache | `front/src/game/roomEnvironments.ts` |
| Intérieurs | Groupes permutés dans la même `THREE.Scene`, tous à la même origine (porte à z = +5) | `roomEnvironments.ts`, `gameRoomConstants.ts` |
| Bascule | `setRoomEnvironment('city' \| 'apartment')` retire l'un, affiche l'autre, change le fog et l'exposition | `front/src/composables/game/useRoomEnvironment.ts` |
| État de pièce | `currentRoomLabel` binaire `city` / `apartment`, lu par ~10 fichiers (mouvement, placement, inventaire, interactions, HUD, realtime) | `front/src/composables/game/*`, `GameView.vue` |
| Collision | Un seul monde Rapier, **reconstruit entièrement** à chaque fichier de collision (`disposeWorld()`) | `front/src/game/collision/worldCollision.ts` |
| Collision ville | Un **cuboïde plein** par maison (`COL_House_house_01..10`) et par bâtiment pro | `front/public/assets/town/town.collision.json`, `work/*/exterior.collision.json` |
| Collision intérieurs | `borders: true` sur les 13 intérieurs : un mur de bordure est posé sur `bounds.maxZ`, donc sur la porte | `*/interior.collision.json` |
| Mouvement intérieur | Clamp `APARTMENT_HALF_EXTENT = 12` autour de l'origine | `front/src/composables/game/useGameMovement.ts` |
| Placement | Physique de placement = boîte de ±12 m (`addApartmentStaticColliders`), pas les murs réels | `front/src/game/placement/placementPhysics.ts` |
| Éclairage intérieur | Aucun GLB n'a de lumière : chaque intérieur reçoit 3 `PointLight` (portée 16–22 m) + 1 `HemisphereLight` | `front/src/game/sceneLighting.ts` |
| Réseau | Une room Colyseus (`CITY_MAX_PLAYERS`, 30 par défaut, variable d'env), visibilité par zone : `city`, `apartment:<ownerId>`, `work:<key>` | `socket/src/CityRoom.js`, `socket/src/players.js` |
| Mouvement serveur | `onMove` accepte toute position (seul `Number.isFinite` est vérifié) | `socket/src/CityRoom.js` |
| Constantes serveur | Spawns et `WORK_DOORS` dupliqués en dur | `socket/src/config.js` |
| Logement | 10 logements, un par maison, positionnés au point de porte. Une maison par compte, imposée par le service (`already_owns_unit`), pas par la base | `HousingUnitSeeder.php`, `HousingService.php` |
| Meubles | Room nommée `apartment:<owner>:<template>` : liée au **locataire**, pas à la maison. `template_key` libre, sans contrôle | `ApartmentPlacementService.php` |
| Fin de bail | Cron Laravel chaque minute. `resetExpiredUnit` **supprime** meubles, `ItemInstance`, memberships et Room | `HousingService.php`, `bootstrap/app.php` |
| Prototype open world | `/NewNation` place **déjà** des intérieurs de maisons dans le monde : `hideNodes` retire `Sky_*` et `Door_Entrance*`, `apartmentAt` détecte la maison courante | `NewNationShowroom.ts`, `showroomLayout.ts`, `new_nation.layout.json` |

### Trou de sécurité existant (indépendant de l'open world)

`saveObject` envoie `{ owner_account_id, template_key, ...payload }` (`socket/src/apartments.js:148`) : le payload client, étalé en dernier, **écrase** le propriétaire et le template. Un client peut écrire dans une autre Room que celle de la maison où il se trouve. À corriger en premier, dans un correctif séparé : payload étalé avant les champs serveur.

---

## 3. Mesures des modèles

### Maisons

La comparaison se fait entre la zone marchable de l'intérieur (`interior.collision.json`) et les **plans de murs réels** de l'extérieur (raycast sur `EX_*_Wall`), pas la bbox de `exterior.glb` qui inclut fondation, porche et poteaux.

- Mur avant intérieur : z 5.00..5.20 pour toutes les maisons.
- Fondation extérieure `EX_Foundation` : y 0 → 0.30 ; le sol intérieur est à y = 0.

| Maison | Façade extérieure (z) | Dépassement à la même origine | `interiorOffset` z | `interiorOffset` y |
|--------|----------------------|-------------------------------|--------------------|--------------------|
| house_01, house_02 | 3.75 | 1.45 m | -1.45 | +0.30 |
| house_03 | 4.00 | 1.20 m | -1.20 | +0.30 |
| house_04 à house_07 | 4.50 | 0.70 m | -0.70 | +0.30 |
| house_08 | 4.75 | 0.45 m | -0.45 | +0.30 |
| house_09, house_10 | 5.00 | 0.20 m | -0.20 | +0.30 |

Avec ces décalages, la largeur et la profondeur passent à ~10 cm près (house_01 : intérieur 7.8 × 7.3 m, coque intérieure 8.0 × 7.5 m).

Points d'attention :
- **Z-fighting** possible sur house_09/10, où le mur intérieur et la façade coïncident.
- **Hauteur d'œil** : la caméra est à `EYE_HEIGHT + terrainHeightAt` ; sans hauteur de sol par bâtiment, l'œil serait à 1.30 m au-dessus du sol intérieur.
- **Décor hors murs** : les `interior.glb` mesurent ~22 × 21 m à cause des plans `Sky_Front/Back/East/West`. Ils se retirent via `hideNodes`, comme dans New Nation.

### Extérieurs : pas de porte

Chaque `exterior.glb` de maison est **un seul nœud** fusionné (`House_house_XX`, 7 à 8 primitives). La porte n'est qu'un panneau peint : il n'y a aucune ouverture dans le mur avant. Les sources Blender des maisons ne sont pas dans `map-src/` (seuls les `build_work_*` y sont).

### Bâtiments pro : ne rentrent pas

La largeur passe (intérieur ±7.2 m, murs extérieurs ±8.0 m), pas la profondeur.

| Bâtiment | Profondeur extérieure | Profondeur intérieure | Porte extérieure (z) | Dépassement arrière, portes alignées |
|----------|----------------------|----------------------|---------------------|-------------------------------------|
| tech_hub | 14.0 m | 14.4 m | 7.0 | ~0.4 m |
| boutique | 12.0 m | 14.4 m | 6.0 | ~2.3 m |
| cafe | 13.0 m | 14.4 m | 6.5 | ~1.3 m |

La boutique a en plus une vitrine `EX_ShopwindowL` sur toute la largeur, qui ne correspond pas aux fenêtres intérieures.

---

## 4. Phase 0 — Assets et tranche verticale

Prérequis de tout le reste.

**Assets maisons**
- Percer l'ouverture de porte dans chaque extérieur et sortir un nœud `Door` animable.
- Récupérer ou reconstruire les sources Blender des maisons dans `map-src/`.

**Assets pro**
- Re-modéliser intérieur et/ou extérieur pour que les profondeurs et les portes coïncident, idéalement dans un seul fichier par bâtiment.

**Textures (VRAM)**
- Dédupliquer les textures des intérieurs : 158 textures pour 43 uniques (~206 MB → ~45 MB).
- Passer en 512 px et/ou KTX2.

**Tranche verticale**
- house_10 (décalage de 0.2 m seulement) placée dans la ville, porte ouverte, en partant du code de New Nation (`hideNodes`, `apartmentAt`).
- Valide offsets, collision, éclairage et caméra avant de généraliser.

---

## 5. Phase 1 — Manifeste de monde

Un fichier `world.manifest.json` remplace la liste codée en dur dans `loadTownEnvironment`. Il est lu **par le client et par le serveur temps réel** (empreintes, portes, bornes), ce qui supprime les doublons de `socket/src/config.js`.

| Champ | Rôle |
|-------|------|
| `key` | Identifiant de zone (`town`, `pond`, `work_district`, …) |
| `bounds` | Rectangle XZ de la zone |
| `modelUrl` | GLB de la zone |
| `collisionUrl` | Collision de la zone |
| `buildings[]` | Clé, position, rotation, `interiorOffset [x, y, z]`, empreinte au sol, position de porte, extérieur, intérieur, `hideNodes` |

Ajouter une zone de décor = une entrée au manifeste. Une zone avec gameplay dédié (comme l'étang : `setTerrainHeightmap`, `animatePondWater`, fishing spots) reste du code spécifique.

### Chargement : tout précharger, visibilité par proximité

La carte fait ~93 × 145 m (bornes de `town.collision.json`), plus petite que le fog far (120 m en `low`, 250 m en `high`). Un streaming de zones ne déchargerait rien aujourd'hui.

| Élément | Règle |
|---------|-------|
| Zones et extérieurs | Chargés au démarrage, toujours visibles |
| Intérieurs et meubles | Chargés au démarrage, `visible` activé à ~20 m du bâtiment (hystérésis : masqués à ~26 m) |
| Streaming de zones | Reporté : à brancher sur le manifeste quand la carte dépassera le fog |

Justification chiffrée :
- Triangles : ~150 k pour tout le jeu (négligeable).
- Draw calls : ~224 pour la ville ; ~1 050 si tous les intérieurs sont visibles (Three.js n'a pas d'occlusion culling). La visibilité par proximité suffit.
- VRAM : ~285 MB de textures aujourd'hui, d'où la déduplication en phase 0.

### Atmosphère

- Un seul réglage de fog / fond / exposition pour tout le monde.
- Pas de bascule d'exposition à la porte (1.05 → 1.1 : gain quasi nul, risque de flash).

---

## 6. Phase 2 — Collision composée

- Un seul monde Rapier **composé une fois** au chargement : ville + collisions d'intérieur transformées (position, rotation, `interiorOffset` du bâtiment).
- Retirer les cuboïdes pleins `COL_House_*` et `COL_Work_*` de la ville, remplacés par une **collision de coque** (murs + ouverture de porte) chargée avec la zone.
- Ignorer `borders` pour les intérieurs placés dans le monde.
- Seul le collider de porte est ajouté ou retiré (porte verrouillée ou non).
- Le clamp `APARTMENT_HALF_EXTENT` disparaît.
- Garder une API compatible avec New Nation (`buildWorldCollisionFromObject`, même singleton `worldCollision.ts`).
- Attention : `resolveWorldMovement` laisse passer tant que `!collidersReady`. Bloquer le mouvement tant que la collision n'est pas prête.

### Physique de placement

Construire la physique de placement à partir des cuboïdes réels de l'intérieur transformés, au lieu de la boîte de ±12 m qui déborderait sur la rue et les voisins (maisons espacées de ~21 m).

---

## 7. Phase 3 — Intérieurs placés dans le monde

### Bâtiment courant

- Remplacer `currentRoomLabel` binaire par un `currentBuilding` **déduit de la position** (`apartmentAt`).
- Migrer ses consommateurs : mouvement, placement, inventaire, interactions, HUD, `GameView.vue`, realtime.
- Supprimer `APARTMENT_SPAWN` et les messages `enter_apartment`, `enter_work`, `exit_apartment`.

### Meubles

- Indexer les meubles par logement (`housing_units.room_id`), plus par `apartment:<owner>:<template>`.
- Interdire tout `template_key` différent de celui du logement occupé. Retirer le chemin `starter_loft` (sans bâtiment en open world).
- Parenter les meubles sous le groupe du bâtiment : stockés en coordonnées locales, convertis au moment de persister.
- Gérer les meubles de **N maisons à la fois** côté client (aujourd'hui : un seul jeu d'objets, `visitedApartmentOwnerId`).
- Le serveur temps réel garde l'état des meubles en cache par maison et le sert aux clients, au lieu de N clients × N maisons vers Laravel.
- Backend : `normalizeTransform` valide la position contre les `bounds` de l'intérieur (sinon un meuble peut être posé dans la rue).

### Éclairage en scène unique

13 intérieurs × 3 point-lights = 39 lumières + 14 hémisphériques globales : la ville s'éclaircit, les lumières débordent chez les voisins (ombres de point-light désactivées), et chaque changement du nombre de lumières recompile tous les shaders.

- Pas d'`HemisphereLight` par intérieur.
- **Nombre de lumières constant** : un pool réaffecté aux maisons les plus proches, ou des lightmaps bakées.

### Ordre

**Maisons d'abord** (house_09/10, puis les autres), bâtiments pro **après** leur refonte d'assets (phase 0).

---

## 8. Phase 4 — Portes, clés et validation serveur

Portes et validation des mouvements se font **ensemble** : sans validation, un verrou n'est que cosmétique.

### Portes

Les portes deviennent des **entités serveur**.

| État | Comportement |
|------|-------------|
| Pas de propriétaire | Ouverte, tout le monde entre |
| Propriétaire, déverrouillée | Ouverte, tout le monde entre |
| Propriétaire, verrouillée | Collider de porte actif ; seuls les détenteurs de clé ouvrent |

- **Clés** : réutiliser `room_memberships` (rôles `owner`, `co_owner`, `editor`, `visitor`) et `room_bans`, plutôt que « seul le propriétaire ».
- **Persistance** : nouvelle colonne d'état de porte, via une migration Laravel.
- **Animation** : ouverture et fermeture physiques du nœud `Door` (phase 0).
- **Expulsion** : quand l'owner verrouille ou que le bail expire avec des visiteurs dedans, ils sont replacés devant la porte. Sinon la règle « dernière position valide » les bloque en boucle.
- **Fin de bail** : le backend prévient le serveur temps réel (push ou polling backend → socket). Aujourd'hui il ne l'apprend qu'au prochain `housing_refresh` d'un client.
- **Perte des meubles en fin de bail** : `resetExpiredUnit` supprime meubles et objets. Décider s'ils sont rendus à l'inventaire du joueur.
- Le backend applique aussi le verrou (`canVisitOwnerApartment` laisse aujourd'hui visiter tout occupant actif).
- Limiter `housing_refresh`, que n'importe quel client peut déclencher sans limite.

### Validation serveur des mouvements (anti-triche)

**Indispensable pour du RP avec portes verrouillées.** Faisable **sans Rapier** côté serveur : il suffit des empreintes tournées des maisons (manifeste + `interiorOffset`), de l'état des verrous, des bornes du monde et d'une horloge serveur.

| Contrôle | Règle |
|----------|-------|
| Vitesse | Refus d'un déplacement supérieur à la vitesse max × temps écoulé (+ marge réseau) |
| Bornes | Refus d'une position hors du monde |
| Maison verrouillée | Refus d'une position dans l'empreinte d'une maison verrouillée sans la clé |
| Réponse | Nouveau message serveur → client de correction de position (le client n'a aucun handler aujourd'hui) |

- Le client reste prédictif, le serveur fait foi.
- **Borner le `dt` côté client** dans `animate()` (`useGameMovement.ts`) : un retour d'onglet en arrière-plan provoque un saut légitime qui serait refusé.
- Limite acceptée : sans géométrie serveur, traverser les autres murs reste possible.

---

## 9. Phase 5 — Réseau

- Fin des zones instanciées (`apartment:<id>`, `work:<key>`) : tout le monde est dans le monde, tout est diffusé à tous.
- Les avatars distants sont cullés **côté client** par distance (affichage), pas côté serveur.
- 30 joueurs × 29 destinataires × 20 Hz ≈ 17 k messages/s : pas un problème pour Colyseus.
- **Interest management par grille** : seulement au-delà de ~100 joueurs ou quand la carte grandira nettement.

---

## 10. Ordre de réalisation

| # | Étape | Dépend de |
|---|-------|-----------|
| — | Correctif séparé : trou `saveObject` (§ 2) | — |
| 0 | Assets maisons (portes, sources), déduplication textures, tranche verticale house_10 | — |
| 1 | Manifeste (client + serveur), préchargement, visibilité par proximité | 0 |
| 2 | Collision composée + collision de coque + physique de placement | 1 |
| 3 | Toutes les maisons dans le monde : `currentBuilding`, meubles par logement, éclairage | 2 |
| 4 | Portes / clés **+** validation serveur des mouvements | 3 |
| 5 | Bâtiments pro dans le monde | refonte assets pro, 2 |
| 6 | Grille réseau, streaming de zones | quand l'échelle l'exige |

---

## 11. Risques

| Risque | Impact | Parade |
|--------|--------|--------|
| Assets non prévus pour l'open world (portes peintes, pros trop profonds) | Bloque les phases 3 à 5 | Phase 0 |
| VRAM des textures (~285 MB) | Crash ou lenteurs sur petites machines | Déduplication, 512 / KTX2 |
| Draw calls si tous les intérieurs sont visibles (~1 050) | FPS | Visibilité par proximité |
| Lumières qui débordent et recompilations de shaders | Saccades, éclairage faux | Pool de lumières constant ou lightmaps |
| Z-fighting façade / mur intérieur (house_09/10) | Artefacts visuels | Décaler légèrement l'intérieur ou retoucher la façade |
| Téléportation par client modifié | Intrusion dans les maisons verrouillées | Validation serveur (phase 4) |
| Écriture de meubles dans la Room d'un autre | Triche, données corrompues | Correctif `saveObject` + bornes backend |
| Perte des meubles en fin de bail | Frustration joueur | Règle de restitution à décider |

---

## 12. Non vérifié

- Transparence réelle des vitres extérieures des maisons.
- Temps de chargement et de compilation d'un intérieur, FPS en navigateur : aucun profilage lancé.
- Chevauchements entre empreintes extérieures hors du layout (l'écart de ~21 m entre maisons laisse penser qu'il n'y en a pas une fois `Sky_*` retiré).
