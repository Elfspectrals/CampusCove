# Mall Editor — aménager les cellules du centre commercial

`/admin/editor` est un éditeur de niveau dans l'esprit d'Unreal Engine : on compose un **template** (un aménagement de
boutique : décors, articles en vente, NPC, mannequins, lumières, murs texturés) puis on le pose dans une **cellule libre**
du Cove Parkview Mall. Le contrat technique (fichiers, repère, rebuild) est dans [MALL.md](MALL.md#templates-de-cellule-admineditor).

## Accès

1. Compte admin : `make set-admin EMAIL=…`, puis se reconnecter.
2. Lancer le front en local (`make up` ou `npm run dev` dans `front/`) et ouvrir `/admin/editor` (menu admin
   « Editor »).
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
| Content Browser (bas) | Dossiers Decor et Goods (par catégorie), NPC, Mannequin, Lights, recherche, miniatures |

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
| F, double-clic sur un objet | Cadrer la sélection : la caméra glisse jusqu'à l'objet en gardant l'angle de vue |
| Shift + clic (vue ou Outliner) | Ajouter ou retirer un objet de la sélection |
| Cmd/Ctrl + glisser dans la vue | Sélectionner au cadre (avec Shift : ajoute à la sélection) |
| Cmd/Ctrl + G, Shift + Cmd/Ctrl + G | Grouper la sélection, dégrouper (aussi les boutons Group / Ungroup) |
| Alt + clic | Choisir un seul membre d'un groupe |
| Q / W / E / R | Select / Move / Rotate / Scale |
| Espace | Passer de Move à Rotate puis Scale |
| Suppr ou Retour arrière | Supprimer la sélection (aussi la poubelle de l'Outliner et le bouton Delete des Détails) |
| Cmd/Ctrl + D | Dupliquer |
| Cmd/Ctrl + Z, Shift + Cmd/Ctrl + Z ou Ctrl + Y | Annuler, rétablir |
| Échap | Annuler un placement, quitter le test, fermer la carte |

## Ce qu'on peut poser

| Dossier | Objet | Réglages (panneau Détails) |
|---|---|---|
| Decor | Meuble / déco, rangé par catégorie (`decor/categories.json`) | Modèle, **For sale** (si le catalogue le vend, aussi dans l'Outliner avec son prix), **Materials** : matériau, texture et/ou couleur par slot, couleur par type |
| Goods | Nourriture, boissons, bonbons, épicerie, soins du catalogue | **For sale** (décoché = simple déco, aussi dans l'Outliner avec son prix), pile colonnes × rangées quand c'est en vente |
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

- Un article coché **For sale** se vend dans la cellule. Sans vendeur, un clic l'achète. Avec un NPC **Cashier**, le
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

## Décorer une zone du monde ouvert

Le sélecteur **Zone…** de la barre du haut ouvre une zone de `world.manifest.json` : son modèle, ses bâtiments et leurs
intérieurs servent de fond. Le sélecteur ne liste que les zones principales, par leur nom (`retail_park` s'appelle
**Campus Home**). Les six boutiques du mall sont des zones à part : dans le mall, leur contenu s'affiche en lecture
seule, un clic dessus propose **Open … editor**, et **Shops map** ouvre le plan du mall pour en choisir une. Une boutique
s'ouvre seule (son bâtiment, ses props), avec **Back to Mall** et le fil `Zone · Mall › <boutique>` en haut ; son fichier
porte `"parent": "mall"` et ses `bounds`. Les cellules du mall restent décorées par templates, on pose décors, objets vendables, NPC, mannequins, champs (dossier **Fields**, voir
[FARM.md](FARM.md#champs-modulaires)) et animaux (dossier **Animals**, voir [FARM.md](FARM.md#animaux)) en coordonnées monde, posés sur la surface cliquée. Pas
de lumière ni de matière personnalisée sur les décors d'une zone. **Test** marche à partir du point visé, dans les
limites de la zone.

**Save** écrit `front/public/assets/zones/<zone>.json` et l'ajoute à `zones/index.json` (endpoint de dev, comme les
templates). En jeu :

- NPC, mannequins, animaux et objets vendables sont chargés au démarrage de `/game` : recharger la page suffit. Chaque
  zone **vendeur** de la carte **Sellers** est un magasin : son NPC encaisse le panier des objets à vendre posés dans son
  rectangle, tant que le joueur y est (hors bâtiment et hors cellule du mall).
- Les décors sont **cuits** dans le GLB de la zone, avec leurs collisions dans `town.collision.json` :
  `cd front && npm run zone:bake -- <zone>` (Blender headless, `assets:optimize`, `apply-<zone>.mjs`). L'éditeur le
  rappelle après un Save qui change les décors. Zones cuisables : `orchard`, `farm` (table `ZONES` de
  `front/scripts/bake-zone.mjs` ; une nouvelle zone appelle `L.zone_decor()` dans son `build_*_site.py`).
- Dans le GLB, chaque décor cuit est un nœud `ZD_<id>_<clé>` ; l'éditeur masque ces nœuds du fond pour ne montrer que
  les décors éditables.

### Bâtiments

Le dossier **Buildings** pose un bâtiment visitable d'après un modèle de `front/public/assets/buildings/buildings.json`
(`farmhouse`, `barn` : épaisseur des murs, motifs, taille et hauteur minimales, valeurs par défaut). Les Détails règlent
la largeur, la profondeur, la hauteur des murs et du toit, l'axe du faîtage, les portes et fenêtres (côté `front` /
`back` / `left` / `right` du bâtiment, décalage depuis le milieu du mur, largeur, bas et haut) et la couleur de chaque
partie (murs, toit, encadrements, sol, porte). Chaque partie peut aussi prendre une texture de la bibliothèque
(`textures/`, répétée selon son `tileMeters`) : la couleur la teinte, et choisir une texture remet la couleur en blanc. Un
bâtiment tourne par quarts de tour, à l'échelle 1, posé au sol (hauteur 0). Le toit d'un bâtiment ne touche pas celui
d'un autre, et les portes de la grange gardent de la place de chaque côté pour leurs battants coulissants
(`slidingDoors` dans `buildings.json`).

**Rebuild** construit le bâtiment dans Blender (headless, `map-src/CampusCove/build_building.py`, environ 1 s) et
l'affiche ; à l'ouverture d'une zone, l'éditeur demande l'aperçu de chaque bâtiment (gardé dans
`map-src/CampusCove/out/building_previews/`, par forme et couleurs). Sans aperçu, un bloc murs + toit le remplace. Le
serveur de dev lance `blender` (ou `BLENDER=/chemin`) : Rebuild ne marche pas dans le conteneur Docker du front.

Au **bake**, `lib_buildings.zone_buildings` construit chaque bâtiment au même endroit (nœuds `FB_<id>_*`, masqués dans le
fond de l'éditeur), avec ses collisions, dans la ferme comme dans le verger.

### Groupes

Plusieurs objets sélectionnés (Shift + clic ou cadre) bougent et tournent ensemble autour de leur centre ; une sélection
qui contient un bâtiment tourne par quarts de tour. **Group** (Cmd/Ctrl + G) les garde ensemble : chaque objet reçoit
`"group": "group_N"` dans le fichier, un clic sur l'un d'eux sélectionne tout le groupe, Alt + clic n'en prend qu'un.
Grouper un bâtiment avec ses meubles les fait suivre quand on le déplace. Le bake ignore les groupes.

### Vendeurs et acheteurs

Le bouton **Sellers** (zone ouverte) affiche la zone vue du dessus. **New area** puis glisser sur la carte trace un
rectangle ; chaque rectangle a un nom, un rôle et un NPC qui s'y tient :

- **Seller** : vend le panier des objets **For sale** posés dans le rectangle. Il se tient debout, échelle 1, avec son
  comptoir (devant lui) dans le rectangle. Deux vendeurs ne se chevauchent pas ; un objet à vendre hors de tout vendeur
  est refusé à l'enregistrement.
- **Buyer** : achète aux joueurs les objets listés (prix plein jusqu'à un quota par joueur et par jour, puis prix
  réduit, comme les pommes du verger : 3 pièces, puis 1 après 300). Le graphique compare les pièces gagnées en une
  journée avec la cueillette de pommes, et signale une offre trop rentable ou un objet vendu moins cher dans une
  boutique. Le calcul est dans `front/src/game/economy/sharemath.ts`, vérifié par les mêmes valeurs que l'API
  (`backend/tests/fixtures/sale_curve_vectors.json`).

En jeu, viser un acheteur ouvre son menu de vente ; le serveur temps réel vérifie que le joueur est à 3 m de lui et
l'API paie selon la courbe (`ZoneBuyerService`, `App\Support\SaleCurve`). Le serveur temps réel vérifie les acheteurs de
`zones/*.json` au démarrage (`loadZoneBuyers`), puis relit le fichier de la zone à chaque vente : un acheteur déplacé
compte tout de suite, seule une zone ajoutée à `zones/index.json` demande de le redémarrer. Un acheteur n'achète que
des consommables.

Les zones sont dans `areas` du fichier de zone ; l'Outliner affiche le rôle de chaque NPC. Annuler/rétablir ne couvre pas
encore les zones de vente.

Un objet **For sale** dans une zone a son propre prix (**Price (coins)**, prérempli avec le prix du catalogue), différent
du reste du jeu. **Save** copie la liste des prix dans `backend/resources/zones/<zone>.json` ; si le serveur de dev ne voit
pas `backend/` (conteneur Docker du front), lancer `npm --prefix front run zone:prices`. Un test front vérifie que la
copie suit le fichier de zone. En jeu, le panier d'une zone se paie par le serveur temps réel (`zone_checkout`), qui
vérifie que le joueur est dans la zone, puis `POST /api/zone/checkout` débite les prix de la zone.

Commiter `zones/`, `backend/resources/zones/`, le GLB et le layout de la zone, `town.collision.json`.

### Boutiques et personnel

Toutes les boutiques marchent pareil : une zone **Seller** autour de la boutique, un vendeur debout derrière un comptoir
(`decor/checkout_counter`, dossier **Shop**, ou le comptoir du bâtiment), les objets **For sale** et les mannequins dans
la zone. Le joueur remplit son panier en visant les objets, puis paie au vendeur. Cove Home, Cove Threads, la pharmacie
de la clinique, le Campus Cafe et les six boutiques du mall sont dans `zones/retail_park.json`, `fashion.json`,
`clinic.json`, `work_district.json` et un fichier par boutique du mall (`hearth_hollow.json`, `greencart.json`…) ; leurs anciens layouts d'intérieur ne sont plus lus pour les ventes.

- **Price tags beside each item** (carte Sellers) pose une étiquette de prix devant chaque objet de la zone.
- Un objet à vendre peut avoir une **Description**, affichée quand on le vise.
- Un mannequin vend les pièces cochées **For sale**, chacune à son **Price (coins)** ; **Clothes only (no body)**
  n'affiche que les vêtements (une pièce sur un portant).
- Les vendeurs portent des pièces de `wear/` : celui de Cove Home porte `top/staff_polo` (polo jaune « CH »).
- Le mobilier d'une boutique est en props, pas cuit dans l'intérieur : à Crispin's Hardware, les étagères
  (`shop_rack`), le comptoir (`checkout_counter`), le présentoir (`display_plinth`), le kiosque à clés, le râtelier à bois,
  les panneaux d'outils et le nuancier de peinture viennent de `map-src/CampusCove/build_shop_decor.py` (dossier
  **Shop**). L'intérieur ne garde que murs, sol, plafond, lumières et enseignes. Les objets posés, vendus ou non, ont
  leur collision en jeu. Toutes les caisses sont un `checkout_counter`.
  - Candy Cloud : étagères à bocaux, îlot pick & mix, arbre à sucettes, machine à barbe à papa, plateau de pommes
    d'amour, présentoir à chewing-gums.
  - Summit Sports : portants muraux, tables de pliés, podium des mannequins, rack d'haltères, tapis de yoga, tapis de
    course, panier de basket.
  - Hearth & Hollow : étagères à bibelots, tables de présentation, socles en béton, plantes.
  - Northline : portants à miroir, mur à chaussures, tables à têtes, tables de pliés, portants ronds, cubes, podium,
    plantes.

**Staff role** (Détails d'un NPC) donne au NPC un rôle de jeu : `bartender` et `bouncer` au pub, `nurse` à la clinique.
Chacun existe une seule fois dans sa zone. **Save** (ou `npm --prefix front run zone:prices`) recopie leur position dans
`world.manifest.json` (`pub.bartender`, `pub.bartenderYaw`, `pub.bouncer`, `clinic.nurse`), que lisent le jeu et le
serveur temps réel ; redémarrer le serveur temps réel après les avoir déplacés. Les anciens NPC cuits dans les intérieurs
(`NPC_Bartender`, `NPC_Bouncer`, `NPC_Nurse`) sont masqués au chargement.

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
