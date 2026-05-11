/** Fixed entry when joining an apartment instance (must match server sync via immediate `move`). */
export const APARTMENT_SPAWN = { x: 0, y: 1.6, z: 4 }

/** Inner half-size of the apartment box (player clamp margin applied in movement). */
export const APARTMENT_HALF_EXTENT = 5
export const APARTMENT_CLAMP_MARGIN = 0.35
export const APARTMENT_DOOR_RADIUS = 1.4
export const APARTMENT_DOOR_POS = { x: 0, z: APARTMENT_HALF_EXTENT - 0.45 }

export const CITY_BUILDING_DOOR_RADIUS = 2.2
export const CITY_BUILDING_DOOR_POS = { x: 0, z: 8 }

export const TRANSFORM_PERSIST_THROTTLE_MS = 150
export const TRANSFORM_EPSILON_POSITION = 0.01
export const TRANSFORM_EPSILON_ROTATION = 0.01
