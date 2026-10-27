// The town spawn and the building doors come from the front's world.manifest.json (src/world.js).

export const PORT = parseInt(process.env.PORT || '3000', 10)
export const CITY_MAX_PLAYERS = parseInt(process.env.CITY_MAX_PLAYERS || '30', 10)
export const BACKEND_API_URL = (process.env.BACKEND_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '')

// Players arriving at the same spawn would stand inside each other (and the camera inside a head),
// so each arrival lands on a random point of a small disc around the spawn.
export const CITY_SPAWN_RADIUS = 2
