# Comportement des NPC (behavior trees)

Les NPC de zone (props `kind: "npc"` des fichiers `zones/<zone>.json`) peuvent recevoir un **behavior tree**,
inspiré de celui d'Unreal Engine 5 : composites, tâches, décorateurs et services. Les arbres sont édités dans
l'admin (`/admin/npc`, « NPC Interface ») et sauvés dans `front/public/assets/npc/behavior.json`, un fichier commité,
comme les templates de l'éditeur.

**Autorité.** Le serveur Colyseus exécute les arbres (`socket/src/npcBrain.ts`) : position, trajet, clip, phrase,
cible. Le front ne fait qu'afficher (`useNpcBrains`) : il interpole les trajets et joue les clips. Tous les
joueurs voient donc le même NPC au même endroit.

**Limites de la v1.**

- Pas de navmesh : un NPC va en ligne droite vers un point. C'est l'auteur qui place les points pour que le
  chemin soit dégagé (la carte de l'onglet NPCs trace les lignes). Le sol suit la hauteur des points.
- Seuls les NPC sans rôle (`role`) et qui ne tiennent pas une zone de vente (`areas[].npc`) peuvent avoir un
  arbre : un vendeur doit rester derrière son comptoir.
- Un NPC piloté n'a pas de collision : les joueurs le traversent.

## Fichier `npc/behavior.json`

```json
{
  "version": 1,
  "trees": {
    "<clé>": { "name": "Flâneur", "points": ["banc"], "root": { "...": "nœud" } }
  },
  "npcs": [
    { "zone": "orchard", "npc": "p4", "tree": "<clé>", "points": { "banc": [-22, 0, -76] } }
  ]
}
```

| Champ | Règle |
|---|---|
| clé d'arbre | `/^[a-z0-9_]+$/`, 40 arbres au plus |
| `name` | 1 à 40 caractères |
| `points` | clés de blackboard de type point, `/^[a-z0-9_]+$/`, 16 au plus, ni `home` ni `target` |
| `npcs[]` | 64 au plus, un seul arbre par couple `zone` + `npc` |
| `npcs[].points` | exactement les points déclarés par l'arbre, chacun `[x, y, z]` à 60 m au plus de la position du NPC |

Deux clés de blackboard existent toujours : `home` (la position du NPC dans sa zone) et `target` (le joueur
perçu par le service `perceive_players`, vide sinon).

## Nœuds

Chaque nœud : `{ "id", "type", ...paramètres, "decorators"?: [], "services"?: [], "children"?: [], "weight"? }`.
`id` suit `/^[a-z0-9_]+$/` et est unique dans l'arbre ; 200 nœuds et 12 niveaux au plus.

### Composites (`children`: 1 à 12)

| Type | Effet |
|---|---|
| `selector` | Essaie les enfants de gauche à droite, réussit au premier qui réussit. |
| `sequence` | Exécute les enfants dans l'ordre, échoue au premier qui échoue. |
| `random` | Tire un enfant selon son `weight` (1 à 100, 1 par défaut) et renvoie son résultat. `weight` n'existe que sous un `random`. |

### Tâches

`PointRef` = une clé de `points`, `home` ou `target`.

| Type | Paramètres | Effet |
|---|---|---|
| `move_to` | `point: PointRef`, `speed: "walk" \| "run"` | Marche (2,5 m/s) ou court (7,5 m/s) en ligne droite. Vers `target`, s'arrête à 1,5 m. Échoue si `target` est vide. |
| `wander` | `radius` 1 à 30 m, `speed` | Va à un point tiré au hasard dans le disque autour de `home`. |
| `pick_crop` | `crop: "any" \| "corn" \| "potato" \| "cabbage" \| "pumpkin" \| "apple_tree"`, `radius` 1 à 60 m, `speed` | Va à une plante de ce type tirée au hasard à moins de `radius` de `home` (cultures du `world.manifest.json`, arbres du verger), s'arrête à 0,7 m d'une culture ou 1,3 m d'un tronc, se tourne vers elle et joue `pick` 3 s. Purement visuel : rien n'est récolté, la plante reste aux joueurs. Échoue s'il n'y a aucune plante dans le rayon. |
| `wait` | `min`, `max` en s, 0 ≤ min ≤ max ≤ 600 | Attend une durée tirée entre les deux. |
| `face` | `point: PointRef` | Se tourne vers le point (immédiat). Échoue si `target` est vide. |
| `animate` | `clip: "idle" \| "sit" \| "pick" \| "eat" \| "drink"`, `seconds` 0,5 à 600 | Joue le clip pendant la durée (`sit` et `idle` tenus, les autres une fois). |
| `say` | `lines`: 1 à 10 textes de 1 à 120 caractères, `seconds` 1 à 6 (durée de vie d'une bulle de chat) | Bulle au-dessus de la tête avec une ligne tirée au hasard, pendant la durée. |

### Décorateurs (6 au plus par nœud)

| Type | Paramètres | Effet |
|---|---|---|
| `has_target` | `invert: boolean`, `abort` | Condition : `target` est rempli (ou vide si `invert`). |
| `time_of_day` | `from`, `to` entiers 0 à 23, différents ; `invert`, `abort` | Condition : l'heure de Paris est dans `[from, to)` (passe minuit si `from > to`). |
| `chance` | `percent` 1 à 99 | Tiré une fois à l'entrée du nœud. |
| `cooldown` | `seconds` 1 à 3600 | Le nœud échoue pendant ce délai après sa dernière fin. |
| `loop` | `count` 0 à 100 (0 = sans fin) | Relance le nœud tant qu'il réussit, `count` fois. |

`abort` (conditions seulement), comme les « observer aborts » d'UE5, revérifié à chaque tick :

- `none` : vérifié à l'entrée seulement ;
- `self` : si la condition devient fausse pendant que le nœud tourne, il est interrompu (échec) ;
- `lower` : si la condition devient vraie pendant qu'un frère de droite tourne, ce frère est interrompu et ce
  nœud démarre. Seulement sous un `selector` ;
- `both` : les deux.

### Services (3 au plus, sur un composite)

| Type | Paramètres | Effet |
|---|---|---|
| `perceive_players` | `radius` 1 à 30 m, `interval` 0,25 à 5 s | Tant que le composite tourne : `target` = le joueur le plus proche dans le rayon. La cible est gardée jusqu'à `radius + 2` m, puis vidée. |

## Exécution (socket)

- Un tick toutes les 100 ms. La racine est relancée dès qu'elle finit.
- Un nœud interrompu arrête son trajet là où le NPC se trouve.
- Le serveur relit `npc/behavior.json` toutes les 5 s ; un fichier invalide est refusé (log) et l'ancien est
  gardé. Après un rechargement, chaque NPC repart de `home`.
- Au démarrage, une assignation dont le NPC n'existe pas, a un rôle ou tient une zone de vente fait échouer le
  chargement du fichier (log, NPC immobiles).

## Messages

| Message | Sens | Contenu |
|---|---|---|
| `npcs` | serveur → client, à l'arrivée et après rechargement | `{ npcs: NpcState[] }` : liste complète, un NPC absent redevient immobile à sa place |
| `npc_state` | serveur → tous, à chaque changement | `NpcState` |

`NpcState` = `{ id: "<zone>/<npc>", x, y, z, ry, clip, clipSeq, move, say }` : position des pieds et cap au départ,
`clip` parmi ceux de `animate`, `clipSeq` augmente à chaque clip lancé (rejouer deux fois le même clip), `move` = `{ x, y, z, ms }` (arrivée et durée restante, ou `null`),
`say` = texte ou `null`. Le client ne renvoie rien : les NPC n'acceptent aucun message.

## Fichiers

| Rôle | Fichier |
|---|---|
| Contrat (ce document) | `docs/NPC_BEHAVIOR.md` |
| Données | `front/public/assets/npc/behavior.json` |
| Validation éditeur + sauvegarde dev | `front/src/game/npcBehavior/npcBehavior.ts`, route `PUT /__editor/npc-behavior` |
| Éditeur | `front/src/views/admin/AdminNpcView.vue`, `front/src/components/admin/npc/` |
| Validation serveur + exécution | `socket/src/npcBehavior.ts`, `socket/src/npcBrain.ts`, `socket/src/npcs.ts` |
| Affichage en jeu | `front/src/composables/game/useNpcBrains.ts` |
