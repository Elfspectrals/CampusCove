/**
 * Networked positions are the camera (eye) position; avatar models have their feet at y = 0,
 * so remote avatars are placed EYE_HEIGHT below the received y.
 */
export const EYE_HEIGHT = 1.6

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
