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
- **Hold left click**: hook (strong, short reach).
- **Hold right click**: uppercut (strongest, shortest reach).
- Punches thrown in a row make **combos** (see below).
- **Hold F**: guard, blocks most damage, drains endurance. Raised just before the hit it is a **parry**.
- **Q / D**: side dodge.
- The keys are shown as keycaps in the bout HUD, with what a tap and a hold do.
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

Guard stance and footwork, jab, cross, hook, uppercut, hook and uppercut wind-ups, punches blending into each other in a combo, block hit, dodge, hit reactions, knockdown, get-up, KO, win.

## Failure cases

A boxer who leaves the ring or disconnects past the 10 s grace loses the fight.

## Decided (2026-11-14, `front/public/assets/sports/rules/boxing.json`, status `ready`)

- Rounds 1, 3 or 5 (chosen by the first to sign up), 5 s intro in the corners, 60 s rounds, 20 s rest. Two boxers, no teams. Signing up needs your own gloves; when the second boxer signs up the bout starts at once, which is the direct challenge.
- Health 120, endurance 100, regenerating 12/s outside the guard. During the rest endurance refills and health gets back 20.
- | Punch | Damage | Endurance | Cooldown | Reach | Points |
  |---|---|---|---|---|---|
  | Jab (left click) | 5 | 6 | 450 ms | 1.7 m | 1 |
  | Cross (right click) | 9 | 11 | 800 ms | 1.9 m | 2 |
  | Hook (hold left click) | 17 | 18 | 1150 ms | 1.5 m | 3 |
  | Uppercut (hold right click) | 21 | 20 | 1250 ms | 1.3 m | 3 |
  A punch must face the target (cosine 0.3 or more, as for the street punch) and be within 1 m in height. Under 25 endurance every cooldown is 1.5 times longer; a punch the boxer cannot pay for is refused.
- Tap or hold (decided 2026-11-15): the socket times each button from its press to its release on its own clock; a new press of the same button restarts the timer. Under 250 ms it is a tap (jab or cross), from 250 ms a hold (hook or uppercut), with no upper limit. From 250 ms the other players see the wind-up. A punch is thrown at the release.
- Input buffer: a release less than 200 ms before the cooldown ends is kept and thrown by the socket when the cooldown ends (on its 100 ms tick); earlier, it is refused.
- Combos (decided 2026-11-15): each thrown punch joins the boxer's chain when it is thrown at most 500 ms after the previous punch's cooldown ended, otherwise the chain starts again from it. A miss, a dodged punch or a landed punch taken from the opponent clears the chain. When the end of the chain matches a combo (the longest match wins), its last punch gets the bonus: on a landed punch the bonus damage and points, on a blocked one the bonus damage times the guard factor and no points. The chain keeps its last 4 punches, so a combo can be thrown again at once.
  | Combo | Sequence | Bonus damage | Bonus points |
  |---|---|---|---|
  | One-two | jab, cross | +3 | +1 |
  | Double jab | jab, jab, cross | +5 | +2 |
  | One-two-hook | jab, cross, hook | +6 | +2 |
  | Uppercut-hook | uppercut, hook | +5 | +2 |
  | Full combo | jab, cross, hook, uppercut | +10 | +4 |
  The full combo lands 5 + 12 + 23 + 31 = 71 damage, over half the health bar, in about 3.5 s and costs 55 endurance.
- Guard (hold the cook key, F by default): takes 20 % of the damage of a jab or a cross, scores nothing, drains 10/s and drops at 0. No punching while guarding.
- **Technique** (third review, 2026-11-17: hammering the jab won and nothing showed the guard or the heavy punches; numbers in `boxing.json`):
  - **Tired arms** (`flurry`): punches thrown in a row, with less than 800 ms of rest after a cooldown, count as one flurry. The first 4 are whole (a full combo fits); the n-th punch after them costs n × 50 % more endurance and hits n × 20 % less, down to 40 %: a row of jabs goes 5, 5, 5, 5, 4, 3, 2, 2 damage for 6, 6, 6, 6, 9, 12, 15, 18 endurance. The HUD says "heavy arms" as soon as the next punch would be weaker.
  - **Parry** (`parry`): a guard raised 250 ms or less before a punch arrives parries it, whatever the punch: no damage, the attacker is stunned 900 ms (no move, punch, guard or dodge; their chain, queued punch and held buttons are dropped). A guard raised again less than 600 ms after it dropped cannot parry, so tapping the key in bursts does not work.
  - **Counter** (`counter`): after a parry or a dodged punch the defender has 1.2 s: their next punch, if it lands, does double damage and scores 2 more points. The window is spent by the next punch thrown, landed or not.
  - **Guard break** (`guardBreak`): a hook or an uppercut on a guard held for more than 250 ms breaks it: half damage, the guard drops and the defender is staggered 700 ms like a stunned boxer. The wind-up of a held punch is visible from 250 ms, so it can be parried or dodged.
  - So: a row of jabs loses to a guard, then to a parry and its counter; a guard that never drops loses to a heavy punch; a heavy punch loses to a dodge or a parry.
  - What a player can still do, and what happens: guard through a whole round (broken by the first heavy punch, and the guard drains endurance); tap the guard key fast to fish for a parry (the 600 ms re-arm refuses it); throw only heavy punches (slow, each wind-up is shown, a parry or a dodge gives the counter); walk away while stunned (the socket refuses the move, `tackled`); punch during a stun (refused); land a counter on a guard (the doubled damage goes through the guard like any punch, no points, and the window is spent); hammer one button (weaker and dearer from the fifth punch, then refused for lack of endurance).
- Dodge (the strafe keys, Q / D on AZERTY): 400 ms without being hit, 1 s cooldown, 8 endurance.
- Knockdown at 0 health: the count is 10 s and the round clock waits. Getting up takes 12 clicks at least 80 ms apart and gives back 50 health, once per round; a second knockdown in the same round, a count that reaches 10 or a third knockdown in the fight is a KO.
- No KO: the points of landed punches decide; equal points are a draw. A boxer outside the ring after the intro, or away past the 10 s grace, loses by forfeit.
- Get-up is a click mash (the open point is closed).
- View (2026-11-15, calmer since 2026-11-17): third person during a bout, over the boxer's shoulder. The camera keeps its bearing while the opponent circles within 20° of it and trails by 20° beyond (`settleAxis`), and it eases to its place three times slower than the other framed views, so small steps no longer swing the picture. The body always faces the opponent (see "Camera" in [README.md](README.md)); `U` goes back to first person. The player's own boxer plays the punches, charge, guard, dodges and hit reactions the others see. Punch bags stay first person.
- Punch bags: three `decor/punch_bag` props in the hall. A gloved player in reach punches them with the same four attacks (`boxing_bag { bag, kind }`, one hit every 400 ms); the bag rocks.
- **Bag round** (second review, 2026-11-15: the bag must be the boxing game with the bag as the opponent, to work the combos, with the gloves on screen). The first punch on a free bag starts a round of 60 s for that player (`boxingBag.ts`, numbers in `boxing.json` `bag`). The socket draws a combo from the list of the bout (`combo.list`, never the same twice in a row); the player throws its punches in order, less than 1.2 s apart. A full combo scores 10 points a punch, doubled from the fourth combo in a row without a mistake. A wrong punch or a gap over 1.2 s starts the combo again and breaks the streak (a wrong punch that is the first of the combo counts as its first). The round ends at the bell, or when the player walks more than 3 m from the bag or leaves. Nothing is saved and nothing is paid: it is training.
- **Combo list** (2026-11-15, asked by the user on the model of a Mortal Kombat move list): facing a bag or in a round, the list of combos is shown on the left; the up and down arrows choose one (`boxing_bag_combo { combo: id | null }`, kept per account on the socket until changed). A chosen combo comes back after each success, so it can be drilled; "any combo, at random" is the first entry and the default. The list is the combos of the bout plus seven training ones (`bag.extra` in `boxing.json`) that also use the slip to the left, the slip to the right (the move left and right keys) and the guard (F): a move of a combo is a punch, a slip or the guard, sent as `boxing_bag { bag, kind }`. A slip or the guard counts in the round but does not rock the bag, and can start a round like a punch.
- What a player can still do, and what happens: hit a bag someone trains on (it rocks, no round, no points for anyone); hit another bag during their own round (it rocks, no points); hammer one button (wrong punches, the score does not move); walk away (the round ends, the score is shown); keep punching after the bell (a new round starts on the next punch); punch faster than every 400 ms (the extra punches are dropped).
- In a bag round the player wears the gloves in first person and on their avatar (other players see them from the first counted punch), the first-person arms and the avatar play the boxing punches, and the view is the bout's duel view turned to the bag, kept out of the walls (`walls` on the duel view).

## Robot opponent (2026-11-17)

Called from the coach panel by the first boxer signed up (CORE.md § robots). The robot is driven on the socket tick by `boxingRobot.ts` (`thinkBoxer`, tested), through the same presses, releases, guard and dodge as a player, so its punches obey the same cooldowns, endurance, wind-up and parry rules. It walks to 1.15 m of its opponent, circles, steps back to breathe when its endurance is low, and stays 0.5 m inside the ropes.

| Level | Reaction to a wind-up | Answer to a wind-up (parry / dodge / held guard) | Combos | Pause between plans | Breaks a held guard after | Walk |
|---|---|---|---|---|---|---|
| Easy | 650 ms | 0 % / 10 % / 15 % | single punches | about 1.6 s | 2.5 s | 2.2 m/s |
| Normal | 420 ms | 25 % / 30 % / 35 % | up to 2 punches | about 1.0 s | 1.4 s | 3.0 m/s |
| Hard | 260 ms | 45 % / 40 % / 10 % | up to the full combo | about 0.65 s | 0.8 s | 3.8 m/s |

A robot that tried a parry and saw no punch after 240 ms drops its guard and dodges. With a counter open it throws a cross at once. Knocked down, it presses to get up (every 320, 200 or 120 ms). Heavy punches are held past the hold time, so the player sees the wind-up and can parry or dodge. No boxing task exists yet, so a bout against a robot only counts as a recorded match.

## Socket contract

| Message | Direction | Payload |
|---|---|---|
| `boxing_press` | client → server | `{ hand: 'left' \| 'right' }`, a mouse button goes down; only from a boxer of the running bout |
| `boxing_release` | client → server | `{ hand: 'left' \| 'right' }`, the button goes up; the socket turns the press time into jab, cross, hook or uppercut and throws it; reach, facing and height are checked on the server positions |
| `boxing_charge` | server → boxers and players in `sports_boxing` | `{ sessionId, hand, on }`, `on: true` when a press passes 250 ms (wind-up shown), `on: false` when that button is released (just before its `boxing_hit`, or alone when the punch is refused) |
| `boxing_guard` | client → server | `{ up: boolean }` |
| `boxing_dodge` | client → server | `{ side: 'left' \| 'right' }` |
| `boxing_getup` | client → server | `{}`, one press of the mash |
| `boxing_state` | server → boxers and players in `sports_boxing` | `{ venue, phase: 'intro' \| 'round' \| 'rest' \| 'over', round, rounds, maxKnockdowns, phaseEndsAt, serverNow, boxers: [{ sessionId, name, corner: 'red' \| 'blue', health, maxHealth, endurance, maxEndurance, guard, stunEndsAt: number \| null, counterEndsAt: number \| null, weary, knockdowns, countEndsAt: number \| null, canGetUp, points }], result: { winner: sessionId \| null, method: 'ko' \| 'points' \| 'draw' \| 'forfeit' } \| null }`, at each change and every 250 ms |
| `boxing_hit` | server → same | `{ sessionId, targetSessionId, kind: 'jab' \| 'cross' \| 'hook' \| 'uppercut', outcome: 'landed' \| 'blocked' \| 'parried' \| 'guard_broken' \| 'dodged' \| 'missed', damage, counter: boolean, combo: 'one_two' \| 'double_jab' \| 'one_two_hook' \| 'upper_hook' \| 'full_combo' \| null, chain }`, `chain` = punches in the boxer's chain after this one |
| `boxing_dodged` | server → same | `{ sessionId, side }` |
| `boxing_tired` | server → the boxer | `{}` |
| `boxing_bag` | client → server | `{ bag: index in punchBags, kind: 'jab' \| 'cross' \| 'hook' \| 'uppercut' \| 'dodge_left' \| 'dodge_right' \| 'guard' }`, within 1.3 m and facing the bag, gloves owned, one every 400 ms |
| `boxing_bag_combo` | client → server | `{ combo: id of a bag combo \| null }`: the combo to drill; `null` goes back to a random one. Applied at once to a running round (`outcome: 'drill'`) |
| `boxing_bag_hit` | server → players in `sports_boxing` | `{ bag, sessionId, kind, training }`; `training` is true when the punch counts in that player's bag round |
| `boxing_bag_round` | server → the player in a bag round, after each counted move or a change of combo | `{ bag, endsAt, serverNow, combo: { id, sequence }, drill: id \| null, index, score, combos, streak, outcome: 'hit' \| 'combo' \| 'wrong' \| 'late' \| 'over' \| 'drill' }` |
| `boxing_bag_end` | server → players in `sports_boxing` and the player | `{ bag, sessionId, score, combos, reason: 'time' \| 'left' }` |
| `boxing_no_gloves` | server → the player | `{ reason: 'missing' \| 'check_failed' }` |

The red corner is the first to sign up. At kick-off both boxers are moved into their corners on the ring (`teleported`); at the end they are moved out to the exits in front of the ring. The match is recorded with `recordMatch`: `win`, `loss`, `draw` or `dnf` per boxer, `score` = points. No coins.

## Build

1. Blender (headless): `build_sports_boxing.py` (hall interior, then `build_sports_boxing_ext.py`), `build_house_lightmaps.py -- work sports_boxing`, `build_sports_boxing_site.py`, `build_boxing_decor.py` (punch bag, gloves from `make model`, slug `a_pair_of_red_leather_boxing_gloves_side`). Ring and punch bag pieces: `lib_boxing.py`.
2. `npm run assets:optimize -- work sports_boxing`, `-- park sports_boxing`, `-- decor punch_bag boxing_gloves`, then `node scripts/apply-decor-collision.mjs` on each decor model.
3. `node scripts/apply-sports-boxing.mjs`: collisions, the `sports_boxing` manifest zone, the ring, coach, corners and exits in `boxing.json`, `zones/index.json`.
