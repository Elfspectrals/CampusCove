// Colyseus realtime server: a single 'city' room (town + house / work building interiors).
// Economy, ownership and inventory stay authoritative in the Laravel API (src/backend.js).
import { Server, WebSocketTransport } from 'colyseus'
import { CITY_MAX_PLAYERS, LIVEKIT, PORT } from './src/config.ts'
import { CityRoom } from './src/CityRoom.ts'
import { internalRoutes } from './src/internal.ts'
import { assertVenueZones } from './src/sports/index.ts'
import { loadAtms, loadMarketStalls, loadSportsPassDesk, loadWorld, loadZoneBuyers } from './src/world.ts'

async function boot() {
  await loadWorld()
  await loadZoneBuyers()
  await loadAtms()
  await loadMarketStalls()
  await loadSportsPassDesk()
  assertVenueZones()
  const gameServer = new Server({ transport: new WebSocketTransport() })
  gameServer.define('city', CityRoom)
  // extended with Colyseus' own matchmaking routes when it listens
  gameServer.router = internalRoutes
  await gameServer.listen(PORT)
  console.log(`Colyseus server on port ${PORT} (city: ${CITY_MAX_PLAYERS} players)`)
  console.log(LIVEKIT ? `[voice] proximity voice through ${LIVEKIT.url}` : '[voice] LIVEKIT_* not set: proximity voice is off')
}

boot().catch((error) => {
  console.error('[colyseus] fatal boot error', error)
  process.exit(1)
})
