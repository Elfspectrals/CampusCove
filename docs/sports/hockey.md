# Ice hockey (later)

Team game on the ice rink (`sports_ice_rink`, [skating.md](skating.md)). Not built: this file says what is coming so
the rink, the skating code and the next session plan for it. Shared rules in [README.md](README.md), core contract in
[CORE.md](CORE.md).

## Rules

- **Teams**: red against blue, 2 v 2 to 5 v 5 (the first player chooses 3 v 3 or 5 v 5; 2 v 2 starts a 3 v 3 lobby at
  its minimum), no goalkeeper role: whoever is nearest the net defends it. Team choice, balancing and kick-off follow
  the coach sign-up of CORE.md § 4.
- **Length**: the first player chooses 2 periods of 4 or 6 minutes, 30 s break between them, ends swap at the break.
  A tie after the last period is a draw (no shoot-out in V1).
- **Goal**: the whole puck crosses the goal line between the posts and under the bar. The scorer's team gets 1 point,
  play restarts with a face-off at centre ice.
- **Face-off**: the puck is dropped between one player of each team on the dot; both strike on the drop. Face-offs at
  the start of each period, after a goal, after an icing and after the puck leaves the rink.
- **Icing**: a team shooting the puck from its own half over the far goal line without anyone touching it: face-off in
  that team's end.
- **Offside**: not in V1 (too hard to read without a referee view). The blue lines stay as markings.
- **Contact**: the skating crash and bump rules apply (`tickSkating`, skating.md § Ice feel and balance); a deliberate
  check is a bump. No fights, no penalty box in V1; punches stay what they are elsewhere in town (no safe zone so far,
  README open point).
- **Leaving**: a player who leaves the rink or disconnects keeps their place for 10 s (`rejoinGraceMs`), then the team
  plays short; a team at 0 loses by forfeit (CORE.md).

## Controls

- Skating as in skating.md (forward pushes, mouse and side keys carve, Space brakes).
- **Stick**: left click held winds a slap shot (power on a meter like the darts power bar, released to shoot), a quick
  click is a wrist shot or a pass towards the aim. Near a loose puck (within 1.2 m in front) the stick takes it and
  carries it (stickhandling) until a shot, a pass, a steal or a hit.
- **Steal**: right click pokes the stick forward; on a puck carrier within reach it takes the puck with a chance that
  falls with the carrier's speed advantage, rolled by the socket.

## Puck

- Physics owned by the socket at its tick (CORE.md: ball physics are socket state): a disc of 7.6 cm, sliding with very
  low friction on the ice, bouncing on the boards (losing a share of its speed), stopping in the nets, never leaving
  the ice except over the end glass (then a face-off).
- Positions broadcast to the players in the venue at the sports tick and interpolated by the front; the carrier's
  stick drives the puck while it is carried.
- Model: a black disc (simple builder, not `make model`), lent by the coach like the balls of the other sports
  (`lend(room, player, 'hockey_puck', 'sports_ice_rink')` for free play, the match puck is socket state only).

## Sticks

- **Lent, not sold** (like the football and basketball balls): the coach lends a stick with the sign-up or for free
  play, taken back when the player leaves the rink (`player.sportsLoans`, CORE.md § 2). Skates stay required
  (`gear_ice_skates`).
- Model: one stick from `make model` (a wooden stick with a curved blade, 1.5 m), held in the hands through the
  `sports_loans` broadcast, with a held pose and the shot clips below.

## What the rink needs

- **Goals**: two nets (1.83 × 1.22 m, red posts, white net), on the goal lines already painted 4 m from each end, with
  collision for the frame only. They must be removable or folded during skating races, because the race lane at each
  end passes over the goal positions (raceOval in `skating.json`): a goal appears only while a hockey match is on, as
  a runtime prop of the zone, like the market stalls.
- **Markings**: centre line, blue lines, goal lines, the 5 face-off circles and dots and the creases are already on the
  ice. The two end-zone face-off dots per end exist; the four neutral-zone dots are to be added.
- **Shared play area**: hockey and skating races use the same ice, so both venues get `playAreaId: 'rink_ice'`: a race
  refuses sign-ups while a hockey lobby or match runs and the other way round (`sports_venue_busy`, CORE.md § 4).
- **Scoreboard**: the board hanging over centre ice shows the score and the clock during a match (texture or HTML
  overlay; the HUD shows it anyway).

## Coach

- The rink coach (`rink_coach`) serves both venues through `registerCoach({ id: 'rink_coach', venues: ['rink_skating',
  'rink_hockey'] })`; the sign-up panel already lists one entry per venue of a coach.
- Hockey settings from `hockey.json` `signup`: `format` (`3v3`, `5v5`), `periodMin` (4, 6), `teams: true`.

## HUD

Score, period and clock, face-off countdown, the carrier highlighted, shot power meter, results at the end. The skating
HUD (speed, rhythm, balance) stays.

## Server authority

The socket owns the puck, possession, steals (its roll), goals, icing, the clock and the score; the client sends only
intents (stick down, shot release with its power and aim, poke). Results go to `POST /api/sports/matches` with `team`
and `result` (`win`, `loss`, `draw`) per player and `score` = goals scored by the player.

## Rewards

No coins. Task "hockey games" counting only `counts_for_tasks` matches (CORE.md anti-farm), feat task proposal: a hat
trick (3 goals in one match). No weekly board (team game). Thresholds with the `game-designer`.

## Animations

Stick held (idle on skates), stickhandling, wrist shot, slap shot wind-up and release, poke check, goal celebration,
written on the human rig like the skating clips (`front/scripts/skins/clips.py`).

## Open points

- Offside and a penalty box in a later version?
- A goalkeeper role with its own pads and save clips?
- Does a check at full speed knock the puck loose, beyond the crash and bump rules?

## Proposed placeholder JSON fields

`sport` ("hockey"), `zone` ("sports_ice_rink"), `coachId` ("rink_coach"), `signup` (`format` 3v3 / 5v5, `periodMin`
4 / 6, `teams: true`), `goal` (size, positions on the goal lines), `puck` (radius, friction, boardRestitution,
maxShotSpeed), `stick` (reach, carryDistance, stealChanceBase), `icing` (true), `offside` (false), `rejoinGraceMs`
(30000), `boards` ([]), `tasks` (["hockey_games", "hockey_hat_trick"]), `gear` (["gear_ice_skates"]), `loans`
(["hockey_stick", "hockey_puck"]).
