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

## Decided (2026-11-14, `front/public/assets/sports/rules/boxing.json`, status `ready`)

- Rounds 1, 3 or 5 (chosen by the first to sign up), 5 s intro in the corners, 60 s rounds, 20 s rest. Two boxers, no teams. Signing up needs your own gloves; when the second boxer signs up the bout starts at once, which is the direct challenge.
- Health 120, endurance 100, regenerating 12/s outside the guard. During the rest endurance refills and health gets back 20.
- | Punch | Damage | Endurance | Cooldown | Reach | Points |
  |---|---|---|---|---|---|
  | Jab (click) | 5 | 6 | 450 ms | 1.7 m | 1 |
  | Cross (right click) | 9 | 11 | 800 ms | 1.9 m | 2 |
  | Hook (Shift + click) | 14 | 18 | 1150 ms | 1.5 m | 3 |
  A punch must face the target (cosine 0.3 or more, as for the street punch) and be within 1 m in height. Under 25 endurance every cooldown is 1.5 times longer; a punch the boxer cannot pay for is refused.
- Guard (hold the cook key, F by default): takes 20 % of the damage, scores nothing, drains 10/s and drops at 0. No punching while guarding.
- Dodge (the strafe keys, Q / D on AZERTY): 400 ms without being hit, 1 s cooldown, 8 endurance.
- Knockdown at 0 health: the count is 10 s and the round clock waits. Getting up takes 12 clicks at least 80 ms apart and gives back 50 health, once per round; a second knockdown in the same round, a count that reaches 10 or a third knockdown in the fight is a KO.
- No KO: the points of landed punches decide; equal points are a draw. A boxer outside the ring after the intro, or away past the 30 s grace, loses by forfeit.
- Get-up is a click mash (the open point is closed).
- View: first person, as everywhere in the game (no third-person camera exists).
- Punch bags: three `decor/punch_bag` props in the hall, decor only for now (no training interaction yet).

## Socket contract

| Message | Direction | Payload |
|---|---|---|
| `boxing_punch` | client → server | `{ kind: 'jab' \| 'cross' \| 'hook' }`, only from a boxer of the running bout; reach, facing and height are checked on the server positions |
| `boxing_guard` | client → server | `{ up: boolean }` |
| `boxing_dodge` | client → server | `{ side: 'left' \| 'right' }` |
| `boxing_getup` | client → server | `{}`, one press of the mash |
| `boxing_state` | server → boxers and players in `sports_boxing` | `{ venue, phase: 'intro' \| 'round' \| 'rest' \| 'over', round, rounds, maxKnockdowns, phaseEndsAt, serverNow, boxers: [{ sessionId, name, corner: 'red' \| 'blue', health, maxHealth, endurance, maxEndurance, guard, knockdowns, countEndsAt: number \| null, canGetUp, points }], result: { winner: sessionId \| null, method: 'ko' \| 'points' \| 'draw' \| 'forfeit' } \| null }`, at each change and every 250 ms |
| `boxing_hit` | server → same | `{ sessionId, targetSessionId, kind, outcome: 'landed' \| 'blocked' \| 'dodged' \| 'missed', damage }` |
| `boxing_dodged` | server → same | `{ sessionId, side }` |
| `boxing_tired` | server → the boxer | `{}` |

The red corner is the first to sign up. At kick-off both boxers are moved into their corners on the ring (`teleported`); at the end they are moved out to the exits in front of the ring. The match is recorded with `recordMatch`: `win`, `loss`, `draw` or `dnf` per boxer, `score` = points. No coins.

## Build

1. Blender (headless): `build_sports_boxing.py` (hall interior, then `build_sports_boxing_ext.py`), `build_house_lightmaps.py -- work sports_boxing`, `build_sports_boxing_site.py`, `build_boxing_decor.py` (punch bag, gloves from `make model`, slug `a_pair_of_red_leather_boxing_gloves_side`). Ring and punch bag pieces: `lib_boxing.py`.
2. `npm run assets:optimize -- work sports_boxing`, `-- park sports_boxing`, `-- decor punch_bag boxing_gloves`, then `node scripts/apply-decor-collision.mjs` on each decor model.
3. `node scripts/apply-sports-boxing.mjs`: collisions, the `sports_boxing` manifest zone, the ring, coach, corners and exits in `boxing.json`, `zones/index.json`.
