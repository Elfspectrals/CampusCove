export const SEAT_REACH = 2.5
export const COUNTER_REACH = 2.6
export const BARTENDER_REACH = 3.6
export const BOUNCER_REACH = 2.6
export const POUR_MS = 3000
/** One phrase per week, cycled in order; add more to rotate (the front must not hard-code it). */
export const SECRET_PHRASES: readonly string[] = ['paris wiener']
/** Monday 2024-01-01 00:00 UTC: week 0 of the rotation. */
export const SECRET_PHRASE_EPOCH_MS = Date.UTC(2024, 0, 1)
export const WEEK_MS = 7 * 24 * 3600 * 1000
/** Feet this far below the ground floor, inside the basement box, count as being in the basement. */
export const BASEMENT_DEPTH_MARGIN = 1.0
export const BOUNCER_PUSHBACK = 1.0
export const BOUNCER_BLOCK_COOLDOWN_MS = 2000
export const BOUNCER_BLOCK_LINE = 'Not without the word, pal.'
export const SECRET_OPEN_MS = 20_000

export const INTOXICATION_MAX = 100
export const HANGOVER_INTOXICATION = 30
export const INTOXICATION_DECAY_PER_S = 1 / 6

export const RACE_LOBBY_MS = 5000
export const RACE_TIMEOUT_MS = 45_000
export const RACE_MAX_PROGRESS_PER_S = 0.125
export const RACE_PROGRESS_MIN_INTERVAL_MS = 200

export const SHOTS_MIN_MS = 1500

export const DARTS_LOBBY_MS = 8000
export const DARTS_TURN_MS = 20_000
export const DARTS_MAX_PLAYERS = 4
export const DARTS_THROWS = 3
export const DARTS_MAX_OFFSET_CM = 25
