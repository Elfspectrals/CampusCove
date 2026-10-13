/** Fixed entry when joining an apartment instance (living room, just inside the entrance of CampusApartmentInterior.glb). */
export const APARTMENT_SPAWN = { x: 3.8, y: 1.6, z: -1.2 }

/** City spawn next to the SM_Thuja_81 tree in LobbyMap.glb; socket/server.js hardcodes the same values. */
export const CITY_SPAWN = { x: -89.6, y: 1.6, z: 22.4 }

/** Where you reappear in the city after exiting the apartment (forecourt of the Campus Cove building). Matches socket CITY_APARTMENT_EXIT. */
export const CITY_APARTMENT_EXIT = { x: -140, y: 1.6, z: 37.5 }

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

/** City building entrance — Press I at the front door of CampusApartmentExterior.glb (west of the Opera). */
export const CITY_BUILDING_DOOR_POS = { x: -140, z: 39.8 }
export const CITY_BUILDING_DOOR_RADIUS = 6

export const TRANSFORM_PERSIST_THROTTLE_MS = 150
export const TRANSFORM_EPSILON_POSITION = 0.01
export const TRANSFORM_EPSILON_ROTATION = 0.01
