# Sports complex: how each sport is played

Product design for the sports of the complex west of Cove Heights (site decisions in `.claude/rules/roadmap.md`, section "Sports complex"). Decided with the user on 2026-11-14. One file per sport; each ends with a proposed field list for its placeholder JSON. No code or asset exists yet.

| Sport | File | Where | Kind |
|---|---|---|---|
| Indoor football | [football.md](football.md) | Gymnasium (and the outdoor pitch) | Team, ball physics |
| Basketball | [basketball.md](basketball.md) | Gymnasium, same court | Team, ball physics |
| Swimming races | [swimming.md](swimming.md) | Pool, 25 m, 6 lanes | Timed race |
| Diving | [diving.md](diving.md) | Pool, diving pit | Free, no score |
| Dance | [dance.md](dance.md) | Everywhere (emotes), studio (rhythm game) | Emotes, rhythm score |
| Boxing | [boxing.md](boxing.md) | Boxing hall, ring | Duel mini-game |
| Climbing | [climbing.md](climbing.md) | Climbing hall, boulders and 12 m wall | Timed, rhythm clicks |
| Ice skating | [skating.md](skating.md) | Ice rink | Sliding movement, timed race |
| Figure skating | [figure-skating.md](figure-skating.md) | Ice rink | Routine on music: jumps, spins and spirals timed along a route |
| Ice hockey (later, not built) | [hockey.md](hockey.md) | Ice rink | Team, puck physics |
| Running | [running.md](running.md) | 400 m track | Timed race |
| Tennis | [tennis.md](tennis.md) | 2 outdoor courts | Duel, ball physics |
| Pétanque | [petanque.md](petanque.md) | 4 outdoor pistes | Teams, boule physics |

## Shared rules

### Access

- The day pass or week pass (bought at the reception pavilion) opens the site gate and every building door, the outdoor courts included. Stands are inside the fence, so watching also needs a pass.
- A pass that expires while the player is on the site lets them stay until they leave.

### Coaches and structured matches

- Every venue has one coach NPC: one per building, plus a tennis coach between the two courts, a pétanque coach at the boulodrome and an athletics coach beside the track (who also runs the outdoor football pitch).
- Talking to the coach opens a sign-up panel. The **first player to sign up chooses the settings** of that match or race (format, length, distance, difficulty, as listed in each sport file). The next players join that match.
- **Kick-off**: at once when full; otherwise a 60 s countdown starts as soon as the minimum number of players is reached. Under the minimum, the sign-up stays open (proposed: cancelled after 5 minutes with nobody new).
- **Teams**: each player picks red or blue when signing up, so friends play together. At kick-off, if one team has 2 or more players than the other, the coach moves the last players who signed up.
- **Venue reserved**: while a structured match runs, its court, lane set or wall is reserved. Players not signed up are pushed off the playing area and can watch from the stands or the side.
- **Leaving or disconnecting mid-match**: the match goes on, the player's place is kept 10 s, and a player who reconnects in that time is put back in the match. Past that, their team plays one short. A team that drops to 0 players loses. A solo race simply records "did not finish".
- **Free play**: outside structured matches the venue is open. For ball sports the ball is asked from the coach and taken back when the player leaves the venue.

### Gear

- Bought in cash at the new sports shop in the mall. Owned items, needed to play their sport (each sport file says which).
- Gear **never wears out**.
- At death, **all sports gear the player carries or wears drops into the death bag**, with the cash bag rules (5 minutes, 72 h giver age, the killer cannot pick it up). The player respawns in the newcomer outfit as usual.
- Some gear is lent and not sold: balls (football, basketball, tennis), climbing shoes (lent with the pass at reception).
- Gear a player does not own can be borrowed at its venue for a fee, until they leave that venue (decided 2026-11-15, fees in [CORE.md](CORE.md) § 3).

| Gear | Sport | Slot |
|---|---|---|
| Swimsuit | Swimming, diving (entering the pool water) | Worn (bottom) |
| Boxing gloves | Boxing (ring and punch bags) | Worn on the hands |
| Ice skates | Skating | Worn (shoes) |
| Running spikes | Running races | Worn (shoes) |
| Tennis racket | Tennis | Held |
| Set of boules | Pétanque | Held |

### Camera (decided 2026-11-15)

The game is first person. Some sports switch to a third-person view on their own, and the player then sees their own
body (the same avatar, outfit and clips the other players see). `U` (rebindable, action `cameraView`) goes to the next
view where the sport stays playable that way, first person last; the choice is kept per sport until the page is reloaded.

| Sport | View | `U` |
|---|---|---|
| Swimming (in the pool water) | follow: 3.6 m behind the look, above the surface while the head is out, under it when diving; in a race the look is set down the lane | yes |
| Tennis (match, or ball in hand on a court) | court: 16 m behind the player's baseline, 10 m high, the body faces the net | no |
| Basketball and football (player of a match, or own ball out in free play) | broadcast: from the long side, 7 m behind the touchline and 8.5 m high (inside the gym hall), following the ball along the court but never more than 7 m from the player, stopping 9 m from each end; the move keys follow the screen and the body turns to where it runs | yes: then follow 4.2 m behind the look, then first person |
| Boxing (boxer of a bout) | duel: over the shoulder, 2.6 to 5.5 m behind by the gap, framing the midpoint; the body always faces the opponent; kept within 3.6 m of the ring, ropes ignored | yes |
| Dance rhythm game | stage: 4.6 m in front of the dancer, who stays left of the note lanes; slow sway of 18° | no |
| Figure skating routine | follow: 6 m behind the skater, who faces along the route | no |

Front only: `front/src/game/camera/sportsCamera.ts` computes the framing (tested), `useSportsCamera` applies it over the
first-person camera with a short blend and keeps the camera out of walls with a ray cast, `useOwnBody` draws the local
avatar. A sport exposes `cameraView()`; `GameView.vue` lists them in priority order (dance, tennis, boxing, swimming, gym). The local avatar gets the same clips as the others from the same socket messages (`avatarsOf` in `useGameRealtime`, and the gym composable's `avatar` / `sportsMove` / `setDribbling` / `setTopOverride`). The socket is not involved: moves,
aim and reach are still judged from the player's position and yaw.

### Rewards

- Sports pay **no coins**, ever.
- **Tasks**: per sport, one "games played" task and one "feat" task (a hard time, the black route, a carreau...), three tiers, badges only. Thresholds are set later with the `game-designer`, on the task system of `docs/TASKS.md`.
- **Weekly boards** (best times, dance scores): the first of each board receives a dated badge ("50 m champion, week 46"). Zero coins. Solo runs count on the boards.

### Server authority (all sports)

The socket owns the live state of every sport: match clock, score, ball and boule physics, race timing and finish order, rhythm judging on its own clock (with the usual network allowance), positions and gates. The client sends only intents (key down, key up, aim direction, click). Laravel owns gear ownership, pass checks, task counters, board entries and badges. Every result Laravel records comes from the socket, with one idempotency key per match.

### Open points shared by all sports

- Anti-farm for "games played" tasks: proposed to count only matches with at least 2 distinct accounts older than 72 h, and at most a few matches a day per pair of accounts (as for duels and trades).
- Street punches and crimes inside the complex: allowed as everywhere (no safe zone so far), or blocked on the playing areas?
- Prices of the gear: to be set by the `economist` with the pass prices.
- Sportswear (cosmetic) follows the normal clothes rule, unlike gear: confirm.
