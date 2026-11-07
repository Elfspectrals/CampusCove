---
paths:
  - "backend/**"
---

# Backend rules (Laravel + PostgreSQL)

- Use the `backend-game-data` skill for any new item, shop entry, reward, housing rule or game endpoint.
- Business logic lives in `app/Services/*Service.php`; controllers validate input and call one service. Constants that the socket or front must match are documented in the matching `docs/*.md` contract.
- Routes only the socket may call go in the `realtime` middleware group of `routes/api.php`. Never expose a reward or state change to the browser directly.
- Money and inventory changes run inside one DB transaction and write the ledger; never update a balance by hand.
- Schema changes are new migrations, never edits to an old one. Update `docs/DATA_MODEL.md` when a table or relation changes.
- Every new endpoint or rule gets a feature test in `tests/Feature/`.
