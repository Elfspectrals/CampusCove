# Personnage : création et apparence

Contrat entre Laravel, le socket, le front et les scripts Blender pour le personnage que chaque joueur crée à sa
première arrivée en jeu, puis modifie avec la touche d'éditeur. Laravel est la source de vérité ; le socket et le front
lisent et valident les mêmes valeurs.

## Champs

| Champ | Type | Valeurs | Stocké dans |
|---|---|---|---|
| `sex` | string | `m`, `f` | `accounts.character_sex` |
| `face` | int | 1 à 6 (6 visages par sexe) | `accounts.character_face` |
| `build` | string | `slim`, `normal`, `broad` | `accounts.character_build` |
| `hair` | string | `basic`, `short`, `long`, `curly`, `buzz`, `ponytail` | emplacement `hair` (objet `COS_WEAR_HAIR_*`) |
| `skin_color` | string | `#RRGGBB` | `accounts.cosmetic_colors.body` |
| `hair_color` | string | `#RRGGBB` | `accounts.cosmetic_colors.hair` |

Source des listes : `CharacterAppearanceService` (backend). Sexe, visage et carrure sont tous vides ou tous remplis
(contrainte SQL `ck_accounts_character_complete`).

## API

`GET /api/character/cosmetics` et `PUT /api/character/cosmetics` renvoient aussi `character: { sex, face, build }`
(ou `null` avant la création) : c'est ce que le front utilise pour construire l'avatar.

`GET /api/character/appearance` (connecté) renvoie les champs ci-dessus plus `created` (bool). `created: false` : le
front ouvre le créateur avant de faire apparaître le joueur ; `sex`, `face`, `build` et `hair` peuvent alors être `null`.

`PUT /api/character/appearance` (connecté) reçoit **tous** les champs (pas de mise à jour partielle) et renvoie le même
objet que le `GET`. Chaque champ est validé (422 `errors.<champ>` sinon). Gratuit, rejouable sans effet de bord :

- toutes les coupes sont gratuites : la coupe choisie est donnée si besoin puis équipée (elle retire un casque porté) ;
- le **premier** enregistrement donne et équipe la tenue nouveau ; les suivants ne touchent pas aux vêtements.

## Tenue nouveau et mort

Tenue : `COS_WEAR_TOP_NEWCOMER`, `COS_WEAR_BOTTOM_NEWCOMER`, `COS_WEAR_SHOES_NEWCOMER` (liées au compte, non
échangeables, jamais vendues). À la mort (`POST /api/survival/hospital`) :

- les vêtements **portés** achetés en coins (haut, bas, chaussures, accessoire de tête) sont détruits ;
- la garde-robe, la coupe, les skins et tout ce qui est acheté en gemmes restent ;
- le joueur est rhabillé : corps par défaut, pas d'accessoire de tête, tenue nouveau.

## Socket

Le personnage voyage avec la tenue : options de connexion à la room et message client `appearance`, champ
`character: { sex, face, build }` (mêmes valeurs que l'API). Le serveur (`normalizeCharacter`, `socket/src/players.ts`)
garde l'objet entier ou le remplace par `null` si un champ manque ou sort des valeurs ; `null` = corps `m_normal`,
visage 1. Il est renvoyé tel quel dans `publicPlayer` et `appearance_updated`.

Les URL de modèles partagées restent celles de référence (`.../model.glb`, filtrées par `normalizeSlotModels`) :
chaque client en déduit le fichier de la bonne morphologie depuis `character`. Après une mort
(`survival_respawn`), le client relit sa tenue (`GET /api/character/cosmetics`) et la renvoie avec `appearance`.

## Front

- `src/avatar/characterLook.ts` : valeurs, URL de chaque morphologie, palettes de peau et de cheveux, tenue nouveau.
- `components/game/GameCharacterCreator.vue` : écran de création (avant la première apparition, `GameView` attend
  sa validation) et éditeur (touche `characterEditor`, **P** par défaut, modifiable dans les réglages).
- Au réveil à la clinique, le front relit toujours sa tenue et la renvoie au socket.

## Modèles 3D

Un seul squelette (21 os, même ordre, même pose de repos) pour tous les corps et vêtements : les clips Idle, Walk, Run
et Sit jouent pareil sur chaque personnage. Détails : `front/scripts/skins/README.md`.

- Morphologie `fit` = `<sex>_<build>`, par exemple `f_broad`. `m_normal` est la référence.
- Corps : `/assets/wear/base/model.glb` pour `m_normal`, sinon `/assets/wear/base/model_<fit>.glb`.
- Hauts et bas : `/assets/wear/<slot>/<key>/model.glb` pour `m_normal`, sinon `model_<fit>.glb` dans le même dossier.
  Cheveux, accessoires de tête et chaussures : un seul `model.glb`.
- Chaque fichier de corps contient les 6 visages de son sexe : maillages `extras.region = "face"`,
  `extras.face = 1..6`. Le front affiche celui choisi et cache les autres.
- Teintes : matériau `Skin` = `skin_color` ; matériau `BB_Brow` (sourcils, barbe, moustache) = `hair_color`.
- Mèches sculptées : une coupe qui a un sculpt (`front/scripts/skins/sculpts/hair_<key>.glb`) porte une normal map
  (`normalTexture`, WebP 512 px) dans son matériau `W_hair_<key>_Main`. La teinte `hair_color` change seulement la
  couleur, la normal map reste. `buzz` n'en a pas.
