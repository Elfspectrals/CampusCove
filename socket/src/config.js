// Spawn points and building doors. They mirror front/src/game/gameRoomConstants.ts and
// front/public/assets/town/town.layout.json: change both sides together.

export const PORT = parseInt(process.env.PORT || '3000', 10)
export const CITY_MAX_PLAYERS = parseInt(process.env.CITY_MAX_PLAYERS || '30', 10)
export const BACKEND_API_URL = (process.env.BACKEND_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '')

// HOUSING_LOBBY_SPAWN: town plaza, facing the town hall. Also where you land after leaving a house.
export const CITY_SPAWN = { x: 0, y: 1.6, z: 13 }
// APARTMENT_SPAWN: just inside the door of every house / work building interior.
export const APARTMENT_SPAWN = { x: 0, y: 1.6, z: 3.7 }

// Players arriving at the same spawn would stand inside each other (and the camera inside a head),
// so each arrival lands on a random point of a small disc around the spawn.
export const CITY_SPAWN_RADIUS = 2
// house interiors are small: stay close to the door
export const APARTMENT_SPAWN_RADIUS = 0.6
export const WORK_EXIT_RADIUS = 0.6

// Business-district buildings (free to enter, no DB row). door = world XZ in front of each door
// (`work[].door` in town.layout.json); leaving a building puts you back there.
export const WORK_DOORS = {
  tech_hub: { x: -20, z: 53.4 },
  boutique: { x: 0, z: 53.2 },
  cafe: { x: 20, z: 51.6 }
}

// Template used by the backend when a house is entered without one.
export const DEFAULT_TEMPLATE_KEY = 'starter_loft'
