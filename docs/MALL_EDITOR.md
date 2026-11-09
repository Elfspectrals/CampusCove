# Mall Editor — aménager les cellules du centre commercial

`/admin/mall-editor` est un éditeur de niveau dans l'esprit d'Unreal Engine : on compose un **template** (un aménagement de
boutique : décors, articles en vente, NPC, mannequins, lumières, murs texturés) puis on le pose dans une **cellule libre**
du Cove Parkview Mall. Le contrat technique (fichiers, repère, rebuild) est dans [MALL.md](MALL.md#templates-de-cellule-adminmall-editor).

## Accès

1. Compte admin : `make set-admin EMAIL=…`, puis se reconnecter.
2. Lancer le front en local (`make up` ou `npm run dev` dans `front/`) et ouvrir `/admin/mall-editor` (menu admin
   « Mall Editor »).
3. **Sauver et assigner ne marchent qu'en local** : un endpoint réservé au serveur Vite de dev écrit les fichiers dans le
   repo. En production, l'éditeur est en lecture seule (on peut ouvrir et parcourir les templates assignés).
4. Dans Docker, installer les dépendances du front une fois : `docker compose exec front npm ci` (Tweakpane).

## L'écran

| Zone | Rôle |
|---|---|
| Barre du haut | Nom et clé du template, **bouton carte** (cellule visée et sa taille), New, Open, Save, Test, Undo / Redo |
| Viewport (centre) | Scène 3D de la cellule : sol, murs, vitrine (translucide, côté +Z), grille |
| Barre du viewport | Modes Select / Move / Rotate / Scale, snap de grille, de rotation et d'échelle |
| Outliner (droite, haut) | Tous les objets posés, œil pour masquer dans l'éditeur, type, compteur |
| Détails (droite, bas) | Réglages de l'objet sélectionné ; sans sélection, les surfaces de la cellule |
| Content Browser (bas) | Dossiers Decor (par catégorie), Sellable, NPC, Mannequin, Lights, recherche, miniatures |

Les trois poignées (entre viewport et colonne de droite, entre Outliner et Détails, au-dessus du Content Browser) se
glissent pour redimensionner ; les tailles sont mémorisées dans le navigateur. Chaque panneau défile à l'intérieur et se
replie en cliquant son titre. Les listes (modèles, matériaux, textures, tenues) ont une recherche et des miniatures, les
couleurs s'ouvrent dans un sélecteur avec carré de teinte, hex, ancienne / nouvelle couleur, couleurs récentes et pipette.
L'échelle se règle par axe (X, Y, Z) au gizmo ou dans les Détails.

## Créer un template, pas à pas

1. **Choisir la cellule** : bouton carte de la barre du haut. Vert = libre, rouge = occupée (magasin ouvert, passage,
   travaux, autre template), contour jaune = contient ce template. Flèches pour changer d'étage. Cliquer une cellule,
   puis **Build for this cell** : l'éditeur prend sa taille. Un template vaut pour toutes les cellules de la même taille.
2. **Placer** : cliquer une miniature du Content Browser, puis cliquer au sol dans le viewport (fantôme vert = possible,
   rouge = hors de la cellule). Échap annule.
3. **Ajuster** : cliquer un objet (ou sa ligne dans l'Outliner), puis gizmo ou panneau Détails.
4. **Nommer et sauver** : nom lisible + clé de fichier (`a-z`, `0-9`, `_`), puis **Save** (point = modifications non
   sauvées). Le fichier part dans `front/public/assets/store/mall/templates/<clé>.json`.
5. **Assigner** : rouvrir la carte, cliquer une cellule verte de la même taille, **Assign … here**. **Clear** la libère.
6. **Tester** : **Test** pour marcher dedans en première personne (WASD, souris, Échap pour sortir).
7. **Ouvrir la cellule en jeu** : rebuild du mall (voir plus bas), puis commit.

## Raccourcis

| Touche | Effet |
|---|---|
| Clic gauche glissé | Orbiter |
| Clic droit maintenu + WASD / Q E, Shift | Voler dans la scène (plus vite avec Shift) |
| Molette, clic milieu | Zoom, déplacer la vue |
| Q / W / E / R | Select / Move / Rotate / Scale |
| Espace | Passer de Move à Rotate puis Scale |
| Suppr ou Retour arrière | Supprimer la sélection (aussi la poubelle de l'Outliner et le bouton Delete des Détails) |
| Cmd/Ctrl + D | Dupliquer |
| Cmd/Ctrl + Z, Shift + Cmd/Ctrl + Z ou Ctrl + Y | Annuler, rétablir |
| Échap | Annuler un placement, quitter le test, fermer la carte |

## Ce qu'on peut poser

| Dossier | Objet | Réglages (panneau Détails) |
|---|---|---|
| Decor | Meuble / déco, rangé par catégorie (`decor/categories.json`) | Modèle, **For sale** (si le catalogue le vend), **Materials** : texture et/ou couleur par matériau, couleur par type |
| Sellable | Article du catalogue (meubles, nourriture, bonbons, épicerie…) | **For sale** (décoché = simple déco), pile colonnes × rangées |
| NPC | Figurant | Pose (debout / assis), **Vendor** (un seul par cellule : tient le comptoir et la caisse), peau, tenue pièce par pièce avec couleur |
| Mannequin | Mannequin immobile | Couleur du corps, tenue pièce par pièce, **for sale** par pièce |
| Lights | Lumière ponctuelle ou spot | Couleur, intensité, portée, angle et inclinaison du spot ; 8 maximum par cellule |

Sans sélection, le panneau **Cell** règle le mur gauche, le mur droit, le mur du fond, le sol et le plafond.

## Matières, couleurs et types

Chaque surface et chaque matériau de décor accepte :

- (décors) un **matériau** de la bibliothèque (`front/public/assets/materials/`, extraite des décors existants par
  `node front/scripts/extract-materials.mjs`) : bois, tissu, métal, céramique, peinture…, avec sa texture, sa couleur et
  son aspect mat / brillant / métallique ;
- une **texture** de la bibliothèque (`front/public/assets/textures/`, rangée par catégorie) ;
- une **couleur** : seule, elle repeint la matière en uni ; avec une texture, elle la teinte ;
- une **couleur par type** (`· Bricks`, `· Mortar`, `· Planks`, `· Gaps`…) : recolore d'un coup toutes les briques, tous les
  joints, etc., en gardant les nuances d'origine.

Les types viennent d'un masque généré par `map-src/CampusCove/texture_parts.py` ; une matière d'une seule couleur n'a pas
de types. Un article **en vente** garde son aspect : seuls les décors (et les objets non vendus) se personnalisent.

## Vendre

- Un article coché **For sale** se vend dans la cellule. Sans vendeur, un clic l'achète. Avec un NPC **Vendor**, le
  joueur remplit un panier et paie au comptoir devant le vendeur.
- Pièces de mannequin cochées **for sale** : viser une pièce l'ajoute au panier, **Shift + interagir** ajoute tout le
  look ; une pièce déjà possédée n'est pas ajoutée.

## Rendre la cellule visible en jeu

Assigner écrit `front/public/assets/store/mall/template_assignments.json`. La cellule reste derrière sa vitrine tant que
le mall n'est pas reconstruit :

1. Blender : `build_mall.py` (voir [MALL.md §5](MALL.md#5-ordre-et-vérification)) retire vitrine, mur sombre et habillage
   des cellules assignées ;
2. `cd front && npm run assets:optimize -- store && node scripts/apply-mall.mjs` ;
3. commiter le template, `template_assignments.json` et les assets du mall.

Le jeu refuse une cellule dont l'assignation ne correspond pas au build (message `rebuild the mall` en console).

## Ajouter du contenu

| Besoin | Commande | Puis |
|---|---|---|
| Nouvelle texture | `make texture "a red brick wall" [TILE=2.0] [CATEGORY=stone] [PARTS=bricks,mortar]` | Elle apparaît dans les listes de textures |
| Nouveau décor IA | `make model "a wooden lantern" [HEIGHT=1.2] [TRIS=400] [PARTS=…]` | Copier `model.glb`, `collision.json`, `parts.json` et `parts_*.png` dans `decor/<clé>/`, ajouter la clé à `decor/categories.json` (règle dans `.claude/rules/assets.md`) |
| Texture ou décor modifié à la main | `make texture-parts` | Régénère les types de toute la bibliothèque, garde les noms déjà donnés |
| Textures extraites des GLB existants | `node front/scripts/extract-textures.mjs` | Recopie les 30 matières de base du mall et des intérieurs, puis lancer `make texture-parts` |

## Dépannage

| Message | Cause |
|---|---|
| « Saving only works on the local dev server » | Page servie par un build de prod : lancer le serveur Vite local |
| « Not placeable (model path does not match its code) » | Article du catalogue dont le `model_glb` ne correspond pas à son code |
| « Not in decor/categories.json » | Dossier de décor sans catégorie : l'ajouter au fichier |
| « missing assets: … » à la sauvegarde | Modèle, pièce de tenue ou texture absent du disque |
| « … missing, run make texture-parts » | `parts.json` absent pour un décor |
| « … is assigned … but the mall was built with … » | Assignation changée sans rebuild du mall |
