# Modèle de données

PostgreSQL 16, une soixantaine de tables. Le schéma de base vient de `backend/database/schema/campus_cove_schema.sql`, les évolutions de `backend/database/migrations/`. Les tables techniques de Laravel (`cache`, `jobs`, `sessions`, `personal_access_tokens`...) ne sont pas représentées.

Un seul diagramme serait illisible : le modèle est découpé en six domaines. Une table qui apparaît dans plusieurs domaines (souvent `ACCOUNTS`) est la même table. Seules les colonnes utiles à la compréhension sont listées.

## Vue d'ensemble

```mermaid
flowchart LR
    ID["Identité & social<br/>accounts, characters, friendships, guilds"]
    ECO["Économie<br/>wallets, wallet_ledger, transactions, gem_orders"]
    INV["Objets & inventaire<br/>item_defs, item_instances, containers, stacks"]
    SHOP["Boutique<br/>shop_catalog_items, purchases"]
    WORLD["Monde & logement<br/>servers, buildings, rooms, housing_units"]
    TRADE["Échanges<br/>trade_sessions, marketplace, gifts"]
    MOD["Modération & sécurité<br/>sanctions, reports, ip_bans, scans"]

    ID --> ECO
    ID --> INV
    SHOP --> INV
    SHOP --> ECO
    WORLD --> INV
    TRADE --> INV
    TRADE --> ECO
    MOD --> ID
    WORLD --> ID
```

## 1. Identité & social

```mermaid
erDiagram
    ACCOUNTS ||--|| ACCOUNT_AUTH_LOCAL : "se connecte par"
    ACCOUNTS ||--o{ ACCOUNT_AUTH_OAUTH : "se connecte par"
    ACCOUNTS ||--|| ACCOUNT_HANDLES : "pseudo#tag"
    ACCOUNTS ||--o{ ACCOUNT_ROLES : a
    ROLES ||--o{ ACCOUNT_ROLES : attribue
    ROLES ||--o{ ROLE_PERMISSIONS : contient
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "accordée par"
    ACCOUNTS ||--o{ CHARACTERS : possède
    SERVERS ||--o{ CHARACTERS : héberge
    CHARACTERS ||--o{ CHARACTER_NAME_HISTORY : historise
    ACCOUNTS ||--o{ FRIENDSHIPS : "compte A"
    ACCOUNTS ||--o{ FRIENDSHIPS : "compte B"
    ACCOUNTS ||--o{ REFERRALS : parraine
    ACCOUNTS ||--o| ACCOUNT_SURVIVAL_STATS : "faim, soif, santé"
    GUILDS ||--o{ GUILD_MEMBERS : regroupe
    GUILDS ||--o{ GUILD_ROLES : définit
    CHARACTERS ||--o{ GUILD_MEMBERS : rejoint

    ACCOUNTS {
        bigint account_id PK
        uuid public_id UK
        account_status status
        bool is_admin
        varchar referral_code
        timestamptz terms_accepted_at
        timestamptz age_confirmed_at
        timestamptz anonymized_at
    }
    ACCOUNT_AUTH_LOCAL {
        bigint account_id PK, FK
        citext email UK
        text password_hash
        bool email_verified
    }
    ACCOUNT_HANDLES {
        bigint account_id PK, FK
        text username
        smallint tag
        text normalized UK
    }
    CHARACTERS {
        bigint character_id PK
        bigint account_id FK
        bigint server_id FK
        text name
    }
    FRIENDSHIPS {
        bigint account_id_a PK, FK
        bigint account_id_b PK, FK
        friend_status status
        bigint requested_by FK
    }
    REFERRALS {
        bigint referee_account_id PK, FK
        bigint referrer_account_id FK
        timestamptz qualified_at
        bool referrer_rewarded
    }
    ACCOUNT_SURVIVAL_STATS {
        bigint account_id PK, FK
        float health
        float hunger
        float thirst
    }
```

## 2. Économie

```mermaid
erDiagram
    ACCOUNTS ||--o{ WALLETS : "owner_type = account"
    WALLETS ||--o{ WALLET_LEDGER : "mouvements"
    TRANSACTIONS ||--|{ WALLET_LEDGER : "écritures équilibrées"
    ACCOUNTS ||--o{ TRANSACTIONS : initie
    ACCOUNTS ||--o{ GEM_ORDERS : commande
    GEM_ORDERS |o--o| TRANSACTIONS : "livraison des gemmes"
    GEM_ORDERS ||--o{ STRIPE_WEBHOOK_EVENTS : "reçoit"

    WALLETS {
        bigint wallet_id PK
        text owner_type
        bigint owner_id
        currency_code currency "coins | cash | premium"
    }
    WALLET_LEDGER {
        bigint entry_id PK
        bigint wallet_id FK
        bigint tx_id
        bigint delta "solde = SUM(delta)"
        text reason
    }
    TRANSACTIONS {
        bigint tx_id PK
        tx_type type
        tx_status status
        bigint created_by_account_id FK
        jsonb meta_json
    }
    GEM_ORDERS {
        bigint id PK
        bigint account_id FK
        varchar pack_code
        int gems
        int amount_cents
        varchar status
        varchar idempotency_key UK
        bigint delivery_tx_id FK
    }
    STRIPE_WEBHOOK_EVENTS {
        bigint id PK
        varchar event_id UK
        bigint gem_order_id FK
        timestamptz processed_at
    }
```

## 3. Objets, inventaire & boutique

```mermaid
erDiagram
    ITEM_DEFS ||--o{ ITEM_INSTANCES : "exemplaires uniques"
    ITEM_DEFS ||--o{ INVENTORY_STACKS : "piles empilables"
    CONTAINERS ||--o{ ITEM_INSTANCES : contient
    CONTAINERS ||--o{ INVENTORY_STACKS : contient
    ACCOUNTS ||--o{ ITEM_INSTANCES : possède
    CHARACTERS ||--|| CHARACTER_INVENTORIES : "sac"
    CHARACTER_INVENTORIES ||--|| CONTAINERS : utilise
    ACCOUNTS ||--o| ACCOUNT_INVENTORY_LAYOUT : "barre d'action"
    ACCOUNTS ||--o{ ACCOUNT_LOCKER_COSMETICS : "casier"
    ITEM_DEFS ||--o{ ACCOUNT_LOCKER_COSMETICS : "skin débloqué"
    ACCOUNTS ||--o{ ACCOUNT_COSMETIC_EQUIPMENT : "porte (1 par slot)"
    ITEM_DEFS ||--o{ ACCOUNT_COSMETIC_EQUIPMENT : équipé
    ITEM_DEFS ||--o{ SHOP_CATALOG_ITEMS : "mis en vente"
    SHOP_CATALOG_ITEMS ||--o{ ACCOUNT_SHOP_PURCHASES : vendu
    ACCOUNTS ||--o{ ACCOUNT_SHOP_PURCHASES : achète
    TRANSACTIONS ||--|| ACCOUNT_SHOP_PURCHASES : "débit"
    ACCOUNTS ||--o{ ADMIN_ITEM_GRANTS : "reçoit d'un admin"
    ITEM_DEFS ||--o{ ADMIN_ITEM_GRANTS : donné

    ITEM_DEFS {
        bigint item_def_id PK
        text code UK
        item_kind kind
        smallint rarity
        bool tradable
        bool premium_only
        int max_stack
        text cosmetic_slot
        smallint hunger_per_portion
        smallint thirst_per_portion
        int max_uses "outil de métier, voir TOOLS.md"
        bool weapon "outil qui frappe plus fort que le poing"
        jsonb meta_json "matériel de sport : sport et slot, voir sports/CORE.md"
    }
    ITEM_INSTANCES {
        bigint item_instance_id PK
        bigint item_def_id FK
        bigint owner_account_id FK
        bigint container_id FK
        bigint locked_tx_id FK "verrou pendant un échange"
        int uses_left "usures restantes d'un outil"
    }
    CONTAINERS {
        bigint container_id PK
        container_type type
    }
    INVENTORY_STACKS {
        bigint stack_id PK
        bigint item_def_id FK
        bigint container_id FK
        int quantity
        smallint portions_used
    }
    SHOP_CATALOG_ITEMS {
        bigint shop_catalog_item_id PK
        bigint item_def_id FK
        bigint coins_price
        bigint premium_price
        bool is_published
        bool is_unique_per_account
        int stock_remaining
    }
    ACCOUNT_SHOP_PURCHASES {
        bigint purchase_id PK
        bigint account_id FK
        bigint shop_catalog_item_id FK
        bigint tx_id FK
        bigint total_debit
        currency_code currency
    }
    ADMIN_ITEM_GRANTS {
        bigint id PK
        uuid ref UK
        bigint admin_account_id FK
        bigint to_account_id FK
        bigint item_def_id FK
        int quantity "1 à 999"
    }
```

### Complexe sportif (`docs/sports/CORE.md`)

```mermaid
erDiagram
    ACCOUNTS ||--o{ SPORTS_PASS_PURCHASES : "achète un pass"
    TRANSACTIONS ||--|| SPORTS_PASS_PURCHASES : "débit cash détruit"
    SPORTS_MATCHES ||--o{ SPORTS_MATCH_PLAYERS : "résultats"
    ACCOUNTS ||--o{ SPORTS_MATCH_PLAYERS : joue

    SPORTS_PASS_PURCHASES {
        bigint id PK
        bigint account_id FK
        text ref "unique par compte (idempotence)"
        text kind "day ou week"
        timestamptz valid_until "fin du pass après cet achat"
        bigint cash_after
    }
    SPORTS_MATCHES {
        bigint id PK
        text ref UK "id de match du socket"
        text sport "un des 11 sports"
        text venue
        jsonb settings
        timestamptz started_at
        timestamptz ended_at
    }
    SPORTS_MATCH_PLAYERS {
        bigint sports_match_id FK
        bigint account_id FK
        text team "red, blue ou null"
        text result "win, loss, draw, finished, dnf"
        smallint place
        int time_ms
        int score
    }
```

Le matériel de sport est un `item_kind` `sports_gear` (pile de 1, jamais usé, pas une arme), qui tombe dans le sac de
mort avec le cash et n'est jamais volé.

## 4. Monde & logement

```mermaid
erDiagram
    SERVERS ||--o{ BUILDINGS : contient
    BUILDINGS ||--o{ ROOMS : contient
    SERVERS ||--o{ ROOMS : héberge
    CHARACTERS |o--o{ ROOMS : "propriétaire"
    ROOMS ||--o| HOUSING_UNITS : "intérieur du logement"
    ACCOUNTS |o--o{ HOUSING_UNITS : "occupe (bail)"
    ROOMS ||--o{ ROOM_FURNITURES : meublée
    ITEM_INSTANCES ||--o| ROOM_FURNITURES : "posé comme meuble"
    ROOMS ||--o{ ROOM_FURNITURE_CONTAINERS : rangements
    ROOMS ||--o| ROOM_LAYOUTS : plan
    ROOMS ||--o{ ROOM_MEMBERSHIPS : accès
    ACCOUNTS ||--o{ ROOM_MEMBERSHIPS : membre
    ROOMS ||--o{ ROOM_BANS : exclut
    ROOMS ||--o{ ROOM_MUTES : "rend muet"
    ROOMS ||--o{ ROOM_AUDIT_LOGS : journalise
    ROOMS ||--o{ CHAT_LOGS : discussions
    HOUSING_UNITS ||--o{ LOCKPICK_ATTEMPTS : crochetée
    ACCOUNTS ||--o{ LOCKPICK_ATTEMPTS : cambrioleur
    ACCOUNTS ||--o| LOCKPICK_WEAR : "crochet entamé"
    ROOM_FURNITURES ||--o| FURNITURE_STORAGES : "rangement"
    ACCOUNTS ||--o| ACCOUNT_RESPAWN_BEDS : "lit de réveil"
    HOUSING_UNITS ||--o{ HOUSE_ALARM_EVENTS : "alarme"

    HOUSING_UNITS {
        bigint unit_id PK
        housing_offer_type offer_type "achat | location"
        int price_coins
        int rent_duration_hours
        int tax_coins
        housing_unit_status status
        bigint occupant_account_id FK
        timestamptz lease_expires_at
        timestamptz tax_due_at
        bool door_locked
        bigint room_id FK
        varchar model_key
    }
    ROOMS {
        bigint room_id PK
        room_type type
        bigint building_id FK
        bigint owner_character_id FK
    }
    ROOM_FURNITURES {
        bigint room_furniture_id PK
        bigint room_id FK
        bigint item_instance_id FK
        float pos_x
        float pos_y
        float pos_z
        jsonb state_json
    }
    ROOM_MEMBERSHIPS {
        bigint room_id PK, FK
        bigint account_id PK, FK
        room_role role
    }
    LOCKPICK_ATTEMPTS {
        bigint id PK
        bigint burglar_account_id FK
        bigint unit_id FK
        smallint misses
        text outcome "null | success | broke | abandoned"
        timestamptz started_at
        timestamptz ended_at
    }
    LOCKPICK_WEAR {
        bigint account_id PK, FK
        smallint uses_spent "1 à 5"
    }
    FURNITURE_STORAGES {
        bigint room_furniture_id PK, FK
        bigint container_id FK
    }
    ACCOUNT_RESPAWN_BEDS {
        bigint account_id PK, FK
        bigint room_furniture_id FK
        timestamptz set_at
    }
    HOUSE_ALARM_EVENTS {
        bigint id PK
        bigint unit_id FK
        bigint owner_account_id FK
        bigint attempt_id FK "unique"
        timestamptz triggered_at
        timestamptz seen_at
    }
```

- **Alarme** : `house_alarm_events` garde chaque déclenchement (au plus un par séance de crochetage) pour le bilan que le propriétaire lit à son retour. Voir `docs/LOCKPICK.md`.

- **Lit de réveil** : `account_respawn_beds` garde le lit posé que le joueur a choisi ; la ligne disparaît avec le lit. Voir `docs/RESPAWN_BED.md`.

- **Rangement** : un meuble de rangement posé (commode, coffre à jouets, frigo) a une ligne `furniture_storages` qui le relie à son conteneur ; les objets rangés sont les `inventory_stacks` de ce conteneur. Voir `docs/STORAGE.md`.

- **Crochetage** : une ligne `lockpick_attempts` par séance devant une porte (une seule ouverte par cambrioleur). Les réussites servent aux limites : maison protégée 24 h, cambrioleur en attente 30 min. `lockpick_wear` compte les usages du crochet entamé ; au 5e usage ou à la casse, un crochet est retiré de l'inventaire. Voir `docs/LOCKPICK.md`.

## 5. Échanges entre joueurs

```mermaid
erDiagram
    TRADE_SESSIONS ||--|{ TRADE_ESCROWS : "un séquestre par joueur"
    CHARACTERS ||--o{ TRADE_SESSIONS : "joueur A / B"
    TRADE_ESCROWS ||--|| CONTAINERS : "objets bloqués"
    MARKETPLACE_LISTINGS ||--|| ITEM_INSTANCES : "met en vente"
    MARKETPLACE_LISTINGS ||--|| CONTAINERS : séquestre
    CHARACTERS ||--o{ MARKETPLACE_LISTINGS : vend
    CHARACTERS ||--o{ GIFTS : offre
    ACCOUNTS ||--o{ GIFTS : reçoit
    ACCOUNTS ||--|| GIFT_INBOXES : "boîte de réception"
    GIFT_INBOXES ||--|| CONTAINERS : utilise

    TRADE_SESSIONS {
        bigint trade_id PK
        bigint character_a_id FK
        bigint character_b_id FK
        tx_status status
        timestamptz committed_at
    }
    TRADE_ESCROWS {
        bigint trade_id PK, FK
        bigint character_id PK, FK
        bigint container_id FK
        bigint coins_offered
    }
    MARKETPLACE_LISTINGS {
        bigint listing_id PK
        bigint seller_character_id FK
        bigint item_instance_id FK
        currency_code currency
        bigint price
        listing_status status
    }
```

## 5 bis. Compteurs d'actions et tâches

```mermaid
erDiagram
    ACCOUNTS ||--o{ ACCOUNT_COUNTERS : "une ligne par compteur"
    ACCOUNTS ||--o{ ACCOUNT_TASK_TIERS : "paliers atteints"
    ACCOUNTS ||--o{ ACCOUNT_COUNTER_KEYS : "éléments déjà comptés"

    ACCOUNT_COUNTERS {
        bigint account_id PK, FK
        text counter PK
        bigint value
        timestamptz updated_at
    }
    ACCOUNT_COUNTER_KEYS {
        bigint account_id PK, FK
        text counter PK
        text key PK
        timestamptz counted_at
    }
    ACCOUNT_TASK_TIERS {
        bigint account_id PK, FK
        text task PK
        smallint tier PK
        timestamptz reached_at
    }
```

`account_counters.counter` prend les valeurs de l'enum PHP `App\Enums\ActionCounter`, `account_task_tiers.task` les clés de `App\Support\TaskCatalog`. Contrat : `docs/TASKS.md`.

## 6. Modération & sécurité

```mermaid
erDiagram
    ACCOUNTS ||--o{ SANCTIONS : "cible"
    ACCOUNTS ||--o{ PLAYER_REPORTS : "signale / signalé"
    ACCOUNTS ||--o{ REPORTS : "signale / signalé"
    CHAT_LOGS |o--o{ REPORTS : preuve
    ACCOUNTS ||--o{ STAFF_AUDIT_LOGS : "action staff"
    ACCOUNTS |o--o{ IP_BANS : "banni / levé par"
    SECURITY_SCANS ||--o{ SECURITY_VULNERABILITIES : trouve

    SANCTIONS {
        bigint sanction_id PK
        bigint target_account_id FK
        bigint staff_account_id FK
        text kind
        timestamptz expires_at
    }
    IP_BANS {
        bigint id PK
        varchar ip
        int score
        timestamptz expires_at
        varchar cloudflare_rule_id
    }
    IP_REPUTATIONS {
        varchar ip PK
        int abuse_confidence
        bool is_tor
    }
    SECURITY_EVENTS {
        bigint id PK
        varchar ip
        varchar type
        text path
    }
    SECURITY_SCANS {
        bigint id PK
        varchar commit_sha
        timestamptz scanned_at
    }
    SECURITY_VULNERABILITIES {
        bigint id PK
        bigint scan_id FK
        text package
        varchar severity
        text fixed_version
    }
```

## Choix de conception

- **Compte et personnage séparés** : `accounts` porte l'identité, la connexion, le RGPD et l'argent ; `characters` porte la présence dans un monde (`servers`). Un compte peut avoir un personnage par serveur sans dupliquer ses achats.
- **Apparence du personnage sur le compte** : `accounts.character_sex`, `character_face`, `character_build` et `character_created_at` sont tous vides (le créateur s'ouvre) ou tous remplis (contrainte `ck_accounts_character_complete`). La couleur de peau et de cheveux reste dans `cosmetic_colors`, la coupe dans l'emplacement `hair` de `account_cosmetic_equipment`. Contrat : `docs/CHARACTER.md`.
- **Tutoriel « Premier jour en ville »** : une ligne `account_tutorials` par compte (étape, statut `active` / `skipped` / `done`, `completed_at` rempli si et seulement si `done`), créée à la première sauvegarde du personnage. Les comptes dont le personnage existait avant n'en ont pas et ne voient pas le tutoriel. Contrat : `docs/TUTORIAL.md`.
- **Badges** : `account_badges` (compte, code du badge, date), une ligne par compte et par badge, codes limités par une contrainte `CHECK`. Un badge est un statut affiché en icône près du pseudo, pas un objet : ni échange, ni vente, ni perte à la mort. Contrat : `docs/TUTORIAL.md`.
- **Authentification à part** : `account_auth_local` et `account_auth_oauth` isolent les secrets de `accounts`. Ajouter un fournisseur OAuth ne touche pas la table principale ; l'anonymisation RGPD efface ces lignes et garde l'historique économique.
- **Argent en grand livre** : pas de colonne solde. Chaque mouvement est une ligne de `wallet_ledger` rattachée à une `transactions` ; le solde est `SUM(delta)`. Un achat, un échange ou une taxe est donc toujours traçable et auditable, et on ne peut pas « créer » de pièces en modifiant un nombre.
- **Deux monnaies, un modèle** : `currency_code` (`coins` gagnés en jeu, `premium` achetés) partage la même mécanique ; les skins premium ne se vendent qu'en `premium`.
- **Liquide et banque** : les pièces gagnées en jeu vivent dans deux portefeuilles. `cash` est l'argent sur soi : les jobs (verger, acheteurs de zone, récompenses du pub) y versent, les boutiques, le pub, les soins de la clinique et les échanges entre joueurs y prennent. `coins` est la banque : maison, taxe, hôpital et gueule de bois y sont prélevés, bonus de bienvenue et parrainage y sont versés. Dépôt, retrait et virement (`BankService`, types `bank_deposit`, `bank_withdraw`, `bank_transfer`) déplacent l'argent entre les deux. À la mort, le liquide part dans une ligne `cash_drops` (propriétaire, tueur éventuel, montant, transactions de chute et de ramassage, expiration à 5 min) que n'importe qui sauf le tueur ramasse une seule fois ; voir `docs/BANK.md`. Les outils de métier portés y partent aussi : ils passent dans un conteneur `death_drop` relié par `cash_drops.container_id` (un sac sans liquide n'existe qu'avec ce conteneur), puis dans l'inventaire de celui qui ramasse le sac ; voir `docs/TOOLS.md`.
- **Niveau de recherche et casier** : `account_wanted_levels` garde les étoiles (0 à 5) et le temps connecté restant avant la prochaine baisse, écrits par le serveur temps réel, et la détention en cours : `jail_kind` (`npc` pour la prison PNJ à la mort, `officer` pour une mise en cellule par un policier, null hors prison), `jail_stars` (étoiles à la mort, 0 pour un policier), `jail_ms` (temps connecté restant, 10 min au plus pour `npc`, 15 min pour `officer`) et `jail_billed` (facture de mort de cette peine PNJ déjà payée, une seule fois par peine), tenus ensemble par `ck_account_wanted_levels_jail` ; l'amende pour sortir (prison PNJ seulement) est une transaction `jail_fine` dont l'argent est détruit ; la taxe de prison payée à la mort qui mène en prison PNJ (en plus de la facture d'hôpital) est une transaction `jail_tax` dont l'argent est détruit ; `crime_records` garde une ligne par délit (type contrôlé par `ck_crime_records_kind`, étoiles, victime éventuelle `victim_account_id`). La prime d'arrestation est une récompense `reward` (source `police_bounty`, suspect, étoiles payées, référence d'arrestation) versée en liquide au policier, plafonnée à 150 pièces par 24 h glissantes. `police_licences` garde une ligne par licence de policier en cours (compte, transaction `police_licence` dont l'argent est détruit, date d'achat) ; la ligne est supprimée à chaque mort. `pickpocket_attempts` garde une ligne par tentative de vol à la tire (voleur, victime, issue `pending`, `failed` ou `succeeded` contrôlée par `ck_pickpocket_attempts_outcome`, date) et la pile prise (`item_def_id`, `quantity`, `taken_at`, remplies ensemble et seulement sur une réussite, `ck_pickpocket_attempts_loot`) ; elle porte les deux limites du voleur : 10 min entre deux tentatives et une victime volée une fois par 24 h. Voir `docs/POLICE.md`.
- **Quiz du pub** : `pub_quiz_wins` garde une ligne par quiz (`quiz_id` unique, donc un seul paiement même si le socket rappelle) : vainqueur, nombre de joueurs valides, coins versés en cash (`pub_reward_quiz`), et la pinte offerte (`pint_expires_at` 24 h, `pint_redeemed_at` quand le bar la sert gratuitement) ; voir `docs/PUB.md`.
- **Marché de la ville** : `market_stalls` (un stand par date de marché, numéro et joueur uniques, transaction des frais), `market_lots` (un lot d'items sous séquestre sur un emplacement du stand, présenté en cagette, en panier ou à plat, statut `active`, `sold_out`, `withdrawn` ou `returned`, un seul lot actif par emplacement) et `market_sales` (une vente, `purchase_ref` unique pour qu'un achat rejoué ne passe qu'une fois, type de transaction `market_sale`). Les frais de stand ont le type `market_stall_fee` ; voir `docs/MARKET.md`.
- **Définition vs exemplaire** : `item_defs` décrit un type d'objet ; un objet unique (meuble, outil, vêtement échangeable) est une `item_instances`, un consommable est une ligne de `inventory_stacks` avec une quantité. On évite des milliers de lignes pour 99 pommes, tout en gardant un historique par meuble.
- **Conteneurs génériques** : sac, coffre de meuble, séquestre d'échange, boîte de cadeaux sont tous des `containers`. Déplacer un objet revient à changer `container_id`, avec la même logique partout.
- **Échanges sûrs** : un objet engagé est bloqué (`locked_tx_id`) et les biens passent par un séquestre (`trade_escrows`, `escrow_container_id`) ; l'échange se valide en une seule transaction SQL ou pas du tout.
- **Logement = pièce + offre** : `rooms` est l'espace jouable (meubles, accès, modération) ; `housing_units` ajoute l'offre commerciale (prix, bail de 7 jours, taxe, porte verrouillée). Un même type de pièce sert aux appartements, au centre commercial ou au pub.
- **Garde-meuble** : quand une maison est saisie pour taxe impayée, ses meubles posés et son coffre partent dans une ligne `storage_lots` (`source` `seized`, ancien propriétaire, maison, valeur en boutique, mise de départ, nuits en vente, statut `listed` / `sold` / `destroyed`), dont le contenu vit dans un conteneur `storage_lot`. Le jeu y ajoute des box `generated` (`generated_for`, `generated_slot`). Les offres sont des lignes `storage_bids` (montant, transaction de blocage, transaction de remboursement quand elle est dépassée) ; le box vendu garde son gagnant, son prix et la date d'ouverture (`docs/STORAGE_AUCTION.md`). Une maison vide ne crée pas de box. Le reset admin et la suppression de compte détruisent toujours le contenu.
- **Dons d'admin en jeu** : un don d'argent est une transaction `admin_grant` (référence dans `meta_json.ref`) avec une ligne `admin_grant` du grand livre sur le liquide ou la banque ; un don d'objets est une ligne `admin_item_grants` (`ref` unique, admin, bénéficiaire, objet, quantité) écrite dans la même transaction que les objets, pour qu'un appel rejoué ne donne qu'une fois. Les objets achetés en gemmes ne se donnent pas ; voir `docs/ADMIN.md`.
- **Paiement idempotent** : `gem_orders.idempotency_key` et `stripe_webhook_events.event_id` uniques garantissent qu'un webhook reçu deux fois ne crédite jamais deux fois.
- **Types énumérés PostgreSQL** (`account_status`, `item_kind`, `tx_type`...) : la base refuse une valeur inconnue, sans dépendre du code.
- **Exceptions assumées** : `wallets` utilise `owner_type` + `owner_id` (polymorphe, sans clé étrangère) pour qu'une guilde ou un serveur puisse un jour avoir un portefeuille ; `wallet_ledger.tx_id` est contrôlé par le service, pas par une clé étrangère.
