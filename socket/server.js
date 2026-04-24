import { randomUUID } from 'node:crypto'
import { Room, Server, WebSocketTransport } from 'colyseus'
import { Pool } from 'pg'

const COLORS = [
  0xe94560, 0x0f3460, 0x533483, 0x00d9ff, 0x00ff88,
  0xffaa00, 0xff3366, 0x9d4edd, 0x06ffa5, 0xff6b35
]

const SLOTS = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']
const CITY_MAX_PLAYERS = parseInt(process.env.CITY_MAX_PLAYERS || '30', 10)
const APARTMENT_MAX_PLAYERS = parseInt(process.env.APARTMENT_MAX_PLAYERS || '8', 10)
const BACKEND_API_URL = (process.env.BACKEND_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '')
const DECOR_EPSILON_POSITION = 0.01
const DECOR_EPSILON_ROTATION = 0.01

const DEFAULT_SLOT_HEX = {
  body: '#8B7AA8',
  hair: '#6B5B95',
  top: '#9B8ABF',
  bottom: '#5A4E72',
  shoes: '#4A3F62',
  head_accessory: '#7A6B94'
}

function dbConfigFromEnv() {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl) {
    const forceSsl = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
    return {
      connectionString: databaseUrl,
      ssl: forceSsl ? { rejectUnauthorized: false } : false
    }
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'campus_cove',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'secret'
  }
}

const pool = new Pool(dbConfigFromEnv())

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
    return { accountId: fallbackId, pseudo: fallbackPseudo ?? `User_${fallbackId}` }
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
    return { accountId, pseudo }
  } catch (error) {
    if (fallbackId === null) throw error
    return { accountId: fallbackId, pseudo: fallbackPseudo ?? `User_${fallbackId}` }
  }
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apartment_instances (
      id BIGSERIAL PRIMARY KEY,
      owner_account_id BIGINT NOT NULL,
      template_key TEXT NOT NULL DEFAULT 'starter_loft',
      name TEXT NOT NULL DEFAULT 'Starter Loft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_account_id, template_key)
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apartment_guests (
      apartment_id BIGINT NOT NULL REFERENCES apartment_instances(id) ON DELETE CASCADE,
      guest_account_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (apartment_id, guest_account_id)
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apartment_objects (
      object_id TEXT PRIMARY KEY,
      apartment_id BIGINT NOT NULL REFERENCES apartment_instances(id) ON DELETE CASCADE,
      object_key TEXT NOT NULL,
      variant TEXT NULL,
      color TEXT NULL,
      x DOUBLE PRECISION NOT NULL,
      y DOUBLE PRECISION NOT NULL,
      z DOUBLE PRECISION NOT NULL,
      rot_x DOUBLE PRECISION NOT NULL,
      rot_y DOUBLE PRECISION NOT NULL,
      rot_z DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS apartment_objects_apartment_id_idx ON apartment_objects(apartment_id);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS apartment_guests_guest_account_id_idx ON apartment_guests(guest_account_id);`)
}

async function ensureApartment(ownerAccountId, templateKey) {
  const inserted = await pool.query(
    `
    INSERT INTO apartment_instances (owner_account_id, template_key)
    VALUES ($1, $2)
    ON CONFLICT (owner_account_id, template_key) DO UPDATE SET updated_at = NOW()
    RETURNING id, owner_account_id, template_key, name;
    `,
    [ownerAccountId, templateKey]
  )
  return inserted.rows[0]
}

async function loadApartmentObjects(apartmentId) {
  const result = await pool.query(
    `
    SELECT object_id, object_key, variant, color, x, y, z, rot_x, rot_y, rot_z
    FROM apartment_objects
    WHERE apartment_id = $1
    ORDER BY created_at ASC;
    `,
    [apartmentId]
  )
  return result.rows.map((r) => ({
    objectId: String(r.object_id),
    objectKey: String(r.object_key),
    variant: typeof r.variant === 'string' ? r.variant : null,
    color: typeof r.color === 'string' ? r.color : null,
    x: normalizeNumber(r.x, 0),
    y: normalizeNumber(r.y, 0),
    z: normalizeNumber(r.z, 0),
    rotX: normalizeNumber(r.rot_x, 0),
    rotY: normalizeNumber(r.rot_y, 0),
    rotZ: normalizeNumber(r.rot_z, 0)
  }))
}

async function loadApartmentGuests(apartmentId) {
  const result = await pool.query(
    `SELECT guest_account_id FROM apartment_guests WHERE apartment_id = $1;`,
    [apartmentId]
  )
  const out = new Set()
  for (const row of result.rows) {
    const guestId = parseAccountId(row.guest_account_id)
    if (guestId !== null) out.add(guestId)
  }
  return out
}

async function upsertApartmentObject(apartmentId, payload) {
  const normalized = normalizeApartmentObjectPayload(payload)
  const { objectId, objectKey, variant, color, x, y, z, rotX, rotY, rotZ } = normalized
  await pool.query(
    `
    INSERT INTO apartment_objects
      (object_id, apartment_id, object_key, variant, color, x, y, z, rot_x, rot_y, rot_z, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (object_id) DO UPDATE SET
      object_key = EXCLUDED.object_key,
      variant = EXCLUDED.variant,
      color = EXCLUDED.color,
      x = EXCLUDED.x,
      y = EXCLUDED.y,
      z = EXCLUDED.z,
      rot_x = EXCLUDED.rot_x,
      rot_y = EXCLUDED.rot_y,
      rot_z = EXCLUDED.rot_z,
      updated_at = NOW();
    `,
    [objectId, apartmentId, objectKey, variant, color, x, y, z, rotX, rotY, rotZ]
  )
  return normalized
}

function normalizeApartmentObjectPayload(payload) {
  const objectId = typeof payload?.objectId === 'string' && payload.objectId.trim().length > 0
    ? payload.objectId.trim()
    : randomUUID()
  const objectKey = typeof payload?.objectKey === 'string' && payload.objectKey.trim().length > 0
    ? payload.objectKey.trim()
    : 'furniture.generic'
  const variant = typeof payload?.variant === 'string' && payload.variant.trim().length > 0 ? payload.variant.trim() : null
  const color = typeof payload?.color === 'string' && payload.color.trim().length > 0 ? payload.color.trim() : null
  const x = normalizeNumber(payload?.x, 0)
  const y = normalizeNumber(payload?.y, 0)
  const z = normalizeNumber(payload?.z, 0)
  const rotX = normalizeNumber(payload?.rotX, 0)
  const rotY = normalizeNumber(payload?.rotY, 0)
  const rotZ = normalizeNumber(payload?.rotZ, 0)
  return { objectId, objectKey, variant, color, x, y, z, rotX, rotY, rotZ }
}

function sameDecorState(a, b) {
  return (
    Math.abs(a.x - b.x) <= DECOR_EPSILON_POSITION &&
    Math.abs(a.y - b.y) <= DECOR_EPSILON_POSITION &&
    Math.abs(a.z - b.z) <= DECOR_EPSILON_POSITION &&
    Math.abs(a.rotX - b.rotX) <= DECOR_EPSILON_ROTATION &&
    Math.abs(a.rotY - b.rotY) <= DECOR_EPSILON_ROTATION &&
    Math.abs(a.rotZ - b.rotZ) <= DECOR_EPSILON_ROTATION &&
    a.objectKey === b.objectKey &&
    a.variant === b.variant &&
    a.color === b.color
  )
}

async function removeApartmentObject(apartmentId, objectId) {
  if (typeof objectId !== 'string' || objectId.trim().length === 0) return false
  const result = await pool.query(
    `DELETE FROM apartment_objects WHERE apartment_id = $1 AND object_id = $2;`,
    [apartmentId, objectId.trim()]
  )
  return result.rowCount > 0
}

async function addGuest(apartmentId, guestAccountId) {
  await pool.query(
    `
    INSERT INTO apartment_guests (apartment_id, guest_account_id)
    VALUES ($1, $2)
    ON CONFLICT (apartment_id, guest_account_id) DO NOTHING;
    `,
    [apartmentId, guestAccountId]
  )
}

class PresenceRoom extends Room {
  onCreate(options) {
    this.maxClients = options?.maxPlayers || CITY_MAX_PLAYERS
    this.players = new Map()
    this.byAccountId = new Map()
    this.apartmentCacheByOwner = new Map()
    this.onMessage('move', (client, payload) => this.onMove(client, payload))
    this.onMessage('appearance', (client, payload) => this.onAppearance(client, payload))
    this.onMessage('enter_apartment', async (client, payload) => this.onEnterApartment(client, payload))
    this.onMessage('exit_apartment', (client) => this.onExitApartment(client))
    this.onMessage('decorate_upsert', async (client, payload) => this.onDecorateUpsert(client, payload))
    this.onMessage('decorate_remove', async (client, payload) => this.onDecorateRemove(client, payload))
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
    await ensureSchema()
    const apartment = await ensureApartment(ownerAccountId, templateKey)
    const objects = await loadApartmentObjects(apartment.id)
    const cache = {
      apartmentId: apartment.id,
      ownerAccountId,
      templateKey,
      name: apartment.name,
      objects: new Map(objects.map((obj) => [obj.objectId, obj]))
    }
    this.apartmentCacheByOwner.set(cacheKey, cache)
    return cache
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
    const apartment = await this.getApartmentCache(ownerAccountId, templateKey)
    player.zone = 'apartment'
    player.apartmentOwnerId = ownerAccountId
    player.x = 0
    player.y = 1.6
    player.z = 4
    client.send('apartment_init', {
      ownerAccountId: apartment.ownerAccountId,
      templateKey: apartment.templateKey,
      name: apartment.name,
      objects: [...apartment.objects.values()]
    })
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
    const player = this.players.get(client.sessionId)
    if (!player || player.zone !== 'apartment') return
    const ownerAccountId = player.apartmentOwnerId
    if (!ownerAccountId || ownerAccountId !== player.accountId) return
    const apartment = await this.getApartmentCache(ownerAccountId, 'starter_loft')
    const normalized = normalizeApartmentObjectPayload(payload)
    const previous = apartment.objects.get(normalized.objectId)
    if (previous && sameDecorState(previous, normalized)) return
    const saved = await upsertApartmentObject(apartment.apartmentId, normalized)
    apartment.objects.set(saved.objectId, saved)
    for (const c of this.clients) {
      const cp = this.players.get(c.sessionId)
      if (!cp) continue
      if (cp.zone !== 'apartment' || cp.apartmentOwnerId !== ownerAccountId) continue
      c.send('apartment_object_upserted', saved)
    }
  }

  async onDecorateRemove(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player || player.zone !== 'apartment') return
    const ownerAccountId = player.apartmentOwnerId
    if (!ownerAccountId || ownerAccountId !== player.accountId) return
    const apartment = await this.getApartmentCache(ownerAccountId, 'starter_loft')
    const objectId = typeof payload?.objectId === 'string' ? payload.objectId : ''
    const removed = await removeApartmentObject(apartment.apartmentId, objectId)
    if (!removed) return
    apartment.objects.delete(objectId)
    for (const c of this.clients) {
      const cp = this.players.get(c.sessionId)
      if (!cp) continue
      if (cp.zone !== 'apartment' || cp.apartmentOwnerId !== ownerAccountId) continue
      c.send('apartment_object_removed', { objectId })
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
  console.log(
    '[colyseus] city room does not require Postgres; apartment persistence runs ensureSchema() on first apartment room.'
  )
}

boot().catch((error) => {
  console.error('[colyseus] fatal boot error', error)
  process.exit(1)
})
