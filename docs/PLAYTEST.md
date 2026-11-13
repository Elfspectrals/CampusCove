# Guide de test des fonctionnalités V1

Ce guide dit comment essayer chaque fonctionnalité arrivée sur `main` le 2026-11-13. Rien de ce qui suit n'a encore été joué en vrai à plusieurs : c'est le but de cette partie.

## 1. Préparation (une fois)

```bash
make up
make migrate
make seed
make seed-shop
make rebuild-socket
make playtest-accounts
make set-admin EMAIL=<email du compte de test>
```

- `composer install` dans `backend/` si l'API se plaint de Stripe.
- `make seed` ajoute les maisons de Cove Heights, `make seed-shop` les outils, le crochet, la serrure renforcée et l'alarme.
- `make playtest-accounts` crée deux comptes de plus de 72 h. Beaucoup de fonctions refusent un compte plus jeune (vol, crochetage, marché, enchères, gain du quiz).
- Pour jouer à deux, ouvre deux onglets, un par compte.
- Argent de test : `make set-money ACCOUNT=<id ou email> CURRENCY=coins SUM=5000`.
- Tests backend sur ce Mac : `TZ=UTC PGTZ=UTC`, sinon 17 tests échouent (problème déjà présent sur `main`).

## 2. La montre et l'appli Admin

- **T** ouvre la montre. Flèches pour choisir, Entrée pour agir, Retour arrière pour revenir.
- Applis : GPS, Banque, Contacts, Échange (Y/N pour répondre), Alarme, et **Admin** pour un compte admin.
- Admin : téléportation à chaque porte de bâtiment, au verger, à la ferme, au marché, à Cove Storage et au portail de Cove Heights ; faire venir un joueur ; ligne Événements avec « Start the storage sale ».

## 3. Fonctionnalités

| Fonction | Où | Comment l'essayer | À deux |
|---|---|---|---|
| **Tutoriel** | Sortie du créateur | Compte **neuf** obligatoire. Cueillir 6 pommes, en manger une, vendre au fermier, déposer au distributeur du verger, une partie de fléchettes gratuite au pub. On le passe depuis le journal de quête, on le reprend dans les réglages. | Badge « Nouveau citoyen » visible par l'autre |
| **Tâches** | Partout | **J** ouvre le menu ; un panneau sur la page d'accueil. Les paliers Bronze, Argent, Or montent avec les vraies actions (cueillir, vendre, fléchettes, manger, zones visitées, salle secrète). Bannière et carillon à chaque palier. | Tâches de duel aux fléchettes |
| **Outils** | Crispin's Hardware | Acheter sur les panneaux muraux (sécateur 180, autres 120). Sécateur en main : cueillette en 2 s. En combat, on frappe avec l'outil tenu ; il s'use. À la mort il tombe dans le sac. | Combat, outil vu en main, sac (le tueur ne peut pas le prendre) |
| **Crochetage** | Porte d'une maison d'un autre | Acheter un crochet (120) chez Crispin's. Mini-jeu de goupilles. Pas de clé de la maison. La porte arrière de Tidewater (B-01) marche aussi. | Oui |
| **Serrure et alarme** | Crispin's, puis sa maison | Serrure renforcée 600 (plus de goupilles), alarme 400. L'alarme sonne au deuxième raté et s'affiche dans l'appli Alarme du propriétaire. | Oui |
| **Meubles utiles** | Dans une maison | Commode, coffre à jouets et frigo servent de rangement. Utiliser un lit en fait le point de réveil après un KO. | Non |
| **Colocation** | Sa maison | Le propriétaire ajoute un colocataire avec **K** ; la taxe monte de 25 % par colocataire. Le colocataire part avec **F2** deux fois en 3 s à la porte. | Oui |
| **Déco et garde-meuble** | Maison, puis Cove Storage (au sud du parc de l'étang) | Limite de meubles selon la taille, rotation de 5° à la molette. Pour l'enchère : `make collect-taxes` saisit une maison qui n'a pas payé ; vente lancée depuis Admin ou à 19 h. Enchérir avec **G** dans le cercle devant le commissaire-priseur (compte de 72 h+ avec de l'argent en banque). | Pour une vraie enchère |
| **Quiz au pub** | Animateur au bout du bar | Tous les soirs à 21 h (annonces à 20 h 50 et 20 h 59). S'inscrire à moins de 3 m, 15 questions, clic ou touches 1 à 4. Payé seulement avec 2 joueurs de 72 h+ ayant 12 réponses. Pas encore de bouton pour le forcer. | Oui ; un 3e pour le tableau des spectateurs |
| **Marché** | Place à l'est, ouverture de la haie vers (42,6, −17,6) | Samedi de 15 h à 17 h, ou `MARKET_OPEN_NOW=1` dans `backend/.env` (avec `APP_ENV=local`), puis redémarrer l'API et le socket. Vendeur : prendre un stand pour 15 en cash, choisir la couleur, poser un lot. Acheteur : viser le lot, **G** pour payer en cash. Taxe de 5 % à partir de 20. | Oui |
| **Police** | Poste au nord-est, porte en (87,6, 34) | Acheter la licence à l'accueil, prendre son service avec **E** aux casiers (0 étoile). Menotter, mettre en cellule avec **E** à une porte de cellule (15 min). Les délits donnent des étoiles ; sans policier joueur, la police PNJ prend le relais. | Oui |
| **Pickpocket** | Dans le dos d'un joueur | **L** à 1,5 m, dans le dos de la victime. Mini-jeu très serré, puis 5 s pour choisir une pile de l'inventaire. Jamais le cash, les vêtements portés, les meubles ni les objets en gemmes. | Oui |
| **Cove Heights** | Portail en (−247, −158), par Cove Road depuis l'avenue du mall | Cinq maisons, de 14 000 (Tidewater) à 32 000 (Skyline). Acheter avec **F2** à la porte. Terrasse du toit du garage de A-04, galerie à deux étages de B-01, porte arrière de B-01 (même serrure que l'avant). | Non |

## 4. Ce qui reste à vérifier

- Tout ce qui précède à plusieurs vrais joueurs, en particulier le marché, la police, le quiz et l'enchère.
- Le brouillon des PNJ (#93) n'est pas sur `main`.
