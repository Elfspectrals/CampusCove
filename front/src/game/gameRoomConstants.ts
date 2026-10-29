/**
 * Networked positions are the camera (eye) position; avatar models have their feet at y = 0,
 * so remote avatars are placed EYE_HEIGHT below the received y.
 */
export const EYE_HEIGHT = 1.6

/** Ground speeds in m/s. Must match MAX_WALK_SPEED / MAX_SPRINT_SPEED in socket/src/movement.ts (minus their margin). */
export const WALK_SPEED = 5
export const SPRINT_SPEED = 8.5

/**
 * /game town spawn — on the plaza, facing the town hall (assets/town/town.layout.json "spawn").
 * Must match socket CITY_SPAWN / CITY_APARTMENT_EXIT.
 */
export const HOUSING_LOBBY_SPAWN = { x: 0, y: 1.6, z: 13 }

/** Vertical interior height (floor y=0 to ceiling); used by the placement physics walls. */
export const APARTMENT_ROOM_HEIGHT = 3

/** Wall / floor / ceiling slab thickness; used by the placement physics walls. */
export const APARTMENT_WALL_THICKNESS = 0.08

/** Exit door trigger — just inside Door_Entrance, centred on the front wall of every house interior. */
export const APARTMENT_DOOR_POS = { x: 0, z: 4.75 }

export const TRANSFORM_EPSILON_POSITION = 0.01
export const TRANSFORM_EPSILON_ROTATION = 0.01

/** The Salty Shamrock: mirrors of socket/src/pubConstants.ts (docs/PUB.md §5). */
export const SEAT_REACH = 2.5
export const COUNTER_REACH = 2.6
export const BARTENDER_REACH = 3.6
export const POUR_MS = 3000
export const SECRET_OPEN_MS = 20_000
export const RACE_MAX_PROGRESS_PER_S = 0.125
export const DARTS_MAX_OFFSET_CM = 25
export const INTOXICATION_MAX = 100
export const TIPSY_AT = 30
export const DRUNK_AT = 60
