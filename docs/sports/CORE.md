# Sports complex: shared core contract

What the core (branch `feat/sports-complex-core`) gives every building session, and how a session plugs its venue in.
Site and footprints: [MASTER_PLAN.md](MASTER_PLAN.md). How each sport plays: [README.md](README.md) and one file per
sport. Prices from the `economist` (2026-11-14).

A building session never edits the core's files listed in § 9; it adds its own files and the entries named below.

## 1. Pass

| Pass | Price (cash) | Lasts |
|---|---|---|
| Day | 40 | 24 h of real time |
| Week | 200 | 7 days of real time |

- Bought at the reception pavilion (`sports_reception`) from the pass clerk, in **cash**, destroyed (no NPC receives it).
- Bound to the account: not an item, never traded, stolen, dropped at death or refunded. No 72 h age rule.
- Buying while a pass is valid extends it from its current end. A purchase that would end more than 14 days from now
  is refused (`sports_pass_cap`).
- Laravel owns the end time (`valid_until`, server clock). The socket caches it per player and checks it on every move.

### Laravel (realtime routes, in the `auth:sanctum` + `account.active` + `realtime` group, like `/police/licence`)

| Route | Body | Reply |
|---|---|---|
| `GET /api/sports/pass` | | `{ pass: { validUntil: RFC 3339 string \| null, prices: { day: 40, week: 200 } } }` |
| `POST /api/sports/pass` | `{ kind: 'day' \| 'week', ref: string (1-64) }` | `{ pass: { validUntil, prices }, cash: int }` |

Errors (`422` / `409`, `{ code, message }`): `sports_pass_invalid_kind`, `sports_pass_insufficient_cash`,
`sports_pass_cap`. The same `ref` twice returns the first result and charges once.

### Socket

| Message | Direction | Payload |
|---|---|---|
| `sports_pass_buy` | client → server | `{ kind: 'day' \| 'week' }`, only within 3 m of the pass desk (the NPC prop with `"sportsPassDesk": true` in `zones/sports_reception.json`) |
| `sports_pass_bought` | server → client | `{ validUntil: number \| null (ms), cash: int }`, the purchase result |
| `sports_pass_state` | server → client | `{ validUntil: number \| null (ms), prices: { day, week } }`, sent at join and after a purchase |
| `sports_pass_error` | server → client | `{ code, message }` |

### Where the pass is checked

- A manifest zone with `"sportsPass": true` is a **pass area**. The core sets it on `sports_complex` (the fenced site).
  Each venue zone sets it too (buildings and outdoor courts).
- `moveRejection` (`socket/src/movement.ts`) refuses a move that **enters** a pass area from outside it when the pass is
  not valid at that moment: reason `no_pass`, the client gets a `position_correction { x, y, z, reason }` and shows "You need a sports pass
  (reception)". Leaving is always allowed, so a pass that expires on site lets the player stay until they leave.
- Teleports (admin, respawn) are not moves and are not checked.
- The front draws the gate and the venue doors open; the fence collision has gaps at the gates. The server check is
  the only lock.

## 2. Lent items

Lent items are socket state only (`player.sportsLoans`), never an inventory row: they cannot be traded, sold, stolen or
dropped, and they print nothing.

- Climbing shoes: lent to every player who enters the site with a valid pass, taken back when they leave it.
- Balls and other venue items: a venue lends them through `lend(player, key)` and takes them back with
  `takeBack(player, key)`. Every loan is taken back when the player leaves the pass area of the venue that lent it,
  disconnects or dies.

`socket/src/sports/loans.ts` exports `lend(room, player, key, area)`, `takeBack(room, player, key)`, `takeBackAll`, `hasLoan`. Lent items are broadcast to everyone as
`sports_loans { sessionId, loans: string[] }` so venues can draw them in hands.

## 3. Gear (owned items)

- Item kind `sports_gear` in `item_defs`, with `meta_json.sport` (sport id) and `meta_json.slot`
  (`bottom` \| `shoes` \| `hands` \| `held`), enforced by a database check (stack of 1, no wear, not a weapon). `gear_swimsuit` says `swimming`; the diving venue accepts it too. Seeded by the core with no model; a building session adds the model and
  puts the item on sale.
- Never wears out (no `uses`). Tradable, sellable at the town market, never bought back by an NPC (`ZonePriceBook`
  lists no gear).
- Not pickpocketable (same rule as tools).
- **Death**: every `sports_gear` item the player carries goes into the death bag with the cash, with the cash bag rules
  (5 minutes, 72 h giver age, the killer cannot pick it up). The drop and the pickup reply list it as `gear: string[]` beside `tools`. An account under 72 h drops no bag and keeps its gear
  (unlike cash, gear is never destroyed).
- Gear is not worn through the wardrobe: a venue shows it on the avatar while its sport is played (the swimsuit in the
  pool water, skates on the ice...). So the clothes-loss rule at death never touches gear.

| Code | Sport | Slot | Price (cash) |
|---|---|---|---|
| `gear_swimsuit` | swimming, diving | bottom | 90 |
| `gear_boxing_gloves` | boxing | hands | 150 |
| `gear_boules` | pétanque | held | 150 |
| `gear_tennis_racket` | tennis | held | 180 |
| `gear_running_spikes` | running | shoes | 260 |
| `gear_ice_skates` | skating | shoes | 260 |

- Sold at **Summit Sports** (mall, zone `summit_sports`), the existing sportswear shop. A building session lists its gear
  there with a `forSale` item prop in `zones/summit_sports.json` and the catalogue row in `ShopSeeder` (the store
  catalogue accepts `sports_gear`).
- Ownership check: `GET /api/sports/gear` → `{ gear: string[] }` (codes the account owns, inventory only).
  Socket helper `ownedGear(player)` in `socket/src/sports/gear.ts` (async, call it at a sign-up or a venue door, not
  per move).

### Gear lent for a fee (decided 2026-11-15)

A player who does not own the gear of a sport can borrow it at the venue, for a fee paid in cash and destroyed. The
loan is socket state like every lent item (§ 2): never an inventory row, never traded, sold, stolen or dropped, taken
back when the player leaves that venue's pass area, disconnects or dies. Coming back means paying again.

| Code | Buy | Borrow, per stay in the venue |
|---|---|---|
| `gear_swimsuit` | 90 | 15 |
| `gear_boxing_gloves` | 150 | 25 |
| `gear_boules` | 150 | 25 |
| `gear_tennis_racket` | 180 | 30 |
| `gear_running_spikes` | 260 | 40 |
| `gear_ice_skates` | 260 | 40 |

Fees from the `economist` (2026-11-15): about a sixth of the shop price, so a daily player repays the gear in a week and
a once-a-week visitor borrows; never above the day pass. Any account age may borrow (the cash is destroyed, nothing is
created).

- Laravel owns the fees (`SportsGearRentalService::PRICES`). `POST /api/sports/gear/rent { code, ref (1-64) }` (realtime
  route) replies `{ code, price, cash }`; the whole fee or nothing; the same `ref` twice charges once. Errors:
  `sports_rent_invalid_gear` (422), `sports_rent_insufficient_cash` (422), `sports_rent_owned` (409). Ledger reason and
  transaction type `sports_gear_rental`, table `sports_gear_rentals`. `GET /api/sports/gear` now also replies
  `rental: { code: fee }`.
- The gear a venue lends is the `gear` of the venues registered in its zone (`gearLentAt`), so nothing else lists it.
- Every gear check goes through `usableGear(player)` (`socket/src/sports/gear.ts`): the codes owned plus the codes on
  loan. A venue that caches the answer registers `onGearChanged` to forget it when a loan starts.

| Message | Direction | Payload |
|---|---|---|
| `sports_gear_quote` | client → server | `{}`, sent by the front when the coach panel opens (decided 2026-11-15: lending is a block of that panel with a Borrow button, no longer a banner after a refusal); at most one a second per player |
| `sports_gear_offer` | server → client | `{ gear, price }`, only to a player standing in a venue that lends gear they neither own nor have on loan |
| `sports_gear_rent` | client → server | `{}`: the gear is the one of the venue the player stands in, never a code from the client |
| `sports_gear_rented` | server → client | `{ gear, cash }`, after Laravel accepted and the loan started |
| `sports_error` | server → client | `sports_rent_too_far` (not in a venue that lends gear), `sports_rent_already`, `sports_busy`, or the Laravel code |

The front shows the offer for 10 s; the accept key (Y) borrows, the decline key (N) closes it. Not the interact key: it
also opens doors, and a payment must never be an accident.

## 4. Coach sign-up and matches

`socket/src/sports/signup.ts` is pure logic (tested); `socket/src/sports/venues.ts` runs it in the room.

### A venue registers itself

```ts
registerVenue({
  id: 'gym_football',         // unique, one per sign-up target (tennis_1, tennis_2, petanque_1..4...)
  sport: 'football',          // sport id of docs/sports/<sport>.md
  zone: 'sports_gym',         // its pass area (manifest zone with "sportsPass": true), checked at boot
  coach: { x, z },            // a coach with the venue's id is created there (talk within 3 m)
  playArea: Bounds,           // reserved during a match
  playAreaId: 'gym_court',    // optional: venues sharing it refuse sign-ups while the other runs (sports_venue_busy)
  confined: true,             // optional: a match player inside the play area cannot move out of it (match_bounds)
  gear: 'gear_swimsuit',      // optional: sign-up refused with sports_no_gear without it (ownedGear)
  teams: true,                // red / blue, or false for solo races
  settings: SettingsSpec,     // parseSignupRules(await readSportRules(sport)) from the rules JSON (§ 5)
  players: (settings) => ({ min, max }),
  rejoinGraceMs: 30_000,      // 0 for solo timed races (did not finish at once)
  onKickoff(room, match), onTick(room, match, elapsedMs), onLeave(room, match, accountId),
  onEnd(room, match, end),    // end: { reason: 'finished' } | { reason: 'forfeit', loser: 'red' | 'blue' | null }
})
```

- A coach serving several venues (gym coach: football and basketball; tennis coach: two courts):
  `registerCoach({ id, x, z, venues: [...] })`. Its NPC prop in the zone JSON carries `"coach": "<id>"`.
- A venue ends its match with `endMatch(room, venueId, { reason: 'finished' })` and records it with
  `recordMatch(room, match, results, endedAt?)` (needs one connected player for the auth token; otherwise logged only).
- Each sport file `socket/src/sports/<sport>.ts` registers its venues and is imported by one line in
  `socket/src/sports/index.ts`.
- Loans: `lend(room, player, key, area)`, `takeBack(room, player, key)`, `takeBackAll`, `hasLoan` (§ 2).

### Rules (from the README)

1. The first player to sign up chooses the settings; they are checked against `settings` (values in the listed
   options only).
2. Each player picks `red` or `blue` (team venues).
3. Full → kick-off at once. Minimum reached → 60 s countdown (it does not restart when more join). Under the minimum,
   the lobby is cancelled after 5 minutes with nobody new.
4. At kick-off, while one team has 2 or more players than the other, the last player who signed up in the bigger team
   moves to the other one.
5. During the match the venue is reserved: a move of a non-player into `playArea` is refused (`venue_reserved`),
   non-players inside it at kick-off are moved to its nearest edge.
6. A player who leaves the venue's pass area or disconnects keeps their place for `rejoinGraceMs`; back in time, they
   play on. Past it they are out and `onLeave` runs. A team at 0 players loses (`onEnd` with `forfeit`).
7. One lobby or match per venue at a time; a player is in at most one lobby or match.
8. Dropping under the minimum stops the countdown; the 5-minute cancel counts from the last sign-up while under the
   minimum; the lobby is cancelled when its last player leaves. Settings must hold exactly the spec's keys, each value
   one of its options.
9. A player rejoins by account: their first move back into the venue zone within the grace restores their place. A
   signed-up player outside the venue zone at kick-off starts as away.
10. An expired pass lets the player stay and leave, but refuses entering any other pass area, venues included.

### Socket messages

| Message | Direction | Payload |
|---|---|---|
| `sports_coach_open` | client → server | `{ coach }` within 3 m: replies with one `sports_lobby` per venue of that coach (`phase: 'open'`, `players: []` when idle) |
| `sports_signup` | client → server | `{ coach, venue, team?: 'red' \| 'blue', settings?: Record<string, string \| number> }` (settings only for the first player) |
| `sports_signup_leave` | client → server | `{}` |
| `sports_match_leave` | client → server | `{}`: the sender is out of the match they play in, as if their rejoin time had run out |
| `sports_lobby` | server → players in the site | `{ venue, coach, sport, phase: 'open' \| 'countdown' \| 'playing', settings, players: [{ sessionId, name, team }], min, max, kickoffAt: number \| null, serverNow: number }` |
| `sports_lobby_closed` | server → same | `{ venue, reason: 'kickoff' \| 'cancelled' \| 'ended' }`; after a cancel or an end an idle `sports_lobby` for the venue follows |
| `sports_error` | server → client | `{ code, message }` (`sports_lobby_full`, `sports_bad_settings`, `sports_already_signed`, `sports_venue_busy`, `sports_no_pass`, `sports_no_gear`, `sports_too_far`) |

### Results

`POST /api/sports/matches` with `{ ref, sport, venue, settings, startedAt, endedAt` (epoch ms)`, players: [{ accountId,
team: 'red' \| 'blue' \| null, result: 'win' \| 'loss' \| 'draw' \| 'finished' \| 'dnf', place?: int, timeMs?: int,
score?: int }] }`. One row per match (`sports_matches`, unique `ref`) and one per player (`sports_match_players`). The
same `ref` twice is ignored. Reply `{ match: { id, recorded, countsForTasks } }` (`recorded: false` on a replay, which
returns the stored `countsForTasks`). The socket sends it from `onEnd` through `recordMatch(match, players)`. No coins,
ever.

**Anti-farm (`countsForTasks`, `SportsMatchService`).** A match counts for the "games played" tasks only when at least 2
of its accounts are 72 h old or more (`TradeService::MIN_GIVER_AGE_HOURS`), and at least one pair of those accounts has
played fewer than `TASK_MATCHES_PER_PAIR_PER_DAY` = 3 counted matches of that sport together on the same Paris day
(day of `endedAt`). A solo run never counts for tasks. The flag is stored on `sports_matches.counts_for_tasks`; task
counters read only counted matches. Examples: A and B play their 4th football match of the day: not counted; A, B and
C play next: counted (A–C is a new pair); the next day at 00:00 Paris A and B count again; basketball has its own cap.

**Task counters (`SportsTaskCounters`).** When a recorded match counts for tasks, `SportsMatchService::record` calls
`SportsTaskCounters::countMatch`: `rules()` holds one entry per sport, the `ActionCounter` of "games played" (bumped for
every player whose result is not `dnf`) and an optional feat (`counter` and a `reached(settings, player)` predicate).
A venue adds its line there, its `ActionCounter` cases and its `TaskCatalog` tasks. Swimming: `swim_races` and the feat
`swim_fast_50` (50 m finished under 30 s).

### Weekly boards

`SportsBoardService::BOARDS` lists each board: `{ sport, settings, metric }`. `settings` must be contained in the
match settings, `metric` is `time` (best `timeMs` of a `finished` result, lowest first) or `score` (highest first).
Each account keeps its best value of the week; ties go to whoever reached it first. Weeks run Monday 00:00 to Monday
00:00 Paris time, named `YYYY-Www` (ISO week). Solo runs count. Boards declared by the core: `swim_25`, `swim_50`,
`swim_100` (`distanceM`), `run_100`, `run_400`, `run_1500` (`distanceM`), `skate_1`, `skate_3`, `skate_5` (`laps`). A
venue adds its own boards (climbing routes, dance songs) to the list.

- `GET /api/sports/boards/{board}` (player, not realtime): `{ board: { board, week, entries: [{ rank, accountId, name,
  value }] (top 10 of the current week), champion: { week, accountId, name, value } | null (last week) } }`; 404 for an
  unknown board.
- `sports:close-boards`, hourly: crowns the first of each board for the week that just ended
  (`sports_board_champions`, one row per board and week, so running it again changes nothing). A board with no
  result that week has no champion. Zero coins.
- Badge: an account with at least one crown gets `sports_champion` in `BadgeService::badges()`, shown in the Tab list,
  never over the head.

## 5. Sport rules JSON (placeholders)

One file per sport in `front/public/assets/sports/rules/<sport>.json`, read by the front (fetch) and the socket
(`besideManifest`). Fields are the proposed lists at the end of each `docs/sports/<sport>.md`, plus:

- `"status": "placeholder"`, which the building session changes to `"ready"`;
- `"zone"`: the venue zone id from the master plan;
- `"signup"`: `{ "settings": [{ "key", "label", "options": [...] }], "teams": bool }` for the coach panel.

Values the doc leaves open are `null`. A building session fills its own file and never touches the others.

## 6. Front

- `useSportsPass` (pass state, prompt at the clerk, "You need a sports pass" toast on a `no_pass` correction) and
  `GameSportsPassDesk.vue` (two buttons, prices, current end).
- Watch app **Sport** (`WatchSportsApp.vue`, `front/src/game/watch/sports.ts`, tested): the pass and its end, then
  each match the player is signed up for (players, kick-off countdown, playing).
- `useSportsSignup` and `GameSportsSignup.vue`: the coach panel built from the sport JSON `signup` block: settings for the
  first player, red / blue choice, player list, countdown, leave. A venue only needs a coach NPC prop with
  `"coach": "<coach id>"` in its zone JSON.

## 7. Zones and data a venue adds

1. Its manifest zone (key from the master plan, bounds = its footprint, `"sportsPass": true`), upserted by its own
   `front/scripts/apply-sports-<id>.mjs`.
2. Its zone JSON `front/public/assets/zones/sports_<id>.json` (+ `backend/resources/zones/`), with the coach NPC prop
   (`"coach"` id) and its extras, and its line in `zones/index.json`.
3. Its sport rules JSON (§ 5), status `ready`.
4. `socket/src/sports/<sport>.ts` calling `registerVenue` / `registerCoach`, imported once from
   `socket/src/sports/index.ts` (one import line per sport).
5. Its gear model, item row and Summit Sports prop (§ 3).

## 8. Explorer task

Only `sports_complex` counts as an explorer zone (past the gate, so with a pass). The venue, reception, entrance and
road zones are not explorer zones: the socket skips every zone whose key starts with `sports_` except `sports_complex`
(`socket/src/sports/explorer.ts`), so a venue zone needs nothing to stay out.

## 9. Core-owned files

`docs/sports/CORE.md`, `docs/sports/MASTER_PLAN.md`, `map-src/CampusCove/lib_sports.py`, `build_sports_site.py`,
`build_sports_reception*.py`, `front/scripts/apply-sports-site.mjs`, `socket/src/sports/{signup,venues,loans,gear,pass,sportsConstants,index,testWorld}.ts` (a sport adds its one import line to `index.ts`),
`backend/app/Services/Sports*Service.php`, the front pass and sign-up files. A building session that needs a change
there asks for it in its report instead of editing them.
