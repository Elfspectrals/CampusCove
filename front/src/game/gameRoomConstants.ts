/**
 * Fixed entry when joining a house interior. Every interior (assets/houses/<key>/interior.glb) shares
 * one entrance convention: door on the front wall at z = +5, rooms extending towards -Z.
 * Must match socket APARTMENT_SPAWN.
 */
export const APARTMENT_SPAWN = { x: 0, y: 1.6, z: 3.7 }

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

/** Outer safety clamp around a house interior (walls collide via interior.collision.json). */
export const APARTMENT_HALF_EXTENT = 12

/** Vertical interior height (floor y=0 to ceiling); used by the placement physics walls. */
export const APARTMENT_ROOM_HEIGHT = 3

/** Wall / floor / ceiling slab thickness; used by the placement physics walls. */
export const APARTMENT_WALL_THICKNESS = 0.08
export const APARTMENT_CLAMP_MARGIN = 0.35
export const APARTMENT_DOOR_RADIUS = 1.4

/** Exit door trigger — just inside Door_Entrance, centred on the front wall of every house interior. */
export const APARTMENT_DOOR_POS = { x: 0, z: 4.75 }

/** Extra XZ reach beyond half unit size for housing interact prompts (unit position = the house door). */
export const HOUSING_CUBE_INTERACT_RADIUS_PAD = 1.4

export const TRANSFORM_EPSILON_POSITION = 0.01
export const TRANSFORM_EPSILON_ROTATION = 0.01
