import { Room } from 'colyseus'
import { exitBuilding, pickupObject, saveObject, sendInventory, setDecoratedHouse } from './apartments.js'
import { callBackendJson, parseAccountId, resolveIdentity } from './backend.js'
import { CITY_MAX_PLAYERS, CITY_SPAWN_RADIUS } from './config.js'

const HOUSING_REFRESH_COOLDOWN_MS = 2000
const HOUSING_POLL_MS = 60_000
import { isWithinDoorReach, isWithinReach, workDoorId } from './doors.js'
import { moveRejection } from './movement.js'
import {
  createPlayer,
  normalizeAppearanceIds,
  normalizeBodyModelGlb,
  normalizeNumber,
  normalizeSlotHexes,
  publicPlayer,
  spawnNear,
  visibilityKey
} from './players.js'
import { citySpawn, workDoor } from './world.js'

function warn(context, error) {
  console.warn(`[colyseus] ${context}:`, error instanceof Error ? error.message : error)
}

// The town and every interior share one room: zones only decide who sees whom.
export class CityRoom extends Room {
  onCreate() {
    this.maxClients = CITY_MAX_PLAYERS
    this.players = new Map()
    this.sessionByAccountId = new Map()
    this.housingUnits = []
    this.houseFurniture = []
    this.openDoors = new Set()

    this.onMessage('move', (client, payload) => this.onMove(client, payload))
    this.onMessage('appearance', (client, payload) => this.onAppearance(client, payload))
    this.onMessage('housing_refresh', (client) => this.onHousingRefresh(client))
    this.onMessage('door_toggle', (client, payload) => this.onDoorToggle(client, payload))
    this.onMessage('exit_apartment', (client) => exitBuilding(this, client))
    this.onMessage('decorate_house', (client, payload) => setDecoratedHouse(this, client, payload))
    this.onMessage('apartment_spawn_request', (client, payload) => saveObject(this, client, payload, true))
    this.onMessage('apartment_transform_request', (client, payload) => saveObject(this, client, payload, false))
    this.onMessage('apartment_pickup_request', (client, payload) => pickupObject(this, client, payload))
    this.onMessage('apartment_inventory_request', (client) => sendInventory(this, client))
    this.clock.setInterval(() => void this.pollHousingUnits(), HOUSING_POLL_MS)
  }

  async onAuth(_client, options) {
    try {
      return await resolveIdentity(options)
    } catch (err) {
      warn('onAuth failed', err)
      throw err
    }
  }

  async onJoin(client, options) {
    const accountId = parseAccountId(client.auth?.accountId)
    if (accountId === null) throw new Error('invalid account id')
    // One session per account: a new tab replaces the old one.
    const staleSessionId = this.sessionByAccountId.get(accountId)
    if (staleSessionId && staleSessionId !== client.sessionId) {
      this.clients.find((c) => c.sessionId === staleSessionId)?.leave(4001, 'duplicate session')
      this.players.delete(staleSessionId)
    }
    const player = createPlayer(client, options, this.players.size, spawnNear(citySpawn(), CITY_SPAWN_RADIUS))
    this.players.set(client.sessionId, player)
    this.sessionByAccountId.set(accountId, client.sessionId)
    if (player.token) {
      await this.fetchHousingUnits(player.token).catch((error) => warn('fetchHousingUnits on join failed', error))
      await this.fetchHouseFurniture(player.token).catch((error) => warn('fetchHouseFurniture on join failed', error))
    }
    client.send('init', {
      me: publicPlayer(player),
      users: this.visiblePlayersFor(player, client),
      housingUnits: this.housingUnits,
      houseFurniture: this.houseFurniture,
      openDoors: [...this.openDoors]
    })
    this.forEachVisibleClient(player, (c) => c.send('user_joined', publicPlayer(player)), client)
  }

  onLeave(client) {
    const player = this.players.get(client.sessionId)
    this.players.delete(client.sessionId)
    if (!player) return
    if (this.sessionByAccountId.get(player.accountId) === client.sessionId) {
      this.sessionByAccountId.delete(player.accountId)
    }
    this.broadcast('user_left', { sessionId: client.sessionId }, { except: client })
  }

  // ------------------------------------------------------------ visibility

  forEachVisibleClient(origin, callback, exceptClient) {
    const key = visibilityKey(origin)
    for (const c of this.clients) {
      if (exceptClient && c.sessionId === exceptClient.sessionId) continue
      const target = this.players.get(c.sessionId)
      if (target && visibilityKey(target) === key) callback(c, target)
    }
  }

  visiblePlayersFor(player, client) {
    const key = visibilityKey(player)
    return [...this.players.values()]
      .filter((u) => u.sessionId !== client.sessionId && visibilityKey(u) === key)
      .map(publicPlayer)
  }

  // Zone changes are announced as leave/join so every client keeps an accurate list of visible players:
  // viewers of the old zone drop the mover, viewers of the new zone spawn them, and the mover gets the
  // players already there. `change` updates the player (and may message the mover) in between.
  moveToZone(client, player, change) {
    this.forEachVisibleClient(player, (c) => c.send('user_left', { sessionId: client.sessionId }), client)
    change()
    player.lastMoveAt = Date.now()
    client.send('user_zone_changed', {
      sessionId: client.sessionId,
      zone: player.zone,
      apartmentOwnerId: player.apartmentOwnerId,
      workKey: player.workKey,
      x: player.x,
      y: player.y,
      z: player.z
    })
    this.forEachVisibleClient(player, (c) => c.send('user_joined', publicPlayer(player)), client)
    client.send('zone_users', { users: this.visiblePlayersFor(player, client) })
  }

  // ------------------------------------------------------------ presence

  onMove(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player || !payload || typeof payload !== 'object') return
    const x = normalizeNumber(payload.x, player.x)
    const z = normalizeNumber(payload.z, player.z)
    const now = Date.now()
    if (player.zone === 'city' && moveRejection(this, player, x, z, now) !== null) {
      client.send('position_correction', { x: player.x, y: player.y, z: player.z })
      return
    }
    player.x = x
    player.y = normalizeNumber(payload.y, player.y)
    player.z = z
    player.ry = normalizeNumber(payload.ry, player.ry)
    player.lastMoveAt = now
    this.broadcastMove(client, player)
  }

  broadcastMove(client, player) {
    const { x, y, z, ry } = player
    this.forEachVisibleClient(player, (c) => c.send('user_moved', { sessionId: client.sessionId, x, y, z, ry }), client)
  }

  onAppearance(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player || !payload || typeof payload !== 'object') return
    const appearance = normalizeAppearanceIds(payload.slots ?? payload)
    const slotHexes = normalizeSlotHexes(payload.slotHexes ?? {})
    const bodyModelGlb = normalizeBodyModelGlb(payload.bodyModelGlb)
    // every broadcast makes each client rebuild this avatar's model: skip no-op updates
    const unchanged = JSON.stringify([appearance, slotHexes, bodyModelGlb]) ===
      JSON.stringify([player.appearance, player.slotHexes, player.bodyModelGlb])
    if (unchanged) return
    Object.assign(player, { appearance, slotHexes, bodyModelGlb })
    this.forEachVisibleClient(player, (c) => c.send('appearance_updated', {
      sessionId: client.sessionId,
      appearance: { ...appearance },
      slotHexes: { ...slotHexes },
      bodyModelGlb
    }))
  }

  // ------------------------------------------------------------ housing

  async fetchHousingUnits(token) {
    const data = await callBackendJson(token, '/housing/units', 'GET')
    const previous = new Map(this.housingUnits.map((u) => [u.public_id, u]))
    this.housingUnits = Array.isArray(data?.units) ? data.units : []
    const justLocked = this.housingUnits.filter((u) => u.door_locked === true && previous.get(u.public_id)?.door_locked !== true)
    for (const unitId of this.openDoors) {
      if (unitId.startsWith(workDoorId(''))) continue
      const unit = this.housingUnits.find((u) => u.public_id === unitId)
      if (!unit || unit.status !== 'occupied' || justLocked.includes(unit)) this.openDoors.delete(unitId)
    }
  }

  async pollHousingUnits() {
    const token = [...this.players.values()].find((p) => p.token)?.token
    if (!token) return
    try {
      const before = JSON.stringify(this.housingUnits)
      await this.fetchHousingUnits(token)
      if (JSON.stringify(this.housingUnits) === before) return
      const payload = { units: this.housingUnits }
      this.forEachVisibleClient({ zone: 'city' }, (c) => c.send('housing_units_sync', payload))
      this.broadcastDoors()
    } catch (error) {
      warn('housing poll failed', error)
    }
  }

  async fetchHouseFurniture(token) {
    const data = await callBackendJson(token, '/apartments/houses', 'GET')
    this.houseFurniture = Array.isArray(data?.houses) ? data.houses : []
  }

  async refreshHouseFurniture(token) {
    try {
      await this.fetchHouseFurniture(token)
      const payload = { houses: this.houseFurniture }
      this.forEachVisibleClient({ zone: 'city' }, (c) => c.send('house_furniture_sync', payload))
    } catch (error) {
      warn('house furniture refresh failed', error)
    }
  }

  // A player bought / rented / renewed: reload the units and push them to everyone in the town.
  async onHousingRefresh(client) {
    const player = this.players.get(client.sessionId)
    if (!player?.token) return
    const now = Date.now()
    if (now - player.lastHousingRefreshAt < HOUSING_REFRESH_COOLDOWN_MS) return
    player.lastHousingRefreshAt = now
    try {
      await this.fetchHousingUnits(player.token)
      const payload = { units: this.housingUnits }
      this.forEachVisibleClient({ zone: 'city' }, (c) => c.send('housing_units_sync', payload))
      this.broadcastDoors()
    } catch (error) {
      warn('housing_refresh failed', error)
    }
    await this.refreshHouseFurniture(player.token)
  }

  broadcastDoors() {
    const payload = { openDoors: [...this.openDoors] }
    this.forEachVisibleClient({ zone: 'city' }, (c) => c.send('doors_sync', payload))
  }

  onDoorToggle(client, payload) {
    const player = this.players.get(client.sessionId)
    if (typeof payload?.workKey === 'string') {
      const door = workDoor(payload.workKey)
      if (!player || player.zone !== 'city' || !door || !isWithinReach(player, door.x, door.z)) return
      this.toggleDoor(workDoorId(payload.workKey))
      return
    }
    const unit = this.housingUnits.find((u) => u.public_id === payload?.unitId && u.status === 'occupied')
    if (!player || !unit || !isWithinDoorReach(player, unit)) return
    if (unit.door_locked) {
      client.send('door_error', { message: 'This door is locked.' })
      return
    }
    this.toggleDoor(unit.public_id)
  }

  toggleDoor(doorId) {
    if (this.openDoors.has(doorId)) this.openDoors.delete(doorId)
    else this.openDoors.add(doorId)
    this.broadcastDoors()
  }
}
