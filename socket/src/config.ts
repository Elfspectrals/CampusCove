// The town spawn and the building doors come from the front's world.manifest.json (src/world.ts).

export const PORT = parseInt(process.env.PORT || '3000', 10)
export const CITY_MAX_PLAYERS = parseInt(process.env.CITY_MAX_PLAYERS || '30', 10)
export const BACKEND_API_URL = (process.env.BACKEND_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '')

// Players arriving at the same spawn would stand inside each other (and the camera inside a head),
// so each arrival lands on a random point of a small disc around the spawn.
export const CITY_SPAWN_RADIUS = 2

// Sent as X-Realtime-Secret on the API routes only this server may call (survival stats).
export const REALTIME_SHARED_SECRET = process.env.REALTIME_SHARED_SECRET || ''
export const CLOUDFLARE_ORIGIN_SECRET = process.env.CLOUDFLARE_ORIGIN_SECRET || ''
export const CLOUDFLARE_ENFORCE_ORIGIN = process.env.CLOUDFLARE_ENFORCE_ORIGIN === 'true'
if (CLOUDFLARE_ENFORCE_ORIGIN && !CLOUDFLARE_ORIGIN_SECRET) {
  throw new Error('CLOUDFLARE_ENFORCE_ORIGIN is on but CLOUDFLARE_ORIGIN_SECRET is empty')
}
// >1 makes hunger and thirst drop faster, for playtests (never in production).
export const SURVIVAL_TIME_SCALE = Math.max(1, parseFloat(process.env.SURVIVAL_TIME_SCALE || '1') || 1)

export interface LiveKitConfig {
  url: string
  apiUrl: string
  apiKey: string
  apiSecret: string
}

const LIVEKIT_VARS = [process.env.LIVEKIT_URL, process.env.LIVEKIT_API_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET]
if (LIVEKIT_VARS.some(Boolean) && !LIVEKIT_VARS.every(Boolean)) {
  throw new Error('Set LIVEKIT_URL, LIVEKIT_API_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET together, or none of them to turn proximity voice off')
}
export const LIVEKIT: LiveKitConfig | null = LIVEKIT_VARS.every(Boolean)
  ? { url: process.env.LIVEKIT_URL!, apiUrl: process.env.LIVEKIT_API_URL!, apiKey: process.env.LIVEKIT_API_KEY!, apiSecret: process.env.LIVEKIT_API_SECRET! }
  : null
