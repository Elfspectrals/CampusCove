# Animaux (`map-src/CampusCove/build_animals.py`)

Un animal CampusCove garde le squelette et les clips d'un animal CC0 de Quaternius, mais porte notre propre maillage :
des pièces low-poly pastel (corps, tête, bec, pattes…), chacune skinnée à 100 % sur un os. Pas de rigging à la main,
pas d'outil payant ni de GPU cloud.

## Sources

Les GLB Quaternius sont dans `docs/quaternius/` (licence CC0 1.0, liste et provenance dans son `README.md`) :
`build_animals.py` relit le squelette et les clips à chaque rebuild.

Le « Chicken » `ineV9pU5VL` est un monstre sans pattes (rig « blob » de 4 os), comme le pigeon `9NGlBTpDEr` : pas des
modèles de ferme.

## Familles de squelettes

Quaternius fait un squelette et un jeu de clips par type de corps (oiseau, petit quadrupède, grand quadrupède),
puis pose une autre forme dessus. Os, hiérarchies, axes et clips de chaque famille : `docs/animation/skeleton-animals.md`.
Créer un nouveau clip : agent `animator` et `docs/animation/playbook.md`.

## Ajouter un animal

1. Choisir le modèle selon le type de corps : oiseau (canard, oie, dinde) → poulet ; petit quadrupède (chien, chat,
   chèvre, lapin) → cochon ou mouton ; grand quadrupède dont le cou ou la queue plie (cheval, cerf, âne) → vache.
2. Ajuster les proportions si besoin en déplaçant les os au repos. Un changement modéré garde les clips ; un très
   long cou demande de nouveaux clips.
3. Écrire une fonction par animal dans `build_animals.py` : `import_rig(<source>)`, puis une `skinned_piece(...)` par
   pièce et par os. Sur la vache, une pièce à cheval sur une articulation reçoit des poids automatiques
   (`parent_set(type="ARMATURE_AUTO")`) au lieu d'un os unique.
4. L'ajouter à `ANIMALS`, lancer le script dans Blender, puis `npm run assets:optimize -- animals <clé>`.

Un type de corps absent des familles (poisson, serpent, araignée) demande un nouveau squelette et de nouveaux clips.

## Contrat de sortie

- `front/public/assets/animals/<clé>/model.glb` : une armature, une `SkinnedMesh` par pièce (nom `<Animal>_<Pièce>`),
  matériaux `AN_<Animal>_<Pièce>` (une slot par couleur, pour les variantes).
- Clips renommés en minuscules (`idle`, `idle_peck`, `run`…), en place (pas de déplacement racine).
- Pieds au sol (y entre 0 et 3 cm au repos), hauteur fixée par `scale_to_height`.
- L'animal regarde vers +Z côté jeu. Le nœud armature garde l'échelle et la rotation du rig Quaternius (en
  centimètres) : three.js l'affiche bien, mais la boîte englobante de `gltf-transform inspect` est fausse.

## Poulet

648 triangles, 11 pièces, 5 matériaux, 57 Ko après optimisation, 0,45 m de haut. Le pack n'a pas de marche : `walk`
est écrit en code (`bird_walk`, 0,83 s), voir `docs/animation/skeleton-animals.md`.
