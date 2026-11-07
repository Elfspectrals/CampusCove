---
paths:
  - "backend/app/Services/**"
  - "backend/app/Support/FoodCatalog.php"
  - "backend/database/seeders/**"
  - "socket/src/pub*.ts"
  - "socket/src/darts.ts"
  - "socket/src/orchard.ts"
  - "front/src/game/orchard.ts"
  - "front/src/game/pub/**"
---

# Economy rules

Two agents, two roles:

- `game-designer` designs how the economy works: which jobs and games exist, how they reward, what players spend on and why. Run it before adding or reworking a job, mini-game, reward or sink.
- `economist` moderates how strong the economy is: it measures money in and out, inflation, time to goals and exploits, and says whether a proposed number is too generous or too stingy. It does not invent features. Run it before shipping a change to a price, reward, fee or cap.

## Invariants

- Every coin movement is a `wallet_ledger` row tied to a `transactions` row, written by a backend service. Rewards go through `CoinRewardService`. No balance column.
- The server decides every reward amount. The client sends intents (aim, power, release); the socket measures time with its own clock and decides outcomes; Laravel pays. A reward that depends on a client-reported count, time or score is a bug.
- Every source has a limit: cooldown, action duration, stack size or daily cap. A new source states its coins per minute at best and realistic play.
- No buy-then-sell loop: an item the farmer buys back is never sold cheaper in a shop.

## Decided balance

- **Orchard is the main job**: 3 coins per apple, 300 apples per rolling 24 h at full price, then 1 coin. Fun features (golden apple, sweet spot, daily order, ranks) must not raise daily income; offset them, for example by dropping the after-quota price to 0.
- **The pub is a place to spend, not to earn.** You go there to drink and play. Solo games may cost a little, skill earns a little back, and the UI says so up front (fee and best payout shown before you play). A duel winner earns at most about +20 coins/min.
- **Welcome bonus and referrals** must not be farmable with alt accounts (see `roadmap.md`).
- Premium skins are never sold for coins. Housing leases last 7 days and expired furniture is deleted on purpose.
