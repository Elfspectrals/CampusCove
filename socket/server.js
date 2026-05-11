import { Room, Server, WebSocketTransport } from 'colyseus'

const COLORS = [
  0xe94560, 0x0f3460, 0x533483, 0x00d9ff, 0x00ff88,
  0xffaa00, 0xff3366, 0x9d4edd, 0x06ffa5, 0xff6b35
]

const SLOTS = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']
const CITY_MAX_PLAYERS = parseInt(process.env.CITY_MAX_PLAYERS || '30', 10)
const BACKEND_API_URL = (process.env.BACKEND_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '')

const DEFAULT_SLOT_HEX = {
  body: '#8B7AA8',
  hair: '#6B5B95',
  top: '#9B8ABF',
  bottom: '#5A4E72',
  shoes: '#4A3F62',
  head_accessory: '#7A6B94'
}

function getColor(index) {
  return COLORS[index % COLORS.length]
}

function normalizeAppearanceIds(raw) {
  const out = {}
  for (const s of SLOTS) {
    const v = raw && Object.prototype.hasOwnProperty.call(raw, s) ? raw[s] : null
    out[s] = typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  return out
}

function normalizeSlotHexes(raw) {
  const out = {}
  for (const s of SLOTS) {
    const v = raw && Object.prototype.hasOwnProperty.call(raw, s) ? raw[s] : null
    out[s] = typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : DEFAULT_SLOT_HEX[s]
  }
  return out
}

function normalizeBodyModelGlb(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeNumber(raw, fallback) {
  if (typeof raw !== 'number') return fallback
  return Number.isFinite(raw) ? raw : fallback
}

function parseAccountId(raw) {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return parseInt(raw, 10)
  return null
}

async function resolveIdentity(options) {
  const fallbackId = parseAccountId(options?.userId ?? options?.accountId)
  const fallbackPseudo = typeof options?.pseudo === 'string' && options.pseudo.trim().length > 0
    ? options.pseudo.trim()
    : null
  const token = typeof options?.token === 'string' ? options.token.trim() : ''
  if (!token) {
    if (fallbackId === null) throw new Error('missing auth token and fallback account id')
    return { accountId: fallbackId, pseudo: fallbackPseudo ?? `User_${fallbackId}`, token: null }
  }
  try {
    const res = await fetch(`${BACKEND_API_URL}/user`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
    })
    if (!res.ok) {
      throw new Error(`auth failed (${res.status})`)
    }
    const data = await res.json()
    const accountId = parseAccountId(data?.user?.account_id)
    if (accountId === null) throw new Error('invalid account id in auth payload')
    const pseudo = typeof data?.user?.display_name === 'string' && data.user.display_name.trim().length > 0
      ? data.user.display_name.trim()
      : typeof data?.user?.username === 'string' && data.user.username.trim().length > 0
        ? data.user.username.trim()
        : fallbackPseudo ?? `User_${accountId}`
    return { accountId, pseudo, token }
  } catch (error) {
    if (fallbackId === null) throw error
    return { accountId: fallbackId, pseudo: fallbackPseudo ?? `User_${fallbackId}`, token }
  }
}

async function callBackendJson(token, path, method = 'POST', body = null) {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('missing auth token')
  }
  const res = await fetch(`${BACKEND_API_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: body !== null ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = typeof data?.message === 'string' ? data.message : `backend error ${res.status}`
    const code = typeof data?.code === 'string' ? data.code : 'backend_error'
    const err = new Error(message)
    err.code = code
    throw err
  }
  return data
}

class PresenceRoom extends Room {
  onCreate(options) {
    this.maxClients = options?.maxPlayers || CITY_MAX_PLAYERS
    this.players = new Map()
    this.byAccountId = new Map()
    this.apartmentCacheByOwner = new Map()
    this.inventoryCacheByAccount = new Map()
    this.onMessage('move', (client, payload) => this.onMove(client, payload))
    this.onMessage('appearance', (client, payload) => this.onAppearance(client, payload))
    this.onMessage('enter_apartment', async (client, payload) => this.onEnterApartment(client, payload))
    this.onMessage('exit_apartment', (client) => this.onExitApartment(client))
    this.onMessage('decorate_upsert', async (client, payload) => this.onDecorateUpsert(client, payload))
    this.onMessage('decorate_remove', async (client, payload) => this.onDecorateRemove(client, payload))
    this.onMessage('apartment_spawn_request', async (client, payload) => this.onApartmentSpawnRequest(client, payload))
    this.onMessage('apartment_transform_request', async (client, payload) => this.onApartmentTransformRequest(client, payload))
    this.onMessage('apartment_pickup_request', async (client, payload) => this.onApartmentPickupRequest(client, payload))
    this.onMessage('apartment_inventory_request', async (client) => this.onApartmentInventoryRequest(client))
  }

  async onAuth(_client, options) {
    try {
      return await resolveIdentity(options)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[colyseus] onAuth failed:', msg)
      throw err
    }
  }

  buildPlayer(client, options) {
    const accountId = client?.auth?.accountId
    const pseudo = client?.auth?.pseudo
    const appearance = normalizeAppearanceIds(options?.appearance)
    const slotHexes = normalizeSlotHexes(options?.slotHexes)
    const bodyModelGlb = normalizeBodyModelGlb(options?.bodyModelGlb)
    return {
      sessionId: client.sessionId,
      accountId,
      pseudo,
      color: getColor(this.players.size),
      x: 0,
      y: 1.6,
      z: 0,
      zone: 'city',
      apartmentOwnerId: null,
      apartmentTemplateKey: null,
      token: client?.auth?.token ?? null,
      appearance,
      slotHexes,
      bodyModelGlb
    }
  }

  publicPlayer(player) {
    return {
      sessionId: player.sessionId,
      id: String(player.accountId),
      pseudo: player.pseudo,
      color: player.color,
      x: player.x,
      y: player.y,
      z: player.z,
      zone: player.zone,
      apartmentOwnerId: player.apartmentOwnerId,
      appearance: { ...player.appearance },
      slotHexes: { ...player.slotHexes },
      bodyModelGlb: player.bodyModelGlb
    }
  }

  visibilityKey(player) {
    if (player.zone === 'apartment') {
      return `apartment:${player.apartmentOwnerId ?? 0}`
    }
    return 'city'
  }

  arePlayersVisible(a, b) {
    return this.visibilityKey(a) === this.visibilityKey(b)
  }

  forEachVisibleClient(originPlayer, callback, exceptClient) {
    for (const c of this.clients) {
      if (exceptClient && c.sessionId === exceptClient.sessionId) continue
      const target = this.players.get(c.sessionId)
      if (!target) continue
      if (!this.arePlayersVisible(originPlayer, target)) continue
      callback(c, target)
    }
  }

  async getApartmentCache(ownerAccountId, templateKey) {
    const cacheKey = `${ownerAccountId}:${templateKey}`
    const existing = this.apartmentCacheByOwner.get(cacheKey)
    if (existing) return existing
    const tokenPlayer = this.players.get(this.byAccountId.get(ownerAccountId) ?? '')
    const token = tokenPlayer?.token
    const response = await callBackendJson(token, '/apartments/state', 'POST', {
      owner_account_id: ownerAccountId,
      template_key: templateKey
    })
    const apartment = response?.apartment
    const objects = Array.isArray(apartment?.objects) ? apartment.objects : []
    const cache = {
      roomPublicId: typeof apartment?.room_public_id === 'string' ? apartment.room_public_id : '',
      ownerAccountId,
      templateKey,
      name: 'Apartment',
      objects: new Map(objects.map((obj) => [obj.objectId, obj]))
    }
    this.apartmentCacheByOwner.set(cacheKey, cache)
    return cache
  }

  apartmentCacheKey(ownerAccountId, templateKey) {
    return `${ownerAccountId}:${templateKey}`
  }

  apartmentViewPlayers(ownerAccountId, templateKey) {
    return this.clients.filter((c) => {
      const p = this.players.get(c.sessionId)
      if (!p) return false
      return p.zone === 'apartment' && p.apartmentOwnerId === ownerAccountId && p.apartmentTemplateKey === templateKey
    })
  }

  async onApartmentInventoryRequest(client) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    if (!player.token) {
      client.send('apartment_inventory_error', { message: 'Missing auth token', code: 'missing_token' })
      return
    }
    try {
      const response = await callBackendJson(player.token, '/apartments/assets', 'GET')
      const items = Array.isArray(response?.items) ? response.items : []
      this.inventoryCacheByAccount.set(player.accountId, items)
      client.send('apartment_inventory', { items })
    } catch (error) {
      client.send('apartment_inventory_error', {
        message: error instanceof Error ? error.message : 'Inventory request failed',
        code: error?.code ?? 'inventory_error'
      })
    }
  }

  async onJoin(client, options) {
    const accountId = parseAccountId(client?.auth?.accountId)
    if (accountId === null) {
      throw new Error('invalid account id')
    }
    const duplicateSessionId = this.byAccountId.get(accountId)
    if (duplicateSessionId && duplicateSessionId !== client.sessionId) {
      const stale = this.clients.find((c) => c.sessionId === duplicateSessionId)
      if (stale) stale.leave(4001, 'duplicate session')
      this.players.delete(duplicateSessionId)
    }
    const player = this.buildPlayer(client, options)
    this.players.set(client.sessionId, player)
    this.byAccountId.set(accountId, client.sessionId)
    client.send('init', {
      me: this.publicPlayer(player),
      users: [...this.players.values()]
        .filter((u) => u.sessionId !== client.sessionId && this.arePlayersVisible(player, u))
        .map((u) => this.publicPlayer(u)),
      ...this.getInitExtrasFor(player)
    })
    this.forEachVisibleClient(player, (targetClient) => {
      targetClient.send('user_joined', this.publicPlayer(player))
    }, client)
  }

  onMove(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player || !payload || typeof payload !== 'object') return
    player.x = normalizeNumber(payload.x, player.x)
    player.y = normalizeNumber(payload.y, player.y)
    player.z = normalizeNumber(payload.z, player.z)
    this.forEachVisibleClient(player, (targetClient) => {
      targetClient.send('user_moved', {
        sessionId: client.sessionId,
        x: player.x,
        y: player.y,
        z: player.z
      })
    }, client)
  }

  onAppearance(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player || !payload || typeof payload !== 'object') return
    const slots = payload?.slots ?? payload
    player.appearance = normalizeAppearanceIds(slots)
    player.slotHexes = normalizeSlotHexes(payload?.slotHexes ?? {})
    player.bodyModelGlb = normalizeBodyModelGlb(payload?.bodyModelGlb)
    this.forEachVisibleClient(player, (targetClient) => {
      targetClient.send('appearance_updated', {
        sessionId: client.sessionId,
        appearance: { ...player.appearance },
        slotHexes: { ...player.slotHexes },
        bodyModelGlb: player.bodyModelGlb
      })
    })
  }

  async onEnterApartment(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    const ownerAccountId = parseAccountId(payload?.ownerAccountId) ?? player.accountId
    const templateKey = typeof payload?.templateKey === 'string' && payload.templateKey.trim().length > 0
      ? payload.templateKey.trim()
      : 'starter_loft'
    if (!player.token) {
      client.send('apartment_error', { message: 'Missing auth token', code: 'missing_token' })
      return
    }
    let apartment
    try {
      const response = await callBackendJson(player.token, '/apartments/state', 'POST', {
        owner_account_id: ownerAccountId,
        template_key: templateKey
      })
      const state = response?.apartment ?? {}
      apartment = {
        ownerAccountId,
        templateKey,
        name: 'Apartment',
        objects: new Map((Array.isArray(state.objects) ? state.objects : []).map((obj) => [obj.objectId, obj]))
      }
      this.apartmentCacheByOwner.set(this.apartmentCacheKey(ownerAccountId, templateKey), apartment)
    } catch (error) {
      client.send('apartment_error', {
        message: error instanceof Error ? error.message : 'Could not enter apartment',
        code: error?.code ?? 'apartment_enter_error'
      })
      return
    }
    player.zone = 'apartment'
    player.apartmentOwnerId = ownerAccountId
    player.apartmentTemplateKey = templateKey
    player.x = 0
    player.y = 1.6
    player.z = 4
    client.send('apartment_init', {
      ownerAccountId: apartment.ownerAccountId,
      templateKey: apartment.templateKey,
      name: apartment.name,
      objects: [...apartment.objects.values()]
    })
    await this.onApartmentInventoryRequest(client)
    this.broadcast('user_zone_changed', {
      sessionId: client.sessionId,
      zone: player.zone,
      apartmentOwnerId: player.apartmentOwnerId,
      x: player.x,
      y: player.y,
      z: player.z
    })
  }

  onExitApartment(client) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    player.zone = 'city'
    player.apartmentOwnerId = null
    player.apartmentTemplateKey = null
    player.x = 0
    player.y = 1.6
    player.z = 6
    this.broadcast('user_zone_changed', {
      sessionId: client.sessionId,
      zone: player.zone,
      apartmentOwnerId: null,
      x: player.x,
      y: player.y,
      z: player.z
    })
  }

  async onDecorateUpsert(client, payload) {
    // Backward-compatible alias for transform/spawn requests.
    await this.onApartmentUpsertOrTransform(client, payload)
  }

  async onApartmentSpawnRequest(client, payload) {
    await this.onApartmentUpsertOrTransform(client, payload, true)
  }

  async onApartmentTransformRequest(client, payload) {
    await this.onApartmentUpsertOrTransform(client, payload, false)
  }

  async onApartmentUpsertOrTransform(client, payload, forceSpawn = null) {
    const player = this.players.get(client.sessionId)
    if (!player || player.zone !== 'apartment') return
    const ownerAccountId = player.apartmentOwnerId
    const templateKey = player.apartmentTemplateKey ?? 'starter_loft'
    if (!ownerAccountId || !player.token) return
    const cacheKey = this.apartmentCacheKey(ownerAccountId, templateKey)
    const apartment = this.apartmentCacheByOwner.get(cacheKey) ?? {
      ownerAccountId,
      templateKey,
      name: 'Apartment',
      objects: new Map()
    }
    const objectId = typeof payload?.objectId === 'string' ? payload.objectId.trim() : ''
    if (!objectId) return
    const hasObject = apartment.objects.has(objectId)
    const shouldSpawn = forceSpawn === null ? !hasObject : forceSpawn
    const endpoint = shouldSpawn ? '/apartments/spawn' : '/apartments/transform'
    try {
      const response = await callBackendJson(player.token, endpoint, shouldSpawn ? 'POST' : 'PATCH', {
        owner_account_id: ownerAccountId,
        template_key: templateKey,
        ...payload
      })
      const saved = response?.object
      if (!saved || typeof saved.objectId !== 'string') return
      apartment.objects.set(saved.objectId, saved)
      this.apartmentCacheByOwner.set(cacheKey, apartment)
      for (const c of this.apartmentViewPlayers(ownerAccountId, templateKey)) {
        c.send('apartment_object_upserted', saved)
      }
    } catch (error) {
      client.send('apartment_action_error', {
        message: error instanceof Error ? error.message : 'Could not update apartment object',
        code: error?.code ?? 'apartment_object_error'
      })
    }
  }

  async onDecorateRemove(client, payload) {
    await this.onApartmentPickupRequest(client, payload)
  }

  async onApartmentPickupRequest(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player || player.zone !== 'apartment') return
    const ownerAccountId = player.apartmentOwnerId
    const templateKey = player.apartmentTemplateKey ?? 'starter_loft'
    if (!ownerAccountId || !player.token) return
    const cacheKey = this.apartmentCacheKey(ownerAccountId, templateKey)
    const apartment = this.apartmentCacheByOwner.get(cacheKey) ?? {
      ownerAccountId,
      templateKey,
      name: 'Apartment',
      objects: new Map()
    }
    const objectId = typeof payload?.objectId === 'string' ? payload.objectId : ''
    if (!objectId) return
    try {
      await callBackendJson(player.token, '/apartments/pickup', 'POST', {
        owner_account_id: ownerAccountId,
        template_key: templateKey,
        objectId: objectId
      })
      apartment.objects.delete(objectId)
      this.apartmentCacheByOwner.set(cacheKey, apartment)
      for (const c of this.apartmentViewPlayers(ownerAccountId, templateKey)) {
        c.send('apartment_object_removed', { objectId })
      }
      await this.onApartmentInventoryRequest(client)
    } catch (error) {
      client.send('apartment_action_error', {
        message: error instanceof Error ? error.message : 'Could not pickup apartment object',
        code: error?.code ?? 'apartment_pickup_error'
      })
    }
  }

  onLeave(client) {
    const player = this.players.get(client.sessionId)
    this.players.delete(client.sessionId)
    if (player) {
      if (this.byAccountId.get(player.accountId) === client.sessionId) {
        this.byAccountId.delete(player.accountId)
      }
      this.broadcast('user_left', { sessionId: client.sessionId }, { except: client })
    }
  }

  getInitExtrasFor() {
    return {}
  }
}

class CityRoom extends PresenceRoom {
  onCreate(options) {
    super.onCreate({ ...options, maxPlayers: CITY_MAX_PLAYERS })
    this.metadata = {
      kind: 'city',
      maxPlayers: CITY_MAX_PLAYERS
    }
  }
}

async function boot() {
  const port = parseInt(process.env.PORT || '3000', 10)
  const gameServer = new Server({
    transport: new WebSocketTransport()
  })
  gameServer.define('city', CityRoom)
  await gameServer.listen(port)
  console.log(`Colyseus server on port ${port} (city:${CITY_MAX_PLAYERS}, apartment-in-city enabled)`)
  console.log('[colyseus] apartment economy is backend-authoritative via Laravel API')
}

boot().catch((error) => {
  console.error('[colyseus] fatal boot error', error)
  process.exit(1)
})
