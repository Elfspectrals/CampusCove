# Figure skating

A routine on music at the ice rink, on the model of the figure skating of Mario & Sonic at the Olympic Winter Games:
the skater is carried along a route and the player times the elements. Decided on 2026-11-15 after the second review
("ice skating is not gameplay, it is just moving"): the user chose a figure routine over a trick line or a better
race. The race of [skating.md](skating.md) stays; both are offered by the rink coach. Shared rules in
[README.md](README.md).

## Rules

- 1 to 4 skaters, chosen by the first player (`skaters`); the routine starts when that many signed up. Ice skates
  required (bought, or borrowed from the coach).
- One routine: 112 beats at 90 bpm (74.7 s), music `ice_waltz`. Each skater follows the oval of their lane (radius 8,
  10, 6 and 12 m around the same spine as the race, one lap in 32 beats), east on the south straight first.
- Twelve elements at fixed beats, marked on the ice: 5 jumps, 3 spins, 3 spirals and a last jump.

| Element | Input | Score |
|---|---|---|
| Jump | the jump key on the mark; then left / right in the 700 ms in the air, one turn each, 3 at most | 300 perfect, 150 good; 100 a turn |
| Spin | left and right in turn for the 4 beats it lasts | 25 a press, 16 at most; judged perfect from 12 presses, good from 6 |
| Spiral | hold forward from its start to its end (4 or 6 beats) | start and end each 200 perfect, 100 good |

- Timing is judged on the socket clock: never early by more than the window, 120 ms of lag forgiven; perfect within
  90 ms, good within 200 ms. A jump or a spiral not started 320 ms after its time is missed. A spiral still held
  320 ms after its end counts as good.
- The best score wins; ties share a place. Nothing is saved (no board, no task) and nothing is paid.

## What a skater can still do, and what happens

Press the jump key away from a jump (nothing); press the wrong key for the element (nothing, the element can still be
taken); hammer one side during a spin (only presses that alternate count); turn after landing (nothing); let go of
a spiral early (the start keeps its points, the end scores nothing); hold it too long (good); move or look around (the
socket carries the skater and the game sets the look); leave the rink or disconnect (out, no place); press after the
music (nothing).

## Server authority

`socket/src/sports/figureSkating.ts` (pure: rules, route, judging) and `figureRink.ts` (venue `rink_figure`, sport
`figure_skating`, sharing the play area `ice_rink` with the race so only one runs at a time). The socket moves each
skater along their lane on every sports tick and broadcasts the move; the front draws its own skater at the same
place from the same formula (`front/src/game/sports/skating/figure.ts`), so the picture does not wait for the network.
The jump (0.6 m lift, one turn plus one per extra turn) and the spin (2.2 turns a second) are drawn on the avatars
from `figure_state`, with no new clip.

## Messages

| Message | Direction | Payload |
|---|---|---|
| `figure_press` | client → server | `{ key: 'jump' \| 'left' \| 'right' \| 'hold' }`, at most one every 30 ms |
| `figure_release` | client → server | `{}`, the end of a held spiral |
| `figure_start` | server → skaters and players in the rink zone | `{ venue, startAt, serverNow, skaters: [{ sessionId, name, lane }] }`; the music starts at `startAt` (4 s after kickoff) |
| `figure_state` | same, every sports tick | `{ venue, serverNow, startAt, skaters: [{ sessionId, score, next, air: { at, rotations } \| null, spinning, holding, out }] }` |
| `figure_event` | same | `{ venue, sessionId, score }` plus `{ type: 'judge', index, element, judgement }`, `{ type: 'rotation', rotations }`, `{ type: 'spin_press', presses }` or `{ type: 'hold', index, judgement }` |
| `figure_end` | same | `{ venue, results: [{ sessionId, name, score, place, judged }] }` |

## Rules file

`front/public/assets/sports/rules/figure_skating.json`: `venue`, `song`, `bpm`, `countdownMs`, `lengthBeats`, `route`
(`a`, `b`, `radius`, `laneOffsetsM`, `lapBeats`), `elements` (`kind`, `beat`, `beats`), `windowsMs`, `allowanceMs`,
`jump`, `spin`, `spiral`, `signup`, `gear`. Refused at boot when two elements overlap or one ends after the music.

## View

Third person behind the skater (follow, 6 m back), who faces along the route; the rink's weekly times panel is hidden
during a routine.
