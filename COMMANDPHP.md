# Command PHP

Commands below assume **Docker** (`docker compose` from the repo root). For a local PHP install without Docker, run the same `php artisan …` from `backend/` with your environment.

---

## Prerequisites (avatar / inventory)

Wearable item definitions (`COS_WEAR_*`) come from **`ShopSeeder`**. If `fillOutfit` says definitions are missing, run once:

```bash
docker compose exec -T backend php artisan db:seed --class=ShopSeeder
```

Ensure migrations are applied (includes `item_defs.cosmetic_slot` and `account_cosmetic_equipment`):

```bash
docker compose exec -T backend php artisan migrate
```

---

## `setAdmin`

```bash
docker compose exec -T backend php artisan setAdmin <email>
```

Gives the `admin` role to the account linked to `<email>`.

- Creates the `admin` role automatically if it does not exist.
- Safe to run multiple times.

Example:

```bash
docker compose exec -T backend php artisan setAdmin jerome.neupert@gmail.com
```

---

## `setMoney`

```bash
docker compose exec -T backend php artisan setMoney <account> <currency> <sum>
```

Sets wallet balance to an absolute value.

- `<account>`: account ID or email
- `<currency>`: `coins` or `premium`
- `<sum>`: new final balance (non-negative integer)

Example:

```bash
docker compose exec -T backend php artisan setMoney 1 coins 25000
docker compose exec -T backend php artisan setMoney jerome.neupert@gmail.com premium 150
```

---

## `fillOutfit`

```bash
docker compose exec -T backend php artisan fillOutfit <account>
```

**Dev helper:** grants the starter wearable stacks (body, hair, top, bottom, shoes, head accessory) into the account gift inbox **and** equips the default Campus outfit so Inventory preview and in-game multiplayer use your avatar right away.

- `<account>`: numeric `account_id` **or** login **email**
- Idempotent for **grants** (missing stacks are added; existing quantities are not wiped).
- **Equip** overwrites cosmetic slots with the default `COS_WEAR_*` set (same as a fresh “full default” look).

Example:

```bash
docker compose exec -T backend php artisan fillOutfit 1
docker compose exec -T backend php artisan fillOutfit you@example.com
```

After this, open **Inventory** in the app: you should see the wearables, the **Outfit preview** should show your character, and **Game** will use the same loadout on next connect.

If the command errors about missing item definitions, run the **ShopSeeder** command in [Prerequisites](#prerequisites-avatar--inventory) first.
