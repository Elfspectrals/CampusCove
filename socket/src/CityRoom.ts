import { type Client, Room } from 'colyseus'
import { pickupObject, saveObject, setDecoratedHouse } from './apartments.ts'
import { type Json, callBackendJson, parseAccountId, resolveIdentity } from './backend.ts'
import { CITY_MAX_PLAYERS, CITY_SPAWN_RADIUS } from './config.ts'

const HOUSING_REFRESH_COOLDOWN_MS = 2000
const HOUSING_POLL_MS = 60_000
import {
  DOOR_RATTLE_COOLDOWN_MS,
  type DoorSound,
  hearsDoor,
  isWithinDoorReach,
  isWithinReach,
  lockChanges,
  workDoorId
} from './doors.ts'
import { moveRejection, onJump, spendSprintStamina } from './movement.ts'
import { onPunch } from './punch.ts'
import {
  createPlayer,
  normalizeAppearanceIds,
  normalizeBodyModelGlb,
  normalizeNumber,
  normalizeSlotHexes,
  publicPlayer,
  spawnNear
} from './players.ts'
import {
  SURVIVAL_TICK_MS,
  loadSurvival,
  onConsume,
  onClinicHeal,
  onCook,
  onDrinkFountain,
  onSurvivalMove,
  releaseClinicBed,
  saveSurvival,
  tickSurvival
} from './survival.ts'
import type {
  ClientPayload,
  ClinicBedOccupant,
  GameClient,
  GameRoom,
  HouseFurniture,
  HousingUnit,
  Identity,
  Player
} from './types.ts'
import { citySpawn, workDoor } from './world.ts'

function warn(context: string, error: unknown): void {
  console.warn(`[colyseus] ${context}:`, error instanceof Error ? error.message : error)
}

// One room for the whole world: the town and every building interior.
export class CityRoom extends Room implements GameRoom {
  players = new Map<string, Player>()
  sessionByAccountId = new Map<number, string>()
  housingUnits: HousingUnit[] = []
  houseFurniture: HouseFurniture[] = []
  openDoors = new Set<string>()
  clinicBeds = new Map<string, ClinicBedOccupant>()

  onCreate() {
    this.maxClients = CITY_MAX_PLAYERS

    this.onMessage('move', (client, payload: ClientPayload) => this.onMove(client, payload))
    this.onMessage('appearance', (client, payload: ClientPayload) => this.onAppearance(client, payload))
    this.onMessage('housing_refresh', (client) => this.onHousingRefresh(client))
    this.onMessage('door_toggle', (client, payload: ClientPayload) => this.onDoorToggle(client, payload))
    this.onMessage('door_rattle', (client, payload: ClientPayload) => this.onDoorRattle(client, payload))
    this.onMessage('decorate_house', (client, payload: ClientPayload) => setDecoratedHouse(this, client, payload))
    this.onMessage('apartment_spawn_request', (client, payload: ClientPayload) => saveObject(this, client, payload, true))
    this.onMessage('apartment_transform_request', (client, payload: ClientPayload) => saveObject(this, client, payload, false))
    this.onMessage('apartment_pickup_request', (client, payload: ClientPayload) => pickupObject(this, client, payload))
    this.onMessage('consume', (client, payload: ClientPayload) => void onConsume(this, client, payload))
    this.onMessage('drink_fountain', (client) => onDrinkFountain(this, client))
    this.onMessage('cook', (client, payload: ClientPayload) => void onCook(this, client, payload))
    this.onMessage('clinic_heal', (client) => void onClinicHeal(this, client))
    this.onMessage('jump', (client) => onJump(this.players.get(client.sessionId), Date.now()))
    this.onMessage('punch', (client, payload: ClientPayload) => onPunch(this, client, payload))
    this.clock.setInterval(() => void this.pollHousingUnits(), HOUSING_POLL_MS)
    this.clock.setInterval(() => tickSurvival(this, SURVIVAL_TICK_MS / 1000), SURVIVAL_TICK_MS)
  }

  async onAuth(_client: Client, options: Json): Promise<Identity> {
    try {
      return await resolveIdentity(options)
    } catch (err) {
      warn('onAuth failed', err)
      throw err
    }
  }

  async onJoin(client: Client, options: Json) {
    const accountId = parseAccountId(client.auth?.accountId)
    if (accountId === null) throw new Error('invalid account id')
    // One session per account: a new tab replaces the old one.
    const staleSessionId = this.sessionByAccountId.get(accountId)
    if (staleSessionId && staleSessionId !== client.sessionId) {
      this.clients.find((c) => c.sessionId === staleSessionId)?.leave(4001, 'duplicate session')
      const stale = this.players.get(staleSessionId)
      this.players.delete(staleSessionId)
      // saved before this session loads them
      if (stale) await saveSurvival(stale)
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
      users: this.otherPlayers(client),
      housingUnits: this.housingUnits,
      houseFurniture: this.houseFurniture,
      openDoors: [...this.openDoors]
    })
    this.forEachClient((c) => c.send('user_joined', publicPlayer(player)), client)
    if (player.token) await loadSurvival(client, player)
  }

  onLeave(client: Client) {
    const player = this.players.get(client.sessionId)
    this.players.delete(client.sessionId)
    if (!player) return
    releaseClinicBed(this, player)
    void saveSurvival(player)
    if (this.sessionByAccountId.get(player.accountId) === client.sessionId) {
      this.sessionByAccountId.delete(player.accountId)
    }
    this.broadcast('user_left', { sessionId: client.sessionId }, { except: client })
  }

  // ------------------------------------------------------------ visibility

  forEachClient(callback: (client: Client) => void, exceptClient?: GameClient): void {
    for (const c of this.clients) {
      if (exceptClient && c.sessionId === exceptClient.sessionId) continue
      if (this.players.has(c.sessionId)) callback(c)
    }
  }

  otherPlayers(client: GameClient) {
    return [...this.players.values()].filter((u) => u.sessionId !== client.sessionId).map(publicPlayer)
  }

  // ------------------------------------------------------------ presence

  onMove(client: Client, payload: ClientPayload): void {
    const player = this.players.get(client.sessionId)
    if (!player || !payload || typeof payload !== 'object') return
    const x = normalizeNumber(payload.x, player.x)
    const z = normalizeNumber(payload.z, player.z)
    const now = Date.now()
    const sprinting = payload.sprint === true
    if (moveRejection(this, player, x, z, now, sprinting) !== null) {
      client.send('position_correction', { x: player.x, y: player.y, z: player.z })
      return
    }
    const previousY = player.y
    const distXZ = Math.hypot(x - player.x, z - player.z)
    player.x = x
    player.y = normalizeNumber(payload.y, player.y)
    player.z = z
    player.ry = normalizeNumber(payload.ry, player.ry)
    if (sprinting && distXZ > 0) spendSprintStamina(player, now - player.lastMoveAt, now)
    player.lastMoveAt = now
    this.broadcastMove(client, player)
    onSurvivalMove(this, client, player, previousY, distXZ)
  }

  broadcastMove(client: GameClient, player: Player): void {
    const { x, y, z, ry } = player
    this.forEachClient((c) => c.send('user_moved', { sessionId: client.sessionId, x, y, z, ry }), client)
  }

  onAppearance(client: Client, payload: ClientPayload): void {
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
    this.forEachClient((c) => c.send('appearance_updated', {
      sessionId: client.sessionId,
      appearance: { ...appearance },
      slotHexes: { ...slotHexes },
      bodyModelGlb
    }))
  }

  // ------------------------------------------------------------ housing

  async fetchHousingUnits(token: string): Promise<void> {
    const data = await callBackendJson(token, '/housing/units', 'GET')
    const previous = new Map(this.housingUnits.map((u) => [u.public_id, u]))
    this.housingUnits = Array.isArray(data?.units) ? data.units : []
    for (const { unit, sound } of lockChanges([...previous.values()], this.housingUnits)) this.sendHouseDoorSound(unit, sound)
    const justLocked = this.housingUnits.filter((u) => u.door_locked === true && previous.get(u.public_id)?.door_locked !== true)
    for (const unitId of this.openDoors) {
      if (unitId.startsWith(workDoorId(''))) continue
      const unit = this.housingUnits.find((u) => u.public_id === unitId)
      if (!unit || unit.status !== 'occupied' || justLocked.includes(unit)) this.openDoors.delete(unitId)
    }
  }

  async pollHousingUnits(): Promise<void> {
    const token = [...this.players.values()].find((p) => p.token)?.token
    if (!token) return
    try {
      const before = JSON.stringify(this.housingUnits)
      await this.fetchHousingUnits(token)
      if (JSON.stringify(this.housingUnits) === before) return
      const payload = { units: this.housingUnits }
      this.forEachClient((c) => c.send('housing_units_sync', payload))
      this.broadcastDoors()
    } catch (error) {
      warn('housing poll failed', error)
    }
  }

  async fetchHouseFurniture(token: string): Promise<void> {
    const data = await callBackendJson(token, '/apartments/houses', 'GET')
    this.houseFurniture = Array.isArray(data?.houses) ? data.houses : []
  }

  async refreshHouseFurniture(token: string): Promise<void> {
    try {
      await this.fetchHouseFurniture(token)
      const payload = { houses: this.houseFurniture }
      this.forEachClient((c) => c.send('house_furniture_sync', payload))
    } catch (error) {
      warn('house furniture refresh failed', error)
    }
  }

  // A player bought / rented / renewed: reload the units and push them to everyone in the town.
  async onHousingRefresh(client: Client): Promise<void> {
    const player = this.players.get(client.sessionId)
    if (!player?.token) return
    const now = Date.now()
    if (now - player.lastHousingRefreshAt < HOUSING_REFRESH_COOLDOWN_MS) return
    player.lastHousingRefreshAt = now
    try {
      await this.fetchHousingUnits(player.token)
      const payload = { units: this.housingUnits }
      this.forEachClient((c) => c.send('housing_units_sync', payload))
      this.broadcastDoors()
    } catch (error) {
      warn('housing_refresh failed', error)
    }
    await this.refreshHouseFurniture(player.token)
  }

  broadcastDoors(): void {
    const payload = { openDoors: [...this.openDoors] }
    this.forEachClient((c) => c.send('doors_sync', payload))
  }

  onDoorToggle(client: Client, payload: ClientPayload): void {
    const player = this.players.get(client.sessionId)
    if (typeof payload?.workKey === 'string') {
      const door = workDoor(payload.workKey)
      if (!player || !door || !isWithinReach(player, door.x, door.z)) return
      const open = this.toggleDoor(workDoorId(payload.workKey))
      this.sendDoorSound(payload.workKey, door.x, door.z, open ? 'open' : 'close')
      return
    }
    const unit = this.housingUnits.find((u) => u.public_id === payload?.unitId && u.status === 'occupied')
    if (!player || !unit || !isWithinDoorReach(player, unit)) return
    if (unit.door_locked) {
      client.send('door_error', { message: 'This door is locked.' })
      return
    }
    const open = this.toggleDoor(unit.public_id)
    this.sendHouseDoorSound(unit, open ? 'open' : 'close')
  }

  // Someone tries the handle of a locked door: nearby players hear (and see) it rattle.
  onDoorRattle(client: Client, payload: ClientPayload): void {
    const player = this.players.get(client.sessionId)
    const unit = this.housingUnits.find((u) => u.public_id === payload?.unitId && u.status === 'occupied')
    if (!player || !unit?.door_locked || !isWithinDoorReach(player, unit)) return
    const now = Date.now()
    if (now - player.lastDoorRattleAt < DOOR_RATTLE_COOLDOWN_MS) return
    player.lastDoorRattleAt = now
    this.sendHouseDoorSound(unit, 'rattle')
  }

  /** Returns whether the door is now open. */
  toggleDoor(doorId: string): boolean {
    const open = !this.openDoors.has(doorId)
    if (open) this.openDoors.add(doorId)
    else this.openDoors.delete(doorId)
    this.broadcastDoors()
    return open
  }

  sendHouseDoorSound(unit: HousingUnit, sound: DoorSound): void {
    if (unit.model_key) this.sendDoorSound(unit.model_key, unit.pos_x, unit.pos_z, sound)
  }

  /** `door` is the building key (house model key or work key): the client plays the sound on that building's door. */
  sendDoorSound(door: string, x: number, z: number, sound: DoorSound): void {
    const payload = { door, sound }
    this.forEachClient((c) => {
      const listener = this.players.get(c.sessionId)
      if (listener && hearsDoor(listener, x, z)) c.send('door_sound', payload)
    })
  }
}
