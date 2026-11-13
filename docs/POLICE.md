# Police: wanted level

The socket owns the wanted level (`socket/src/wanted.ts`); Laravel stores it and keeps the criminal record. Design: `design-plans/police.md`.

## Rules

- 0 to 5 stars per player (`Player.wantedStars`), with the connected time left before the next star is lost (`Player.wantedDecayMs`).
- Every crime adds its stars (capped at 5) and resets the counter to 4 minutes. The room tick (every second) takes the elapsed time off the players in the room; at 0, one star is lost and the counter restarts at 4 minutes. Time only runs while connected.
- Accounts younger than 72 h are not excluded.
- No client message feeds this feature: crimes come from server events only.

## `reportCrime`

```ts
import { reportCrime } from './wanted.ts'
reportCrime(room: GameRoom, player: Player, kind: CrimeKind, victimAccountId: number | null = null): void
```

Call it on the server only, never from a client message. `victimAccountId` is the account hurt by the crime: the person punched (`assault`), the person killed (`murder`), the murder victim whose bag was taken (`bag_theft`); leave it out when there is no victim (`lockpick`, `alarm`). The bounty uses it.

| `kind` | Stars | Raised by |
|---|---|---|
| `assault` | 1 | `onPunch`, a landed punch that does not kill. Not when the victim punched the attacker in the last 60 s (self-defence), and at most once a minute per attacker and victim |
| `murder` | 3 | `hurt(..., attacker)` bringing the victim to 0 health; the killing punch gives no assault on top |
| `bag_theft` | 2 | picking up the cash bag of a murder, when the picker is not the victim (`CashBag.murderVictimAccountId`, set in `knockOut`; the killer is already refused by Laravel) |
| `pickpocket_seen` | 2 | a pickpocket that succeeds with at least one witness (`socket/src/pickpocket.ts`) |
| `pickpocket_failed` | 1 | a pickpocket that fails: missed stop, out of the cone, time out, or the thief leaving mid-game |
| `lockpick` | 1 | lockpicking, once at the start of a session |
| `alarm` | 2 | an alarm going off |

## Socket message `wanted` (socket → client)

| Field | Type | Rule |
|---|---|---|
| `sessionId` | string | the wanted player |
| `stars` | integer | 0 to 5, as this client may see it |

- The player always gets their own level, at the join and on every change.
- Others get it from 3 stars, and get `stars: 0` when it drops below 3 so the icon goes away. One function decides what a viewer sees (`starsSeenBy`); officers on duty see it from 1 star (`ON_DUTY_WANTED_STARS`).
- At the join the newcomer gets every other player at 3 stars or more.

The front shows other players' stars next to their name tag and the player's own stars beside the vitals.

## Laravel routes (realtime only)

| Route | Body | Answer |
|---|---|---|
| `GET /api/wanted` | none | `{ wanted: { stars, decay_ms } }`, `{ stars: 0, decay_ms: 240000 }` when nothing is saved |
| `PUT /api/wanted` | `stars` integer 0 to 5, `decay_ms` integer 1 to 240000 | `{ wanted: { stars, decay_ms } }` |
| `POST /api/crimes` | `kind` one of the kinds above, `stars` integer 1 to 5, `victim_account_id` existing account or `null` (optional) | 201 `{ recorded: true }` |

The socket loads the level right after the join, saves it on every star change and when the player leaves (or is replaced by a new tab), and posts one crime record per `reportCrime`.

## Stored fields

| Table | Fields |
|---|---|
| `account_wanted_levels` | `account_id` (primary key), `stars` 0 to 5, `decay_ms` 1 to 240000, `updated_at` |
| `crime_records` | `id`, `account_id`, `kind` (checked against the list above), `stars` 1 to 5, `victim_account_id` (nullable, set to null if that account is deleted), `created_at` |

# Police: NPC jail at death

A wanted player who dies wakes up in a police cell instead of the clinic (`socket/src/jail.ts`, Laravel `JailService`). `goesToNpcJail(player)` is the one place that decides it. It stays on even when officers are on duty (decided 2026-11-13): otherwise dying would be a cheaper escape than an arrest whenever an officer is connected.

## Rules

- When: health reaches 0 (`knockOut` cause `health`) while the player has at least 1 star, or is already serving a sentence. Inventory, clothes and the cash bag are lost as usual and the killer still gets the murder stars.
- Sentence: 2 minutes per star at death, 10 minutes at most, counted on connected time only (not while knocked out). The stars drop to 0 when the sentence starts and the wanted level is saved.
- Cell: the least crowded cell of the manifest's `police.cells` (a free one first, then two players share one). Every move outside the cell's `bounds` is refused and the player is put back inside (`MoveRejection` `jailed`). Cell doors stay closed with their collision.
- In a cell: no punch (given or taken), no ATM, no trade, no cash bag pick-up.
- End: when the time runs out, or when the fine is paid, the player is teleported outside the station door (the `police` building's door destination, like the admin teleport) and gets `jail_released`.
- Fine: 100 coins per star at death, 500 at most. Taken from the bank first, then cash, in one go, and destroyed (one `transactions` row `jail_fine`, one ledger row per wallet touched, nothing credited). Not enough in bank and cash together: refused, the player stays in the cell. No debt, no partial payment.
- Jail tax (decided 2026-11-13): the death that starts an NPC sentence pays the usual hospital bill (`SurvivalService::HOSPITAL_FEE`, from the bank, as at the clinic) plus 50 coins per star of the sentence, 250 at most. The tax is taken from the bank first, then cash, before the cash bag drops; short of money, everything left is taken down to 0, no debt. It is destroyed (one `transactions` row `jail_tax`, one ledger row per wallet touched, nothing credited). Once per sentence (`account_wanted_levels.jail_billed`): a retried call or a second death in the same sentence pays nothing. An officer hold pays neither the bill nor the tax. A death with no star and no sentence pays the hospital bill only. The sentence and the fine to walk out early are unchanged.
- An alcohol black-out in a cell wakes the player up in their cell again.

## Constants

| Value | Owner | Copy |
|---|---|---|
| 2 min per star, 10 min at most | socket `policeConstants.ts` (the socket owns timers) | Laravel only checks the range (`JailService::MAX_SENTENCE_MS` = 600000) |
| 100 coins per star, 500 at most | Laravel `JailService` (Laravel owns money: it computes the amount it takes from the stars it stored) | socket `policeConstants.ts`, only to show the amount in the cell overlay |
| Jail tax 50 coins per star, 250 at most | Laravel `JailService::TAX_PER_STAR`, `MAX_TAX` (from the stars it stored) | none: the amount comes back in `jail_tax` |

The socket sends the number of stars, never an amount; Laravel refuses a number that does not match the stars it stored (`jail_mismatch`).

## Socket messages

| Message | Way | Fields |
|---|---|---|
| `jail_pay` | client → socket | none. Ignored when the player is not in a cell or a payment is pending; `jail_error` `jail_busy` within 2 s of the last one |
| `jail_state` | socket → client | `kind` `npc` or `officer`, `msLeft` integer, `fine` integer (0 for an officer hold), `stars` 0 to 5 (0 for an officer hold). Sent when the player arrives in the cell (respawn, join or officer) |
| `jail_released` | socket → client | `reason` `served`, `paid` or `released` (by an officer); `fine`, `bank`, `cash` integers after a payment, `null` otherwise |
| `jail_error` | socket → client | `message`, `code` (`jail_insufficient_funds`, `jail_mismatch`, `not_in_jail`, `jail_busy`, `jail_held_by_officer`) |
| `survival_knocked_out` | socket → client | adds `jailed` boolean: true when the player wakes up in a cell |
| `survival_hospital_bill` | socket → client | adds `jailTax` integer, 0 outside a cell death; `billed` is the hospital part |

## Laravel routes (realtime only)

| Route | Body | Answer |
|---|---|---|
| `GET /api/jail` | none | `{ jail: { kind, stars, ms_left } }`; `kind` `null`, `stars` and `ms_left` 0 when free |
| `PUT /api/jail` | `kind` `npc`, `officer` or `null` (required), `stars` integer, `ms_left` integer. `npc`: 1 to 5 stars, 1 to 600000 ms; `officer`: 0 star, 1 to 900000 ms; `null`: both 0 | `{ jail: { kind, stars, ms_left } }` |
| `POST /api/jail/pay` | `stars` integer 1 to 5, the stars of the sentence | `{ fine, bank, cash }`; 409 `not_in_jail` when there is no sentence (so a second call never takes the fine twice), 409 `jail_held_by_officer` for an officer hold, 409 `jail_mismatch`, 422 `jail_insufficient_funds` |
| `POST /api/survival/hospital` | adds `jailed` boolean and `jail_stars` integer 0 to 5 (required when `jailed` is true: the stars of the sentence, 0 for an officer hold). The socket sends it once the sentence is saved | adds `jail_tax` integer. NPC sentence: `billed` the hospital part, `jail_tax`, `balance_after` the bank after both; 0, 0 and `null` on a second call for the same sentence or for an officer hold. 409 `jail_mismatch` when `jail_stars` differs from the stored sentence or there is none. Losses and cash drop unchanged |

The socket loads the sentence right after the wanted level at the join, saves it when it starts, when it ends and when the player leaves.

## Stored fields

| Table | Fields |
|---|---|
| `account_wanted_levels` | adds `jail_kind` (`npc`, `officer` or null), `jail_stars` (stars at death, used for the fine and the tax), `jail_ms` (connected time left) and `jail_billed` (the death bill of this NPC sentence is paid). One check holds them together: free is `null`/0/0/false, an NPC sentence 1 to 5 stars and up to 600000 ms, an officer hold 0 star, up to 900000 ms and never billed |
| `transactions` | types `jail_fine` and `jail_tax`, `meta_json` `{ amount, stars, bank, cash }` |

## Manifest

Each `police.cells` entry carries `bounds` `{ minX, maxX, minZ, maxZ }`, the cell's inside in world coordinates, written by `build_police.py` and `build_police_site.py`.

# Police: cell tap and meal tray

A prisoner drinks at the tap of their cell and eats a free meal tray delivered to its hatch (`socket/src/jail.ts`, `survival.ts`; front `useJailCell`). Nothing goes through Laravel: no item, no coin, the socket applies the gain to the stats directly.

## Rules

- Both are for the prisoner of that cell only (`player.jail.cellId`), standing inside its `bounds`, within reach of the cell's `tap` or `hatch`.
- Tap: the same sip as a town fountain (`drink_fountain`, +25 thirst, 600 ms between sips) and the same budget: one sip, then every fountain and every tap is dry for that account for 30 min. A prisoner who drank at a fountain just before the arrest waits like at any fountain.
- Tray: one waits in the hatch when the prisoner is put in a cell (`assignCell`, at the respawn or at the join). Eating it gives the hunger of a whole Club Sandwich (4 portions of 12) and starts the next one: 3 min of connected time, not while knocked out or while a fine is being paid (the same clock as the sentence). One tray at a time: an uneaten tray never stacks. A 2 min sentence gets the arrival tray only; a 10 min sentence at most four.
- The tray leaves with the prisoner at release. It is not saved: a prisoner who joins again finds a tray in the hatch.
- Others see the prisoner eat through `user_action` (`action: 'eat'`, `code` the tray food) and drink through the fountain's `user_action`.

## Constants (`policeConstants.ts`)

| Name | Value | Rule |
|---|---|---|
| `MEAL_TRAY_INTERVAL_MS` | 180000 | connected time from a tray eaten to the next one |
| `MEAL_TRAY_HUNGER` | 48 | hunger given by one tray, a whole `food_sandwich` in `FoodCatalog` |
| `MEAL_TRAY_REACH` | 2.2 m | from the hatch, on the ground plane (the front shows the prompt from 2.0 m) |
| `MEAL_TRAY_FOOD` | `food_sandwich` | the food shown on the tray and in the bubble |

The tap uses the fountain reach (`FOUNTAIN_REACH`, 2.2 m in `survival.ts`, 2.0 m on the front).

## Socket messages

| Message | Way | Fields |
|---|---|---|
| `drink_fountain` | client → socket | none. Also accepted at the tap of the player's own cell |
| `jail_tray_eat` | client → socket | none. Ignored unless a tray waits, the sender is the prisoner of that cell, inside it and within `MEAL_TRAY_REACH` of the hatch, and not knocked out |
| `jail_tray` | socket → prisoner | `cellId` string, `ready` boolean, `food` item code. Sent after `jail_state`, when a tray arrives and when it is eaten |

## Manifest

Each `police.cells` entry also carries `tap` (top of the basin) and `hatch` (the tray shelf, on the bars), world coordinates written by `build_police.py` and `build_police_site.py`. The tray is part of the `Cell_0N_Hatch` mesh and always shows; the food model (`items/food/sandwich/model.glb`) is put on it while a tray waits.

# Police: licence and duty

A player buys a police licence at the front desk, then goes on and off duty at the locker room (`socket/src/police.ts`, Laravel `PoliceLicenceService`; front `usePolice`).

## Rules

- Licence: 300 coins from the bank only (cash does not count), for an account at least `TradeService::MIN_GIVER_AGE_HOURS` old, not from a cell. Bought once: a second purchase is refused (`police_licence_held`) and takes nothing. The coins are destroyed (one `transactions` row `police_licence`, one ledger row on the bank, nothing credited). No refund, no trade.
- The licence is kept for life but lost at every death: `POST /api/survival/hospital` (health or hunger or thirst at 0, also when the player is taken to a cell) and `POST /api/survival/hangover` (alcohol black-out) delete it and answer `licence_lost: true`. It must be bought again.
- Duty: E at the lockers (`police.lockers`) toggles it. Going on duty needs the licence, no cell, not knocked out and 0 star. Duty is not saved: it ends when the player leaves (or a new tab replaces the session), dies, or loses the licence.
- Uniform: on duty, the socket shows the four slots `head_accessory`, `top`, `bottom`, `shoes` as the uniform (`DUTY_UNIFORM`) to everyone, in `init`, `user_joined` and `appearance_updated` (`shownAppearance`), and no full skin. The player's real look is kept on the socket and updated by `appearance` messages during duty (the wardrobe and the worn clothes are untouched); it shows again when duty ends. The character editor (P) only changes body, face, hair and hair colour, which the uniform does not cover, so nothing the player sends can change the uniform. The front takes its own `appearance_updated` echo for the first-person arms, so they wear the uniform shirt.
- On duty: a landed punch gives no `assault` star (the hit is still recorded for the victim's self-defence); a kill is still a `murder`. Officers on duty get `wanted` from 1 star; going on or off duty sends them the current level of every wanted player.
- `isOnDuty(player)` and `onDutyPlayers(room)` in `socket/src/police.ts` are the checks other features use (pickpocket refused on duty, calls to the police).

## Constants

| Value | Owner | Copy |
|---|---|---|
| Licence price, 300 coins | Laravel `PoliceLicenceService::PRICE` | socket and front read it from `GET /api/police/licence` (`police_state.price`) |
| Account age, 72 h | Laravel `TradeService::MIN_GIVER_AGE_HOURS` | none |
| Desk reach 3 m (desk or officer), lockers 2.5 m, 2 m height, 1 s between two actions | socket `policeConstants.ts` | front `policeStation.ts` shows the prompt from 2.8 m and 2.3 m |
| Uniform: sheriff hat and shirt `#d8c39a`, basic trousers `#6b4a2e`, boots `#4a3222` | socket `DUTY_UNIFORM` | the `police_desk_officer` agent in `zones/police.json` wears the same |

## Socket messages

| Message | Way | Fields |
|---|---|---|
| `police_licence_buy` | client → socket | none. Ignored away from the desk, while a purchase is pending, within 1 s of the last action; `police_error` `police_jailed` from a cell |
| `police_licence_bought` | socket → client | `price`, `bank` (bank balance after) |
| `police_duty` | client → socket | none. Ignored away from the lockers or within 1 s; toggles duty. Refusals: `police_error` `police_no_licence`, `police_wanted`, `police_jailed`, `police_knocked_out` |
| `police_state` | socket → client | `licensed` boolean, `onDuty` boolean, `price` integer or `null` until loaded. Sent after the join, a purchase, a duty change and a licence loss |
| `police_duty_ended` | socket → client | `reason` `off`, `death` or `licence_lost` |
| `police_error` | socket → client | `code`, `message`; Laravel codes forwarded as they are |

## Laravel routes (realtime only)

| Route | Body | Answer |
|---|---|---|
| `GET /api/police/licence` | none | `{ licence: { held, price } }` |
| `POST /api/police/licence` | none | `{ licence: { held: true, price, bank } }`; 409 `police_licence_held`, 409 `police_jailed`, 422 `police_account_too_new`, 422 `police_insufficient_funds` |
| `POST /api/survival/hospital`, `POST /api/survival/hangover` | unchanged | add `licence_lost` boolean |

## Stored fields

| Table | Fields |
|---|---|
| `police_licences` | `account_id` (primary key), `tx_id` (the `police_licence` transaction, unique), `bought_at` |
| `transactions` | type `police_licence`, `meta_json` `{ amount }` |

# Police: handcuffs, escort, cell by an officer, bounty

An officer on duty handcuffs a player, walks them to a cell and locks them up; a wanted suspect pays the officer a capped bounty (`socket/src/handcuffs.ts`, Laravel `PoliceBountyService`; front `usePolice`, `game/police/handcuffs.ts`).

## Handcuffs

- An officer on duty (`isOnDuty`) handcuffs any player, wanted or not, who is within 2 m (2 m height too), not in a cell, not knocked out, not already handcuffed, and has neither moved (more than 5 cm in one move) nor punched for 3 s, on the socket clock (`Player.lastStepAt`, `lastPunchAt`).
- The officer holds E for 2 s. `police_cuff_start` starts a server timer; the client only shows the gauge. The attempt stops (`police_cuff_cancelled`) when the target moves or punches, when one of them is more than 2 m from the other, or when the officer lets go of E (`police_cuff_cancel`). When the timer ends the socket checks every rule again, and that nothing happened since the start.
- One suspect per officer. Cuffing an officer who escorts someone frees that person.
- Handcuffed: no punch, no ATM, no trade, no cash bag pick-up. Voice and chat stay (roleplay).
- Escort: the suspect cannot move alone (`MoveRejection` `cuffed`, answered by `position_correction`). On every accepted move of the officer the socket puts the suspect 1 m behind them, facing the same way, sends the suspect a `position_correction` and the others a `user_moved`.
- Freed (`police_cuffs` `cuffed: false`) when the officer presses E away from a cell door (`uncuffed`), goes off duty or loses the licence (`off_duty`), dies or blacks out (`officer_down`), leaves (`officer_left`), when the suspect dies or blacks out (`suspect_down`) or leaves (`suspect_left`), and after 5 minutes at most (`timeout`). The 5 minute limit stops an officer from holding a player for a whole session. Handcuffs are not saved: a suspect who leaves is free when they come back.
- No "hands behind the back" clip exists on the rig: a handcuffed player plays the normal clips. The suspect sees an overlay ("Handcuffed") and their movement keys do nothing.

## Cell by an officer

- The officer with a handcuffed suspect presses E near a cell door (`police.cells[].door`, 2 m): the suspect is uncuffed and put in that cell for 15 minutes of connected time (`jail.kind` `officer`, `stars` 0). The NPC jail rules hold: cell bounds, tap, meal tray, no punch, ATM, trade or bag, the clock stops while knocked out, the hold is saved and a player who comes back is put back in a cell.
- Unlike the NPC jail: never a fine (`jail_pay` answers `jail_held_by_officer`, the overlay says "Held by a police officer" with no Pay button), and any officer on duty who presses E at that cell door (with no suspect in tow) lets out the officer-held prisoners of that cell (`jail_released` `released`, out at the station door). NPC prisoners in the same cell stay.
- A wanted suspect's stars drop to 0 when the cell door closes.

## Bounty

- 15 coins per star of the suspect at the moment of the cell, paid in cash, 150 coins at most per officer over a rolling 24 h. Nothing for a suspect with no star (the socket does not call Laravel and tells the officer `not_wanted`).
- Laravel owns the amount, the cap and every check; the socket sends only who arrested whom, the stars and a reference (`arrest:<officer>:<suspect>:<ms>`).
- No bounty (`paid: 0`, `reason`):
  - `suspect_too_new`: the suspect's account is younger than 72 h (`TradeService::MIN_GIVER_AGE_HOURS`);
  - `friends`: officer and suspect are accepted friends;
  - `recent_exchange`: they traded (`transactions` `trade`, both in `meta_json.accounts`) or one sent the other money (`bank_transfer` with a ledger row on both accounts) in the last 7 days;
  - `suspect_already_paid`: this officer was already paid for this suspect in the last 24 h;
  - `no_crime_stars`: none of the stars can be matched to a crime that counts;
  - `daily_cap`: the 150 coins are reached (with `paid > 0` when the cap cut the bounty short).
- Stars paid: the stars the socket sends are matched to the suspect's `crime_records` of the last 24 h, newest first, until they are all accounted for; only crimes whose victim is neither the officer nor an accepted friend of the officer count, and stars with no record behind them are not paid. Why 24 h: a level of 5 stars is gone after 20 minutes of connected time, so the crimes behind the current stars are from the same play session; 24 h still covers a player who logged off wanted and came back later that day, and older records (already decayed or served) are never paid again.
- Idempotent: the same `ref` sent twice pays once and answers the first result again.

## Constants

| Value | Owner | Copy |
|---|---|---|
| Cuff reach 2 m, still 3 s, hold 2 s, 5 min at most, jitter 5 cm, escort 1 m, cell door 2 m, officer hold 15 min | socket `policeConstants.ts` | front `game/police/handcuffs.ts`: prompts from 1.8 m, gauge 2 s |
| 15 coins a star, 150 a day, crimes of the last 24 h, exchanges of the last 7 days | Laravel `PoliceBountyService` | none |
| Officer hold at most 900000 ms | socket `OFFICER_HOLD_MS` | Laravel `JailService::OFFICER_HOLD_MS` checks the range |

## Socket messages

| Message | Way | Fields |
|---|---|---|
| `police_cuff_start` | client → socket | `targetSessionId` string. Refusals: `police_error` `police_not_on_duty`, `cuff_busy`, `cuff_too_far`, `cuff_jailed`, `cuff_knocked_out`, `cuff_already`, `cuff_moving`, `police_busy` (within 1 s of the last police action) |
| `police_cuff_cancel` | client → socket | none: the officer let go of E |
| `police_cuff_started` | socket → officer and target | `officerSessionId`, `suspectSessionId`, `durationMs` |
| `police_cuff_cancelled` | socket → officer and target | `officerSessionId`, `suspectSessionId`, `reason` `released`, `moved`, `punched`, `too_far`, `gone`, `off_duty` |
| `police_cuffs` | socket → officer and suspect | `officerSessionId`, `suspectSessionId`, `cuffed` boolean, `reason` `null` when cuffed, else one of the reasons above or `cell` |
| `police_uncuff` | client → socket | none: the officer frees their suspect |
| `police_cell` | client → socket | none. Ignored off duty, away from a cell door or within 1 s of the last police action. With a suspect: lock up; without: let out the officer-held prisoners of that cell |
| `police_bounty` | socket → officer | `paid` integer, `stars` integer (stars paid), `reason` string or `null`, `cash` integer (cash after) or `null` for `not_wanted` |

## Laravel route (realtime only)

| Route | Body | Answer |
|---|---|---|
| `POST /api/police/bounty` | `suspect_account_id` existing account, `stars` integer 1 to 5, `ref` string up to 100 | `{ bounty: { paid, stars, reason, cash } }`; 422 `police_bounty_self`, 409 `police_no_licence` |

The bounty is one `transactions` row `reward` (`meta_json` `{ source: 'police_bounty', amount, stars, suspect_account_id, ref }`) and one cash ledger row `police_bounty`, written by `CoinRewardService::creditCash`.

# Police: pickpocket

A player steals one whole item stack from another, from behind, through a short gauge game (`socket/src/pickpocket.ts`, Laravel `PickpocketService`; front `usePickpocket`, `game/police/pickpocket.ts`, `GamePickpocket.vue`).

## Rules

- Who: the thief is not an officer on duty (`isOnDuty`), not in a cell, not handcuffed, not knocked out; the victim is not in a cell. Both accounts are at least `TradeService::MIN_GIVER_AGE_HOURS` (72 h) old. No safe zone.
- Limits (Laravel, table `pickpocket_attempts`): 10 minutes between two attempts of the same thief, whatever their outcome; the same victim robbed once per 24 h by the same thief (a pending or succeeded attempt counts, a failed one does not). The socket also ignores a second `pickpocket_start` within 1 s.
- Approach: within 1.5 m (1 m height) and inside the 60° cone behind the victim (30° on each side of the victim's back, from `ry`), in the same place (outdoors or the same house). The front shows the prompt on the `pickpocket` key (L by default, rebindable) from 1.4 m and a 50° cone.
- Game: the socket draws three windows (widths 0.15, 0.11, 0.08 of the gauge, centres at least 0.05 from the ends) and starts its clock when it sends them. The cursor is `cursorAt(t)`: 0 to 1 in 800 ms and back, from 0 at the start, on both sides. The thief sends `pickpocket_stop` three times; each stop is judged against the next window with the socket clock: it hits when the cursor was inside the window at some moment of the last 120 ms before the stop arrived. The three stops must all hit. The game ends after 4.5 s plus the 120 ms allowance (a perfect player needs 4 s at most: 0.8 s to the first window, then at most one full sweep, 1.6 s, to each of the next two).
- Why 120 ms: Meter Shot takes a fixed 250 ms off a run of several seconds, which only shortens a time. Here the allowance widens the window itself (at 1.25 gauge per second, 120 ms is 0.15 of the gauge); 250 ms would make the last window four times wider than drawn. 120 ms covers the round trip of most players (30 to 100 ms); a slower connection must press a little early. A stop is never accepted before the cursor reached the window on the socket clock.
- Position: on every move of the thief or the victim, and at each stop, the socket checks the cone and the reach again; out of them, the game fails at once (`out_of_position`).
- Failure (`missed`, `out_of_position`, `timeout`, or the thief leaving mid-game): `pickpocket_failed` (+1 star), the victim gets the thief's name, the attempt is closed as failed in Laravel. Cancelled (`cancelled`: the victim left or went to a cell, the thief went to a cell, was handcuffed or knocked out): no star, no alert, the attempt is still closed as failed (the 10 min wait applies).
- Success: witnesses are the other players (not the thief, not the victim, not knocked out) within 8 m of the thief, in the same place, with the thief inside their 120° front cone (60° on each side of where they look: about the width a player sees on screen at the default field of view, plus a little to the sides). With a witness: `pickpocket_seen` (+2 stars), the victim and every witness get the thief's name. Without: no star, no alert.
- Loot: Laravel lists the victim's stealable stacks; the thief has 5 s (plus the 120 ms allowance) to choose one, by its number key or a click. The whole stack moves, no value cap, the victim does not confirm. Nothing chosen in time: nothing taken. Never stolen (`PickpocketService::isStealable`): furniture and apartment assets, tools (the house key), worn clothes, premium (gem) items, bound or untradable items. Cash is not an item and is never touched.
- Afterwards: the victim gets `pickpocket_missing` with the item and quantity: at once with the thief's name when there was a witness, 30 s later without a name when there was none. Nothing is sent when nothing was taken.
- Idempotent: the socket sends one `take` per attempt; Laravel moves the stack once per attempt and answers the first result again to a repeat.

## Constants (`policeConstants.ts`)

| Name | Value |
|---|---|
| `PICKPOCKET_REACH`, `PICKPOCKET_HEIGHT_REACH` | 1.5 m, 1 m |
| `PICKPOCKET_CONE_DEG` | 60 (whole cone behind the victim) |
| `PICKPOCKET_START_COOLDOWN_MS` | 1000 |
| `PICKPOCKET_HALF_SWEEP_MS` | 800 (sent to the client as `halfSweepMs`) |
| `PICKPOCKET_WINDOW_WIDTHS`, `PICKPOCKET_WINDOW_MARGIN` | 0.15, 0.11, 0.08; 0.05 |
| `PICKPOCKET_GAME_MS` | 4500 (sent as `durationMs`) |
| `PICKPOCKET_LAG_ALLOWANCE_MS` | 120 |
| `PICKPOCKET_LOOT_MS` | 5000 (sent as `durationMs` of the loot) |
| `PICKPOCKET_MISSING_DELAY_MS` | 30000 |
| `WITNESS_REACH`, `WITNESS_CONE_DEG` | 8 m, 120 (whole front cone) |

10 minutes, 24 h, 72 h and the list of what is never stolen live in Laravel (`PickpocketService`, `TradeService::MIN_GIVER_AGE_HOURS`).

## Socket messages

| Message | Way | Fields |
|---|---|---|
| `pickpocket_start` | client → socket | `targetSessionId` string. Refusals: `pickpocket_error` `pickpocket_on_duty`, `pickpocket_jailed`, `pickpocket_cuffed`, `pickpocket_knocked_out`, `pickpocket_victim_jailed`, `pickpocket_position`, then the Laravel codes |
| `pickpocket_stop` | client → socket | none |
| `pickpocket_take` | client → socket | `code` string, one of the codes of the loot list. Ignored outside the 5 s, while a take is pending, or after one succeeded |
| `pickpocket_started` | socket → thief | `victimSessionId`, `windows` `[{ center, width }]` (gauge fractions 0 to 1), `halfSweepMs`, `durationMs` |
| `pickpocket_progress` | socket → thief | `stops` 1 to 3 |
| `pickpocket_failed` | socket → thief | `reason` `missed`, `out_of_position`, `timeout`, `cancelled` |
| `pickpocket_succeeded` | socket → thief | `witnessed` boolean |
| `pickpocket_loot` | socket → thief | `items` `[{ code, name, kind, quantity, previewImage }]`, `durationMs` |
| `pickpocket_taken` | socket → thief | `code`, `name`, `quantity` |
| `pickpocket_loot_closed` | socket → thief | none: the 5 s ran out |
| `pickpocket_alert` | socket → victim, witnesses | `kind` `failed` (victim), `seen` (victim), `witness`; `thiefSessionId`, `thiefPseudo`, `victimPseudo` |
| `pickpocket_missing` | socket → victim | `name`, `quantity`, `thiefPseudo` string or `null` |
| `pickpocket_error` | socket → thief | `code`, `message` |

## Laravel routes (realtime only)

| Route | Body | Answer |
|---|---|---|
| `POST /api/pickpocket/attempts` | `victim_account_id` existing account | 201 `{ attempt: { id } }`; 422 `pickpocket_self`, `pickpocket_account_too_new`, `pickpocket_victim_too_new`; 409 `pickpocket_cooldown`, `pickpocket_victim_recent` |
| `POST /api/pickpocket/attempts/{id}/outcome` | `outcome` `failed` or `succeeded` | `{ loot: [{ code, name, kind, quantity, preview_image }] }` (empty for `failed`); the same outcome again answers the same; 409 `pickpocket_settled` for the other one, 404 `pickpocket_unknown` when the attempt is not the caller's |
| `POST /api/pickpocket/attempts/{id}/take` | `item_code` string | `{ taken: { code, name, quantity } }`, a repeat answers the first; 409 `pickpocket_not_succeeded`, `pickpocket_item_gone`; 422 `pickpocket_not_stealable`, `pickpocket_inventory_full` |

The take runs in one transaction under row locks: it checks again that the item is stealable, not worn and still held, that the thief can carry the whole stack (`max_stack`), then revokes it from the victim and grants it to the thief.

## Stored fields

| Table | Fields |
|---|---|
| `pickpocket_attempts` | `id`, `thief_account_id`, `victim_account_id`, `outcome` (`pending`, `failed`, `succeeded`), `item_def_id`, `quantity`, `taken_at` (set together, on a succeeded attempt only), `created_at` |
