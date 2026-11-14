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

Note highway, judgement ("Perfect", "Good", "Miss"), combo, score; in team mode the sync bonus; in duel mode the other dancers' scores.

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

- Number of unlockable dances and which tier unlocks which.
- Timing windows for perfect and good.

## Proposed placeholder JSON fields

`sport` ("dance"), `freeEmotes` (4 ids), `unlockableEmotes` (ids with their task tier), `songs` ([{ id, bpm, lengthSec, charts: { easy, normal, hard } }]), `modes` (["solo", "team", "duel"]), `maxPlayers` (4), `windowsMs` ({ perfect, good }), `syncBonus`, `allowanceMs`, `gear` ([]), `coachId`, `boards` (per song × difficulty × solo/team), `tasks` (["songs_danced", "full_combo_hard"]).
