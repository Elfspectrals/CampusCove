// Colyseus realtime server: a single 'city' room (town + house / work building interiors).
// Economy, ownership and inventory stay authoritative in the Laravel API (src/backend.js).
import { Server, WebSocketTransport } from 'colyseus'
import { CITY_MAX_PLAYERS, PORT } from './src/config.js'
import { CityRoom } from './src/CityRoom.js'

async function boot() {
  const gameServer = new Server({ transport: new WebSocketTransport() })
  gameServer.define('city', CityRoom)
  await gameServer.listen(PORT)
  console.log(`Colyseus server on port ${PORT} (city: ${CITY_MAX_PLAYERS} players)`)
}

boot().catch((error) => {
  console.error('[colyseus] fatal boot error', error)
  process.exit(1)
})
