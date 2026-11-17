# Dance

Two parts: dance emotes usable anywhere in the game, and a rhythm mini-game in the dance studio (mirror wall). Shared rules in [README.md](README.md).

## Dance emotes (everywhere)

- An emote wheel (rebindable key) plays a looping dance, seen by other players; moving cancels it.
- **4 dances free for everyone**; more are unlocked by the tiers of the dance task. Never sold for coins.

## Rhythm mini-game (studio)

### Rules

- **3 songs of about 1 min 30** (slow, medium, fast), each in **easy, normal, hard** (note density).
- Notes fall in 4 columns; each is hit when it reaches the line: perfect, good or miss, with a combo. The character dances better or worse according to the hits.
- Modes chosen by the first player at the coach:
  - **Solo**: one dancer.
  - **Team (synchronised)**: 2 to 4 dancers on the same song; a team score with a sync bonus when everyone hits the same note.
  - **Duel**: 2 to 4 dancers on the same song, each their own score, the best wins.

### Controls

The four arrows or ZQSD / WASD, one per column. Movement is locked during a song.

### HUD

Note highway, judgement ("Perfect", "Good", "Miss"), combo, score. Each lane has its own colour and ends on a keycap that shows the arrow and the key bound to it (read from the player's bindings); the notes carry the same arrow and key, the lane lights up on a press, and the judgement appears over the keycap of its lane, which glows on a hit and greys on a miss (second review, 2026-11-15: the keys to press were not clear); in team mode the sync bonus; in duel mode the other dancers' scores.

### Server authority

The socket owns the song start time and judges each key press against the note chart on its own clock, with the usual network allowance. The client sends key down only; the score is the socket's.

## Gear

None.

## Rewards

- Weekly boards per song and difficulty: a solo board and a team board. Dated badge for the first.
- Dance task tiers unlock new dance emotes (plus their badges); feat task proposal: a full combo on hard.

## Animations

The 4 free dances and the unlockable ones (loops), plus per-column dance moves and a "miss" stumble for the mini-game. Music: 3 original tracks.

## Failure cases

A dancer who leaves or disconnects stops scoring; the song goes on for the others. In team mode the team score keeps what was earned.

## Open points

- Number of unlockable dances and which tier unlocks which. The emote wheel is not built yet.

## Contract (built 2026-11-14)

Rules: `front/public/assets/sports/rules/dance.json` (status `ready`), read by the socket at boot (`loadDanceVenue`)
and by the coach panel. Its `venue` block (coach, play area, four dance spots) is written by
`front/scripts/apply-sports-dance.mjs` from the studio layout; the rest is hand-set.

| Value | Setting |
|---|---|
| Songs | `harbour_sway` 90 bpm, `cove_groove` 112 bpm, `night_sprint` 136 bpm, 90 s each |
| Charts | a note every 2 beats (easy), 1 beat (normal), half a beat (hard), from beat 4 to 2 beats before the end; lanes rolled from a seed of song id and difficulty, never the same lane three times in a row |
| Windows | perfect within 45 ms, good within 110 ms, measured from the press window `[arrival - 120 ms, arrival]` on the socket clock |
| Score | perfect 300, good 100, times `1 + min(combo, 40) / 40` (double from a 40 combo); a press with no note in reach breaks the combo; a second press on one lane within 80 ms is ignored |
| Team | every note hit by all active dancers adds 50 to the team score, once per note |
| Lead-in | the song starts 4 s after kick-off |
| Players | solo 1; team and duel 2 to 4; leaving the studio drops the dancer at once (no rejoin) |
| Results | solo and team: `finished` (team: team score), duel: `win` / `draw` / `loss` with `place`, a dancer who left: `dnf`. No coins. |

| Message | Direction | Payload |
|---|---|---|
| `dance_press` | client → server | `{ lane: 0..3 }` (left, down, up, right), from an active dancer only |
| `dance_start` | server → dancers and players in the studio | `{ venue, mode, song, difficulty, bpm, lengthMs, startAt, serverNow, notes: [t ms, lane][], dancers: [{ sessionId, name }] }` |
| `dance_judge` | server → same | `{ sessionId, index, lane, judgement: 'perfect' \| 'good' \| 'miss', score, combo, synced, teamScore: number \| null }` |
| `dance_stray` | server → the presser | `{ combo: 0 }` |
| `dance_end` | server → same | `{ venue, mode, teamScore, dancers: [{ sessionId, name, score, maxCombo, fullCombo, counts, result, place }] }` |

Build, from the repo root (Blender headless, scripts run with `exec(open(p).read(), {"__file__": p})`):
`map-src/CampusCove/build_sports_dance.py` (interior, then the exterior through `build_sports_dance_ext.py`),
`build_house_lightmaps.py -- work sports_dance`, `npm run assets:optimize -- work sports_dance`,
`build_sports_dance_site.py`, `npm run assets:optimize -- park sports_dance`, then `node scripts/apply-sports-dance.mjs`
from `front/` (idempotent: `COL_SportsDance_*` and `COL_Work_sports_dance` only, the `sports_dance` zone, the rules
`venue` block, the coach position and `zones/index.json`).

Dancers are moved to their spot at kick-off (`position_correction`, reason `dance_spot`) and cannot walk during the
song. Other players see them play the `Dance` clip at `bpm / 120` and `Stumble` on a miss. The music is synthesised
in the browser (`front/src/game/sports/danceMusic.ts`) on the song clock; it decides nothing. Since 2026-11-17 (the music started well after the notes on a fast song) it plays from one audio context kept for the whole session and each beat is scheduled at most 600 ms ahead from the wall clock (`dueBeats`): a slow start of the audio device or a stall drops the beats already past and the next ones stay on time, instead of the whole song sliding late.

During the song the view is third person, facing the dancer from the coach's side (see "Camera" in [README.md](README.md), decided 2026-11-15): with other dancers in the song the camera stops swaying, centres on the whole line and opens its field (up to 75°) until both ends fit, so everyone is in the picture; the dancer stays left of the note lanes and plays the same `Dance`, lane moves and `Stumble` as the others see. A dancer moved out of the studio by an admin teleport stays locked in the song until it ends (known, not fixed).

## Tasks and boards (built 2026-11-14)

Laravel owns the song, difficulty and mode lists (`DanceService::SONGS`, `DIFFICULTIES`, `MODES`); they must match
`signup.settings` of `rules/dance.json`. Badges only, never coins.

`POST /api/sports/dance/runs` (realtime), sent by the socket at the end of a song, once per match:

| Field | Type |
|---|---|
| `ref` | string 1-64, the match ref |
| `song` | `harbour_sway` \| `cove_groove` \| `night_sprint` |
| `difficulty` | `easy` \| `normal` \| `hard` |
| `mode` | `solo` (1 dancer) \| `team` (2-4) \| `duel` (2-4) |
| `endedAt` | int, epoch ms, at most 60 s ahead of the Laravel clock |
| `teamScore` | int 0-1,000,000 in team mode, `null` otherwise |
| `dancers` | 1 to 4 `{ accountId: int (distinct, existing), score: int 0-1,000,000, fullCombo: bool, finished: bool }` |

One `dance_runs` row per dancer, unique (ref, account); the team key is the sorted account ids of the run joined by
`-`; the week is the ISO week of `endedAt` in Europe/Paris. Reply `{ recorded: true }`, or `{ recorded: false }` when
the ref was already recorded (nothing changes). A bad field is a 422 (Laravel validation); a dancer count that does
not fit the mode is `dance_bad_dancer_count`, a team score outside team mode or missing in it `dance_bad_team_score`
(422 `{ code, message }`).

Tasks (badges only), counted per dancer only when the match counts for tasks: `sports_matches.counts_for_tasks`, set
by the core anti-farm rule (`docs/sports/CORE.md` § 4: 2 accounts of 72 h or more, at most 3 counted matches per pair
a day; a solo song never counts). The socket records the match before the dance run, so the flag is known.

| Task | Counts when | Tiers |
|---|---|---|
| `songs_danced` | the match counts, the dancer `finished` with `score > 0` | 10 / 50 / 200 |
| `full_combo_hard` | the match counts, `difficulty = hard`, `finished` and `fullCombo` | 1 / 10 / 50 |

The tiers of `songs_danced` unlock the dances `spin` (Bronze), `disco` (Silver) and `twist` (Gold) of the emote wheel.

Weekly boards are core boards (`SportsBoardService::BOARDS`, metric `score`): `dance_<song>_<difficulty>_solo` and
`dance_<song>_<difficulty>_team`, read from the match results (`GET /api/sports/boards/{board}`); in team mode every
dancer's result carries the team score. The core crowns the first of each board every week (`sports_champion` badge).
Duels are on no board.

## Proposed placeholder JSON fields

`sport` ("dance"), `freeEmotes` (4 ids), `unlockableEmotes` (ids with their task tier), `songs` ([{ id, bpm, lengthSec, charts: { easy, normal, hard } }]), `modes` (["solo", "team", "duel"]), `maxPlayers` (4), `windowsMs` ({ perfect, good }), `syncBonus`, `allowanceMs`, `gear` ([]), `coachId`, `boards` (per song × difficulty × solo/team), `tasks` (["songs_danced", "full_combo_hard"]).
