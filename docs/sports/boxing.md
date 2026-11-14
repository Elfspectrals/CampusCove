# Boxing

A separate duel mini-game in the boxing hall's ring, not the street punch. Shared rules in [README.md](README.md).

## Rules

- 1 v 1 in the ring. Each boxer has a **boxing health bar** and an **endurance bar**, separate from the game's health.
- Health at 0: **knocked down**, a count of 10; mashing a key gets back up (once per round). **3 knockdowns = KO**.
- No KO at the end: decision on points (landed punches, weighted by punch type).
- **No real injury**: game health, hospital bill and police stars are untouched.

## Controls

Free movement inside the ring, third-person view.

- **Left click**: jab (fast, light).
- **Right click**: cross (slower, stronger).
- **Shift + click**: hook (strongest, slowest).
- **Hold F**: guard, blocks most damage, drains endurance.
- **Q / D**: side dodge.
- Punching and guarding drain endurance; low endurance makes punches slower.

## Flow

- **Structured fight**: sign-up with the boxing coach; the first player chooses the format (proposed 1 to 5 rounds of 1 min, 20 s rest).
- **Direct challenge**: two players can challenge each other at the coach without waiting for a queue (same fight, same rules).
- **Punch bags** free for training, gloves required.

## HUD

Both health and endurance bars, round and clock, knockdown count, final result (KO or points).

## Server authority

- The socket owns health, endurance, hits, guard, dodges and the clocks; hit reach and timing are checked on its positions and clock, as for the street punch.
- The client sends punch, guard down/up, dodge and movement intents only.

## Gear

**Boxing gloves required** for the ring and the punch bags.

## Rewards

- Task "fights won against distinct opponents", counted at most once per opponent per day (like the duellist). No weekly board.

## Animations

Guard stance and footwork, jab, cross, hook, block hit, dodge, hit reactions, knockdown, get-up, KO, win.

## Failure cases

A boxer who leaves the ring or disconnects past the 30 s grace loses the fight.

## Open points

- Exact round choices, damage per punch, endurance costs.
- Whether the get-up is a key mash or a timing.

## Proposed placeholder JSON fields

`sport` ("boxing"), `ring` (centre, sizeM, ropes), `roundsChoices` ([1, 3, 5]), `roundSec` (60), `restSec` (20), `health`, `endurance`, `punches` ({ jab, cross, hook }: damage, enduranceCost, cooldownMs, reachM), `guard` (damageFactor, drainPerSec), `dodge` (cooldownMs), `knockdown` (countSec 10, maxPerFight 3, getUpPerRound 1), `punchBags` (positions), `gear` (["boxing_gloves"]), `coachId`, `tasks` (["fights_won_distinct"]).
