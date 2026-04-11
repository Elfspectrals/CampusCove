# Command PHP

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
