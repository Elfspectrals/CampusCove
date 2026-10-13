/** Fixed entry when joining an apartment instance (living room, just inside the entrance of CampusApartmentInterior.glb). */
export const APARTMENT_SPAWN = { x: 3.8, y: 1.6, z: -1.2 }

/**
 * /game housing lobby spawn — in front of the MVP housing cubes (seeded around z=12..18).
 * Must match socket CITY_SPAWN / CITY_APARTMENT_EXIT.
 */
export const HOUSING_LOBBY_SPAWN = { x: 0, y: 1.6, z: 5 }

/** @deprecated Use HOUSING_LOBBY_SPAWN for /game. Kept for socket naming parity. */
export const CITY_SPAWN = HOUSING_LOBBY_SPAWN

/** Where you reappear in the housing lobby after exiting an apartment. */
export const CITY_APARTMENT_EXIT = HOUSING_LOBBY_SPAWN

/** /map-paris only — next to SM_Thuja_81 in LobbyMap.glb. */
export const PARIS_MAP_SPAWN = { x: -89.6, y: 1.6, z: 22.4 }

/** Outer safety clamp around the apartment (walls in the GLB collide; the interior spans x -9..5, z -6..6). */
export const APARTMENT_HALF_EXTENT = 12

/** Vertical interior height (floor y=0 to ceiling); must match `buildApartmentEnvironment`. */
export const APARTMENT_ROOM_HEIGHT = 3

/** Wall / floor / ceiling slab thickness; must match `buildApartmentEnvironment`. */
export const APARTMENT_WALL_THICKNESS = 0.08
export const APARTMENT_CLAMP_MARGIN = 0.35
export const APARTMENT_DOOR_RADIUS = 1.4

/** Exit door trigger — Door_Entrance on the east wall of CampusApartmentInterior.glb. */
export const APARTMENT_DOOR_POS = { x: 4.54, z: -2.74 }

/** Front door of the Campus Cove building (CampusApartmentExterior.glb) on the Paris map, west of the Opera. */
export const CITY_BUILDING_DOOR_POS = { x: -140, z: 39.8 }
export const CITY_BUILDING_DOOR_RADIUS = 6

/** Extra XZ reach beyond half cube size for housing interact prompts. */
export const HOUSING_CUBE_INTERACT_RADIUS_PAD = 1.4

export const TRANSFORM_PERSIST_THROTTLE_MS = 150
export const TRANSFORM_EPSILON_POSITION = 0.01
export const TRANSFORM_EPSILON_ROTATION = 0.01
