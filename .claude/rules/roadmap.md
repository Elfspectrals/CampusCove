# Roadmap

Status: `todo`, `doing`, `done`. Update the status in the same change as the work. Add new approved work here with the decision behind it.

## 1. Close the money printers (done)

Playtested on 2026-11-07 against the dev stack: a solo Drink Fast race finished in 8017 ms on both client and server, paid 15 coins, and a second race inside the cooldown was refused with `pub_cooldown` before any fee.

- [done] Welcome bonus can no longer be funnelled: an account younger than 72 h can receive in a trade but not give coins or items (`TradeService::MIN_GIVER_AGE_HOURS`). Paying on email verification was dropped: there is no verification flow and no mail sending.
- [done] `pub/play` refused with `pub_cooldown` while that game's reward cooldown is running (`PubService`).
- [done] Drink Fast: the client sends only its press/release steps; the socket replays the balance simulation (`socket/src/drinkFastSim.ts`, fixed 1/60 s step, golden test shared with `front/src/game/pub/drinkFast.test.ts`) and owns progress, spills and finish time.
- [done] Meter Shot time comes from the socket clock less a 250 ms network allowance; the client's figure is ignored.

## 2. Pub: a place to spend, skill earns a little back (todo)

Decision (2026-11-06): you go to the pub to drink, not to make money. The UI shows the fee and the best payout before each game.

- [todo] Darts winner 20 coins, +10 for 80 points or more.
- [todo] Meter Shot fee 25; a run under 5 s pays 60 (only once the timing is server-owned).
- [todo] Weekly leaderboard (best darts total, fastest pint), persisted, shown as an HTML overlay in the style of `GameDarts.vue` / `GamePubRaceBoard.vue` (not a 3D model), small weekly prize.
- [todo] Fee and best payout shown on each pub game prompt.

## 3. Orchard: more fun, same income (todo)

Decision (2026-11-06): the orchard stays the main job at about 900 coins/day; new features must not raise daily income (offset with the after-quota price, set to 0 if needed). Run the `economist` before shipping each one.

- [todo] Feedback: rustle and pop on pick, apple flies into a "14/20" basket counter, coin clink and floating "+60" on sale, farmer voice line.
- [todo] Apples use the grocery apple model sold in the mall (`public/assets/items/grocery/apple/model.glb`) instead of the farm copy.
- [todo] Golden apple: 1 pick in 50, rolled server-side, sparkle and chime.
- [todo] Tree of the day: one tree per day glows and picks faster.
- [todo] Sweet-spot pick: release in a short window for 2 apples, judged by the socket clock.
- [todo] Farmer's daily order ("bring 40 apples today") with a streak counter.
- [todo] Picker rank: bigger baskets, then a straw-hat wear piece (built like player clothes).
- [todo] Co-op tree shake: two players shake one tree, both get apples.
- [todo] Trees run out: each tree holds 8-12 apples (server state) and regrows over a few minutes; the tree shows how many are left.
- [todo] Varieties and collection book: Gala, Granny Smith, Pink Lady and Golden grow on different trees. They are colour variants of the one grocery apple model, not new models. Collecting one of each fills a sticker book and unlocks a cosmetic badge. No coins.
- [todo] Apple pie at the café: 5 apples at the café oven make a pie that fills more hunger than 5 raw apples. A use for apples that adds no coins.
- [todo] House cider at the pub: apples sold to the farmer fill a weekly town counter; past the goal, "house cider" appears on the pub menu for everyone that week.

Decision (2026-11-06): picking stays simple because it is the first job. Hold to pick is the base loop and always works; skill (sweet spot, co-op shake) is an optional bonus on top, never a gate. No separate catch mini-game.

## Later

- Fishing as the second job (reuse the darts power meter or the Drink Fast balance bar; rod and fish models exist).
- Real mobile version: touch input, mobile HUD, quality tier.
- Versioned contracts: an OpenAPI spec for the Laravel API and a JSON Schema for socket messages, generated or validated in CI, replacing the hand-written `docs/*.md` contracts.

## Tooling (done)

- [done] Two fixed local playtest accounts (`make playtest-accounts`, `PlaytestAccountSeeder`) instead of a new account per playtest; running it again resets coins, health and admin rights.
