import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const entryPath = process.argv[1]
const IS_MAIN_MODULE = typeof entryPath === 'string' && import.meta.url === pathToFileURL(entryPath).href
const colyseus = IS_MAIN_MODULE ? await import('colyseus') : null
const Room = colyseus?.Room ?? class {}
const Server = colyseus?.Server ?? null
const WebSocketTransport = colyseus?.WebSocketTransport ?? null

const COLORS = [
  0xe94560, 0x0f3460, 0x533483, 0x00d9ff, 0x00ff88,
  0xffaa00, 0xff3366, 0x9d4edd, 0x06ffa5, 0xff6b35
]

const SLOTS = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']
// Must match CITY_SPAWN in front/src/game/gameRoomConstants.ts (SM_Thuja_81 tree in LobbyMap)
const CITY_SPAWN = { x: -89.6, y: 1.6, z: 22.4 }
// Must match APARTMENT_SPAWN in front/src/game/gameRoomConstants.ts (near Door_Frame_A2 inside new apartment GLB)
const APARTMENT_SPAWN = { x: 3.8, y: 1.6, z: -1.2 }
// Must match CITY_APARTMENT_EXIT in front/src/game/gameRoomConstants.ts (player-confirmed Opera street spot)
const CITY_APARTMENT_EXIT = { x: -103.2, y: 1.6, z: 25.0 }
const CITY_MAX_PLAYERS = parseInt(process.env.CITY_MAX_PLAYERS || '30', 10)
const BACKEND_API_URL = (process.env.BACKEND_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '')
const parsedBackendTimeout = parseInt(process.env.BACKEND_REQUEST_TIMEOUT_MS || '5000', 10)
const BACKEND_REQUEST_TIMEOUT_MS = Number.isFinite(parsedBackendTimeout) && parsedBackendTimeout > 0
  ? parsedBackendTimeout
  : 5000
const PLAYER_MOVE_SPEED = 8
const MOVE_MIN_INTERVAL_MS = 25
const MOVE_INITIAL_ALLOWANCE = 0.6
const MOVE_MAX_BURST_DISTANCE = 1.2
const MOVE_HEIGHT_TOLERANCE = 0.25
const APPEARANCE_REFRESH_MIN_INTERVAL_MS = 500
const VOICE_SIGNAL_MAX_TOKENS = 60
const VOICE_SIGNAL_REFILL_PER_SECOND = 20
const VOICE_SPEAKING_MAX_TOKENS = 12
const VOICE_SPEAKING_REFILL_PER_SECOND = 4
const VOICE_POLICY_REFRESH_MIN_INTERVAL_MS = 3_000
const VOICE_TOPOLOGY_INTERVAL_MS = 250
const ACTIVITY_CONTROL_MAX_TOKENS = 4
const ACTIVITY_CONTROL_REFILL_PER_SECOND = 1

export const ORB_RUSH_HUB = Object.freeze({ x: -85.5, z: 26.5 })
export const ORB_RUSH_ROUTE = Object.freeze([
  Object.freeze({ x: -85, z: 20.5 }),
  Object.freeze({ x: -80.5, z: 22.5 }),
  Object.freeze({ x: -80.5, z: 28.5 }),
  Object.freeze({ x: -85, z: 33.5 }),
  Object.freeze({ x: -92, z: 32.5 }),
  Object.freeze({ x: -96, z: 27 }),
  Object.freeze({ x: -95, z: 19 }),
  Object.freeze({ x: -88, z: 17 })
])
export const ORB_RUSH_HUB_RADIUS = 7
export const ORB_RUSH_PICKUP_RADIUS = 1.8
const ORB_RUSH_COUNTDOWN_MS = 3_000
const ORB_RUSH_TIMEOUT_MS = 120_000
const ORB_RUSH_QUEUE_PAIR_DISTANCE = ORB_RUSH_HUB_RADIUS * 2
const ORB_RUSH_DUEL_LANE_OFFSET = 0.75

const DEFAULT_VOICE_CONFIG = Object.freeze({
  enabled: true,
  maxPeers: 4,
  connectDistance: 18,
  disconnectDistance: 22,
  iceServers: Object.freeze([]),
  iceTransportPolicy: 'all',
  error: null
})

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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.has(key))
}

export function consumeTokenBucket(
  state,
  {
    capacity,
    refillPerSecond,
    cost = 1
  },
  now = Date.now()
) {
  if (
    !Number.isFinite(state?.tokens) ||
    !Number.isFinite(state?.lastRefillAt) ||
    !Number.isFinite(capacity) ||
    capacity <= 0 ||
    !Number.isFinite(refillPerSecond) ||
    refillPerSecond < 0 ||
    !Number.isFinite(cost) ||
    cost <= 0 ||
    !Number.isFinite(now)
  ) {
    throw new TypeError('invalid token bucket state')
  }
  const elapsedMs = Math.max(0, now - state.lastRefillAt)
  const available = Math.min(
    capacity,
    Math.max(0, state.tokens) + (elapsedMs / 1_000) * refillPerSecond
  )
  const allowed = available >= cost
  return {
    allowed,
    tokens: allowed ? available - cost : available,
    lastRefillAt: now
  }
}

function invalidVoiceConfig(message) {
  return {
    ...DEFAULT_VOICE_CONFIG,
    enabled: false,
    iceServers: [],
    error: message
  }
}

function parseBooleanSetting(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback
  const normalized = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}

function parseNumberSetting(raw, fallback, { integer = false, min, max }) {
  if (raw === undefined || raw === null || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  if (integer && !Number.isInteger(parsed)) return null
  if (parsed < min || parsed > max) return null
  return parsed
}

function normalizeIceServer(raw) {
  if (!isPlainObject(raw)) return null
  if (!hasOnlyKeys(raw, new Set(['urls', 'username', 'credential', 'credentialType']))) return null

  const urls = typeof raw.urls === 'string'
    ? [raw.urls]
    : Array.isArray(raw.urls) && raw.urls.every((url) => typeof url === 'string')
      ? raw.urls
      : null
  if (!urls || urls.length === 0 || urls.length > 16) return null
  const normalizedUrls = urls.map((url) => url.trim())
  if (
    normalizedUrls.some((url) => (
      url.length === 0 ||
      url.length > 2_048 ||
      !/^(stun|stuns|turn|turns):/i.test(url)
    ))
  ) {
    return null
  }
  if (raw.username !== undefined && (typeof raw.username !== 'string' || raw.username.length > 1_024)) {
    return null
  }
  if (raw.credential !== undefined && (typeof raw.credential !== 'string' || raw.credential.length > 2_048)) {
    return null
  }
  if (raw.credentialType !== undefined && raw.credentialType !== 'password') return null

  const normalized = {
    urls: typeof raw.urls === 'string' ? normalizedUrls[0] : normalizedUrls
  }
  if (raw.username !== undefined) normalized.username = raw.username
  if (raw.credential !== undefined) normalized.credential = raw.credential
  if (raw.credentialType !== undefined) normalized.credentialType = raw.credentialType
  return normalized
}

export function parseVoiceConfig(env = {}) {
  const enabled = parseBooleanSetting(env.VOICE_ENABLED, DEFAULT_VOICE_CONFIG.enabled)
  if (enabled === null) return invalidVoiceConfig('VOICE_ENABLED must be a boolean')

  const maxPeers = parseNumberSetting(
    env.VOICE_MAX_PEERS,
    DEFAULT_VOICE_CONFIG.maxPeers,
    { integer: true, min: 1, max: 8 }
  )
  if (maxPeers === null) return invalidVoiceConfig('VOICE_MAX_PEERS must be an integer from 1 to 8')

  const connectDistance = parseNumberSetting(
    env.VOICE_CONNECT_DISTANCE,
    DEFAULT_VOICE_CONFIG.connectDistance,
    { min: 1, max: 100 }
  )
  if (connectDistance === null) return invalidVoiceConfig('VOICE_CONNECT_DISTANCE must be from 1 to 100')

  const disconnectDistance = parseNumberSetting(
    env.VOICE_DISCONNECT_DISTANCE,
    DEFAULT_VOICE_CONFIG.disconnectDistance,
    { min: 1, max: 120 }
  )
  if (disconnectDistance === null || disconnectDistance < connectDistance) {
    return invalidVoiceConfig('VOICE_DISCONNECT_DISTANCE must be at least VOICE_CONNECT_DISTANCE')
  }

  const iceTransportPolicy = env.VOICE_ICE_TRANSPORT_POLICY === undefined ||
      env.VOICE_ICE_TRANSPORT_POLICY === ''
    ? DEFAULT_VOICE_CONFIG.iceTransportPolicy
    : String(env.VOICE_ICE_TRANSPORT_POLICY).trim().toLowerCase()
  if (iceTransportPolicy !== 'all' && iceTransportPolicy !== 'relay') {
    return invalidVoiceConfig('VOICE_ICE_TRANSPORT_POLICY must be "all" or "relay"')
  }

  let parsedIceServers = []
  if (env.VOICE_ICE_SERVERS_JSON !== undefined && env.VOICE_ICE_SERVERS_JSON !== '') {
    try {
      parsedIceServers = JSON.parse(env.VOICE_ICE_SERVERS_JSON)
    } catch {
      return invalidVoiceConfig('VOICE_ICE_SERVERS_JSON must be valid JSON')
    }
  }
  if (!Array.isArray(parsedIceServers) || parsedIceServers.length > 16) {
    return invalidVoiceConfig('VOICE_ICE_SERVERS_JSON must be an array with at most 16 entries')
  }
  const iceServers = parsedIceServers.map(normalizeIceServer)
  if (iceServers.some((server) => server === null)) {
    return invalidVoiceConfig('VOICE_ICE_SERVERS_JSON contains an invalid ICE server')
  }

  return {
    enabled,
    maxPeers,
    connectDistance,
    disconnectDistance,
    iceServers,
    iceTransportPolicy,
    error: null
  }
}

export function parseVoicePolicy(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.blocked_account_ids)) {
    return { ok: false, error: 'invalid voice policy response' }
  }
  const blockedAccountIds = new Set()
  for (const rawId of raw.blocked_account_ids) {
    const accountId = parseAccountId(rawId)
    if (accountId === null) return { ok: false, error: 'invalid blocked account id' }
    blockedAccountIds.add(accountId)
  }
  return { ok: true, blockedAccountIds }
}

export function voiceVisibilityKey(player) {
  if (player?.zone === 'apartment') {
    return `apartment:${player.apartmentOwnerId ?? 0}`
  }
  return 'city'
}

export function voicePairKey(firstSessionId, secondSessionId) {
  const [a, b] = String(firstSessionId) < String(secondSessionId)
    ? [String(firstSessionId), String(secondSessionId)]
    : [String(secondSessionId), String(firstSessionId)]
  return `${a}\u0000${b}`
}

function blocksVoice(first, second) {
  const firstBlocked = first.blockedAccountIds instanceof Set
    ? first.blockedAccountIds
    : new Set(first.blockedAccountIds ?? [])
  const secondBlocked = second.blockedAccountIds instanceof Set
    ? second.blockedAccountIds
    : new Set(second.blockedAccountIds ?? [])
  return firstBlocked.has(second.accountId) || secondBlocked.has(first.accountId)
}

function canVoicePair(first, second) {
  return (
    first !== second &&
    first?.voiceEnabled === true &&
    second?.voiceEnabled === true &&
    first?.voicePolicyLoaded === true &&
    second?.voicePolicyLoaded === true &&
    voiceVisibilityKey(first) === voiceVisibilityKey(second) &&
    !blocksVoice(first, second) &&
    Number.isFinite(first.x) &&
    Number.isFinite(first.z) &&
    Number.isFinite(second.x) &&
    Number.isFinite(second.z)
  )
}

export function selectVoiceTopology(players, existingLinks = [], config = DEFAULT_VOICE_CONFIG) {
  const eligiblePlayers = [...players]
    .filter((player) => player && typeof player.sessionId === 'string')
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId))
  const bySessionId = new Map(eligiblePlayers.map((player) => [player.sessionId, player]))
  const maxPeers = Number.isInteger(config.maxPeers) && config.maxPeers > 0
    ? config.maxPeers
    : DEFAULT_VOICE_CONFIG.maxPeers
  const connectDistance = Number.isFinite(config.connectDistance)
    ? config.connectDistance
    : DEFAULT_VOICE_CONFIG.connectDistance
  const disconnectDistance = Number.isFinite(config.disconnectDistance)
    ? Math.max(config.disconnectDistance, connectDistance)
    : DEFAULT_VOICE_CONFIG.disconnectDistance
  const degree = new Map(eligiblePlayers.map((player) => [player.sessionId, 0]))
  const selected = []
  const selectedKeys = new Set()

  const retainable = [...existingLinks]
    .map((link) => {
      const a = typeof link?.a === 'string' ? link.a : null
      const b = typeof link?.b === 'string' ? link.b : null
      return a && b ? { a, b, key: voicePairKey(a, b) } : null
    })
    .filter(Boolean)
    .sort((first, second) => first.key.localeCompare(second.key))

  for (const link of retainable) {
    const first = bySessionId.get(link.a)
    const second = bySessionId.get(link.b)
    if (!first || !second || !canVoicePair(first, second)) continue
    if ((degree.get(first.sessionId) ?? 0) >= maxPeers) continue
    if ((degree.get(second.sessionId) ?? 0) >= maxPeers) continue
    if (Math.hypot(first.x - second.x, first.z - second.z) > disconnectDistance) continue
    if (selectedKeys.has(link.key)) continue
    selected.push({ a: first.sessionId, b: second.sessionId })
    selectedKeys.add(link.key)
    degree.set(first.sessionId, (degree.get(first.sessionId) ?? 0) + 1)
    degree.set(second.sessionId, (degree.get(second.sessionId) ?? 0) + 1)
  }

  const candidates = []
  for (let firstIndex = 0; firstIndex < eligiblePlayers.length; firstIndex += 1) {
    const first = eligiblePlayers[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < eligiblePlayers.length; secondIndex += 1) {
      const second = eligiblePlayers[secondIndex]
      const key = voicePairKey(first.sessionId, second.sessionId)
      if (selectedKeys.has(key) || !canVoicePair(first, second)) continue
      const distance = Math.hypot(first.x - second.x, first.z - second.z)
      if (distance <= connectDistance) {
        candidates.push({ a: first.sessionId, b: second.sessionId, distance, key })
      }
    }
  }
  candidates.sort((first, second) => (
    first.distance - second.distance ||
    first.key.localeCompare(second.key)
  ))

  for (const candidate of candidates) {
    if ((degree.get(candidate.a) ?? 0) >= maxPeers) continue
    if ((degree.get(candidate.b) ?? 0) >= maxPeers) continue
    selected.push({ a: candidate.a, b: candidate.b })
    selectedKeys.add(candidate.key)
    degree.set(candidate.a, (degree.get(candidate.a) ?? 0) + 1)
    degree.set(candidate.b, (degree.get(candidate.b) ?? 0) + 1)
  }

  return selected.sort((first, second) => (
    voicePairKey(first.a, first.b).localeCompare(voicePairKey(second.a, second.b))
  ))
}

function validBoundedString(value, maxLength, { allowEmpty = false } = {}) {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.length > 0)
  )
}

export function validateVoiceSignal(payload) {
  if (!isPlainObject(payload)) return { ok: false, error: 'signal must be an object' }
  if (!validBoundedString(payload.targetSessionId, 128)) {
    return { ok: false, error: 'invalid targetSessionId' }
  }
  if (!validBoundedString(payload.linkId, 128)) {
    return { ok: false, error: 'invalid linkId' }
  }
  if (!['offer', 'answer', 'ice'].includes(payload.kind)) {
    return { ok: false, error: 'invalid signal kind' }
  }

  if (payload.kind === 'offer' || payload.kind === 'answer') {
    if (!hasOnlyKeys(payload, new Set(['targetSessionId', 'linkId', 'kind', 'description']))) {
      return { ok: false, error: 'unexpected description signal field' }
    }
    if (
      !isPlainObject(payload.description) ||
      !hasOnlyKeys(payload.description, new Set(['type', 'sdp'])) ||
      payload.description.type !== payload.kind ||
      !validBoundedString(payload.description.sdp, 65_536)
    ) {
      return { ok: false, error: 'invalid session description' }
    }
    return {
      ok: true,
      value: {
        targetSessionId: payload.targetSessionId,
        linkId: payload.linkId,
        kind: payload.kind,
        description: {
          type: payload.kind,
          sdp: payload.description.sdp
        }
      }
    }
  }

  if (!hasOnlyKeys(payload, new Set(['targetSessionId', 'linkId', 'kind', 'candidate']))) {
    return { ok: false, error: 'unexpected ICE signal field' }
  }
  if (payload.candidate === null) {
    return {
      ok: true,
      value: {
        targetSessionId: payload.targetSessionId,
        linkId: payload.linkId,
        kind: 'ice',
        candidate: null
      }
    }
  }
  if (
    !isPlainObject(payload.candidate) ||
    !hasOnlyKeys(
      payload.candidate,
      new Set(['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'])
    ) ||
    !validBoundedString(payload.candidate.candidate, 4_096, { allowEmpty: true })
  ) {
    return { ok: false, error: 'invalid ICE candidate' }
  }
  const { sdpMid, sdpMLineIndex, usernameFragment } = payload.candidate
  if (sdpMid !== undefined && sdpMid !== null && !validBoundedString(sdpMid, 256, { allowEmpty: true })) {
    return { ok: false, error: 'invalid ICE sdpMid' }
  }
  if (
    sdpMLineIndex !== undefined &&
    sdpMLineIndex !== null &&
    (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 65_535)
  ) {
    return { ok: false, error: 'invalid ICE sdpMLineIndex' }
  }
  if (
    usernameFragment !== undefined &&
    usernameFragment !== null &&
    !validBoundedString(usernameFragment, 256, { allowEmpty: true })
  ) {
    return { ok: false, error: 'invalid ICE usernameFragment' }
  }
  const candidate = { candidate: payload.candidate.candidate }
  if (sdpMid !== undefined) candidate.sdpMid = sdpMid
  if (sdpMLineIndex !== undefined) candidate.sdpMLineIndex = sdpMLineIndex
  if (usernameFragment !== undefined) candidate.usernameFragment = usernameFragment
  return {
    ok: true,
    value: {
      targetSessionId: payload.targetSessionId,
      linkId: payload.linkId,
      kind: 'ice',
      candidate
    }
  }
}

export function isInsideOrbRushHub(position, radius = ORB_RUSH_HUB_RADIUS) {
  return (
    Number.isFinite(position?.x) &&
    Number.isFinite(position?.z) &&
    Number.isFinite(radius) &&
    radius >= 0 &&
    Math.hypot(position.x - ORB_RUSH_HUB.x, position.z - ORB_RUSH_HUB.z) <= radius
  )
}

export function advanceOrbRushProgress(
  checkpointIndex,
  position,
  route = ORB_RUSH_ROUTE,
  pickupRadius = ORB_RUSH_PICKUP_RADIUS
) {
  const safeIndex = Number.isInteger(checkpointIndex) && checkpointIndex >= 0
    ? Math.min(checkpointIndex, route.length)
    : 0
  if (safeIndex >= route.length) {
    return {
      checkpointIndex: route.length,
      advanced: false,
      finished: true,
      target: null
    }
  }
  const target = route[safeIndex]
  const inRange = (
    Number.isFinite(position?.x) &&
    Number.isFinite(position?.z) &&
    Math.hypot(position.x - target.x, position.z - target.z) <= pickupRadius
  )
  const nextIndex = inRange ? safeIndex + 1 : safeIndex
  return {
    checkpointIndex: nextIndex,
    advanced: inRange,
    finished: nextIndex >= route.length,
    target: nextIndex < route.length ? route[nextIndex] : null
  }
}

export function orbRushStartPosition(index, playerCount) {
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(playerCount) ||
    index < 0 ||
    playerCount < 1 ||
    index >= playerCount
  ) {
    throw new TypeError('invalid Orb Rush start slot')
  }
  if (playerCount === 1) {
    return { x: ORB_RUSH_HUB.x, y: CITY_SPAWN.y, z: ORB_RUSH_HUB.z }
  }

  const firstCheckpoint = ORB_RUSH_ROUTE[0]
  const routeX = firstCheckpoint.x - ORB_RUSH_HUB.x
  const routeZ = firstCheckpoint.z - ORB_RUSH_HUB.z
  const routeLength = Math.hypot(routeX, routeZ)
  const perpendicularX = -routeZ / routeLength
  const perpendicularZ = routeX / routeLength
  const centeredSlot = index - (playerCount - 1) / 2
  const offset = centeredSlot * ORB_RUSH_DUEL_LANE_OFFSET * 2
  return {
    x: ORB_RUSH_HUB.x + perpendicularX * offset,
    y: CITY_SPAWN.y,
    z: ORB_RUSH_HUB.z + perpendicularZ * offset
  }
}

export function computeVisibilityTransition(
  selfSessionId,
  previousVisibilityKey,
  nextVisibilityKey,
  players
) {
  const lost = []
  const gained = []
  const stayed = []
  for (const player of players) {
    if (!player || player.sessionId === selfSessionId) continue
    const peerKey = voiceVisibilityKey(player)
    const wasVisible = peerKey === previousVisibilityKey
    const isVisible = peerKey === nextVisibilityKey
    if (wasVisible && !isVisible) lost.push(player.sessionId)
    else if (!wasVisible && isVisible) gained.push(player.sessionId)
    else if (wasVisible && isVisible) stayed.push(player.sessionId)
  }
  return {
    lost: lost.sort(),
    gained: gained.sort(),
    stayed: stayed.sort()
  }
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

export function normalizeAuthoritativeAppearance(raw) {
  const rawSlots = raw && typeof raw === 'object' ? raw.slots : null
  const appearanceInput = {}
  for (const slot of SLOTS) {
    const item = rawSlots && typeof rawSlots === 'object' ? rawSlots[slot] : null
    appearanceInput[slot] = item && typeof item === 'object' ? item.item_def_id : null
  }
  const body = rawSlots && typeof rawSlots === 'object' ? rawSlots.body : null
  return {
    appearance: normalizeAppearanceIds(appearanceInput),
    slotHexes: normalizeSlotHexes(raw && typeof raw === 'object' ? raw.colors : null),
    bodyModelGlb: normalizeBodyModelGlb(
      body && typeof body === 'object' ? body.model_glb : null
    )
  }
}

export function normalizeBodyModelGlb(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  try {
    const parsed = new URL(trimmed, 'http://campuscove.local')
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const path = decodeURIComponent(parsed.pathname)
    if (!path.toLowerCase().endsWith('.glb')) return null
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return path
    if (trimmed.startsWith('//')) return trimmed
    return parsed.toString()
  } catch {
    return null
  }
}

function parseAccountId(raw) {
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const parsed = Number(raw)
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

async function fetchWithTimeout(fetchImpl, url, options) {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), BACKEND_REQUEST_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...options, signal: abortController.signal })
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error('backend request timed out')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function validateMove(player, payload, now = Date.now()) {
  if (!player || !payload || typeof payload !== 'object') return null
  if (
    typeof payload.x !== 'number' ||
    !Number.isFinite(payload.x) ||
    typeof payload.y !== 'number' ||
    !Number.isFinite(payload.y) ||
    typeof payload.z !== 'number' ||
    !Number.isFinite(payload.z)
  ) {
    return null
  }

  const lastMoveAt = Number.isFinite(player.lastMoveAt) ? player.lastMoveAt : now
  const elapsedMs = now - lastMoveAt
  if (elapsedMs < MOVE_MIN_INTERVAL_MS) return null
  if (Math.abs(payload.y - player.y) > MOVE_HEIGHT_TOLERANCE) return null

  const previousAllowance = Number.isFinite(player.moveAllowance)
    ? Math.max(0, player.moveAllowance)
    : MOVE_INITIAL_ALLOWANCE
  const moveAllowance = Math.min(
    MOVE_MAX_BURST_DISTANCE,
    previousAllowance + PLAYER_MOVE_SPEED * (elapsedMs / 1000)
  )
  const distance = Math.hypot(payload.x - player.x, payload.z - player.z)
  if (distance > moveAllowance) {
    return {
      x: player.x,
      y: player.y,
      z: player.z,
      at: now,
      moveAllowance,
      corrected: true
    }
  }

  return {
    x: payload.x,
    y: player.y,
    z: payload.z,
    at: now,
    moveAllowance: Math.max(0, moveAllowance - distance),
    corrected: false
  }
}

export async function resolveIdentity(
  options,
  fetchImpl = globalThis.fetch,
  backendApiUrl = BACKEND_API_URL
) {
  const token = typeof options?.token === 'string' ? options.token.trim() : ''
  if (!token) {
    throw new Error('missing auth token')
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('authentication service unavailable')
  }

  const res = await fetchWithTimeout(fetchImpl, `${backendApiUrl}/user`, {
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
      : `User_${accountId}`

  return { accountId, pseudo, token }
}

async function callBackendJson(token, path, method = 'POST', body = null) {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('missing auth token')
  }
  const res = await fetchWithTimeout(fetch, `${BACKEND_API_URL}${path}`, {
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

async function fetchAuthoritativeAppearance(token) {
  const response = await callBackendJson(token, '/character/cosmetics', 'GET')
  return normalizeAuthoritativeAppearance(response)
}

export class PresenceRoom extends Room {
  onCreate(options) {
    this.maxClients = options?.maxPlayers || CITY_MAX_PLAYERS
    this.players = new Map()
    this.byAccountId = new Map()
    this.apartmentCacheByOwner = new Map()
    this.inventoryCacheByAccount = new Map()
    this.voiceConfig = parseVoiceConfig(process.env)
    this.voiceLinks = new Map()
    this.voiceRevision = 0
    this.lastVoiceTopologyAt = 0
    this.voiceTopologyTimer = null
    this.activityQueue = new Map()
    this.activityMatches = new Map()
    this.activityBySessionId = new Map()
    this.activityBestByAccountId = new Map()
    this.onMessage('move', (client, payload) => this.onMove(client, payload))
    this.onMessage('appearance', (client) => {
      void this.onAppearance(client)
    })
    this.onMessage('voice_enable', (client, payload) => {
      void this.onVoiceEnable(client, payload)
    })
    this.onMessage('voice_policy_refresh', (client) => {
      void this.onVoiceEnable(client, { enabled: true })
    })
    this.onMessage('voice_signal', (client, payload) => this.onVoiceSignal(client, payload))
    this.onMessage('voice_speaking', (client, payload) => this.onVoiceSpeaking(client, payload))
    this.onMessage('activity_start', (client, payload) => this.onActivityStart(client, payload))
    this.onMessage('activity_queue', (client) => this.onActivityQueue(client))
    this.onMessage('activity_cancel', (client) => this.onActivityCancel(client))
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
      const identity = await resolveIdentity(options)
      const authoritativeAppearance = await fetchAuthoritativeAppearance(identity.token)
      return { ...identity, authoritativeAppearance }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[colyseus] onAuth failed:', msg)
      throw err
    }
  }

  buildPlayer(client) {
    const accountId = client?.auth?.accountId
    const pseudo = client?.auth?.pseudo
    const authoritativeAppearance = client?.auth?.authoritativeAppearance
      ?? normalizeAuthoritativeAppearance(null)
    return {
      sessionId: client.sessionId,
      accountId,
      pseudo,
      color: getColor(this.players.size),
      x: CITY_SPAWN.x,
      y: CITY_SPAWN.y,
      z: CITY_SPAWN.z,
      lastMoveAt: Date.now(),
      moveAllowance: MOVE_INITIAL_ALLOWANCE,
      lastAppearanceRefreshAt: 0,
      appearanceRefreshToken: 0,
      zone: 'city',
      apartmentOwnerId: null,
      apartmentTemplateKey: null,
      token: client?.auth?.token ?? null,
      voiceEnabled: false,
      voicePolicyLoaded: false,
      voicePolicyRequestId: 0,
      voicePolicyInFlight: false,
      voicePolicyLastRequestedAt: 0,
      voiceSpeaking: false,
      blockedAccountIds: new Set(),
      voiceSignalTokens: VOICE_SIGNAL_MAX_TOKENS,
      voiceSignalLastRefillAt: Date.now(),
      voiceSpeakingTokens: VOICE_SPEAKING_MAX_TOKENS,
      voiceSpeakingLastRefillAt: Date.now(),
      lastVoicePositionSnapshotAt: 0,
      activityControlTokens: ACTIVITY_CONTROL_MAX_TOKENS,
      activityControlLastRefillAt: Date.now(),
      activityRateLimitNoticeAt: 0,
      appearance: authoritativeAppearance.appearance,
      slotHexes: authoritativeAppearance.slotHexes,
      bodyModelGlb: authoritativeAppearance.bodyModelGlb
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
    return voiceVisibilityKey(player)
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

  async onJoin(client) {
    const accountId = parseAccountId(client?.auth?.accountId)
    if (accountId === null) {
      throw new Error('invalid account id')
    }
    const duplicateSessionId = this.byAccountId.get(accountId)
    if (duplicateSessionId && duplicateSessionId !== client.sessionId) {
      const stale = this.clients.find((c) => c.sessionId === duplicateSessionId)
      if (stale) stale.leave(4001, 'duplicate session')
      const duplicatePlayer = this.players.get(duplicateSessionId)
      if (duplicatePlayer) {
        this.stopActivityForSession(duplicateSessionId, { notify: false })
        this.clearVoiceOptIn(duplicatePlayer)
        this.forEachVisibleClient(duplicatePlayer, (targetClient) => {
          targetClient.send('user_left', { sessionId: duplicateSessionId })
        }, stale)
        this.players.delete(duplicateSessionId)
        this.reconcileVoiceLinks()
      }
    }
    const player = this.buildPlayer(client)
    this.players.set(client.sessionId, player)
    this.byAccountId.set(accountId, client.sessionId)
    client.send('init', {
      me: this.publicPlayer(player),
      users: [...this.players.values()]
        .filter((u) => u.sessionId !== client.sessionId && this.arePlayersVisible(player, u))
        .map((u) => this.publicPlayer(u)),
      ...this.getInitExtrasFor(player)
    })
    this.sendVoiceConfig(client, player)
    this.sendVoicePeerSnapshot(client, player)
    this.forEachVisibleClient(player, (targetClient) => {
      targetClient.send('user_joined', this.publicPlayer(player))
    }, client)
  }

  onMove(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    const moveRequestedAt = Date.now()
    if (this.isActivityCountdownLocked(player, moveRequestedAt)) {
      if (moveRequestedAt - player.lastMoveAt < MOVE_MIN_INTERVAL_MS) return
      player.lastMoveAt = moveRequestedAt
      client.send('position_corrected', {
        x: player.x,
        y: player.y,
        z: player.z
      })
      return
    }
    const move = validateMove(player, payload)
    if (!move) return
    player.lastMoveAt = move.at
    player.moveAllowance = move.moveAllowance
    if (move.corrected) {
      client.send('position_corrected', {
        x: player.x,
        y: player.y,
        z: player.z
      })
      return
    }
    player.x = move.x
    player.y = move.y
    player.z = move.z
    this.forEachVisibleClient(player, (targetClient) => {
      targetClient.send('user_moved', {
        sessionId: client.sessionId,
        x: player.x,
        y: player.y,
        z: player.z
      })
    }, client)
    this.onActivityMovement(player)
    const now = Date.now()
    const shouldReconcileVoice = now - this.lastVoiceTopologyAt >= VOICE_TOPOLOGY_INTERVAL_MS
    let voiceTopologyChanged = false
    if (shouldReconcileVoice) {
      if (this.voiceTopologyTimer) {
        clearTimeout(this.voiceTopologyTimer)
        this.voiceTopologyTimer = null
      }
      this.lastVoiceTopologyAt = now
      voiceTopologyChanged = this.reconcileVoiceLinks()
    } else {
      this.scheduleVoiceTopologyReconcile(now)
    }
    if (!voiceTopologyChanged) this.sendVoicePositionSnapshots(player)
  }

  scheduleVoiceTopologyReconcile(now = Date.now()) {
    if (this.voiceTopologyTimer) return
    const delay = Math.max(
      0,
      VOICE_TOPOLOGY_INTERVAL_MS - (now - this.lastVoiceTopologyAt)
    )
    this.voiceTopologyTimer = setTimeout(() => {
      this.voiceTopologyTimer = null
      this.lastVoiceTopologyAt = Date.now()
      this.reconcileVoiceLinks()
    }, delay)
    this.voiceTopologyTimer.unref?.()
  }

  clientForSession(sessionId) {
    return this.clients.find((client) => client.sessionId === sessionId) ?? null
  }

  publicVoiceConfig(player) {
    return {
      enabled: this.voiceConfig.enabled,
      active: player?.voiceEnabled === true,
      policyLoaded: player?.voicePolicyLoaded === true,
      maxPeers: this.voiceConfig.maxPeers,
      connectDistance: this.voiceConfig.connectDistance,
      disconnectDistance: this.voiceConfig.disconnectDistance,
      iceServers: this.voiceConfig.iceServers.map((server) => ({ ...server })),
      iceTransportPolicy: this.voiceConfig.iceTransportPolicy,
      error: this.voiceConfig.error
    }
  }

  sendVoiceConfig(client, player = this.players.get(client.sessionId)) {
    client.send('voice_config', this.publicVoiceConfig(player))
  }

  voiceLinksForSession(sessionId) {
    return [...this.voiceLinks.values()]
      .filter((link) => link.a === sessionId || link.b === sessionId)
      .sort((first, second) => first.linkId.localeCompare(second.linkId))
  }

  sendVoicePeerSnapshot(client, player = this.players.get(client.sessionId)) {
    const peers = []
    if (player?.voiceEnabled === true && player?.voicePolicyLoaded === true) {
      for (const link of this.voiceLinksForSession(player.sessionId)) {
        const peerSessionId = link.a === player.sessionId ? link.b : link.a
        const peer = this.players.get(peerSessionId)
        if (!peer) continue
        peers.push({
          sessionId: peer.sessionId,
          accountId: peer.accountId,
          pseudo: peer.pseudo,
          linkId: link.linkId,
          shouldOffer: player.sessionId.localeCompare(peer.sessionId) < 0,
          speaking: peer.voiceSpeaking === true,
          x: peer.x,
          y: peer.y,
          z: peer.z
        })
      }
    }
    peers.sort((first, second) => first.sessionId.localeCompare(second.sessionId))
    client.send('voice_peer_snapshot', {
      revision: this.voiceRevision,
      peers
    })
  }

  sendVoicePositionSnapshots(player, now = Date.now()) {
    if (!player.voiceEnabled || now - player.lastVoicePositionSnapshotAt < 100) return
    player.lastVoicePositionSnapshotAt = now
    for (const link of this.voiceLinksForSession(player.sessionId)) {
      const targetSessionId = link.a === player.sessionId ? link.b : link.a
      const targetClient = this.clientForSession(targetSessionId)
      if (targetClient) this.sendVoicePeerSnapshot(targetClient)
    }
  }

  clearVoiceOptIn(player) {
    player.voicePolicyRequestId += 1
    player.voicePolicyInFlight = false
    player.voiceEnabled = false
    player.voicePolicyLoaded = false
    player.voiceSpeaking = false
    player.blockedAccountIds = new Set()
  }

  async onVoiceEnable(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    if (!isPlainObject(payload) || !hasOnlyKeys(payload, new Set(['enabled'])) || typeof payload.enabled !== 'boolean') {
      client.send('voice_error', {
        code: 'invalid_enable_request',
        message: 'voice_enable requires an enabled boolean'
      })
      return
    }

    if (payload.enabled === false) {
      this.clearVoiceOptIn(player)
      this.sendVoiceConfig(client, player)
      this.reconcileVoiceLinks([player.sessionId])
      return
    }

    if (!this.voiceConfig.enabled) {
      this.clearVoiceOptIn(player)
      this.sendVoiceConfig(client, player)
      client.send('voice_error', {
        code: this.voiceConfig.error ? 'voice_config_invalid' : 'voice_disabled',
        message: this.voiceConfig.error ?? 'Voice chat is disabled'
      })
      this.reconcileVoiceLinks([player.sessionId])
      return
    }
    if (!player.token) {
      this.clearVoiceOptIn(player)
      this.sendVoiceConfig(client, player)
      client.send('voice_error', {
        code: 'voice_disabled',
        reasonCode: 'missing_token',
        message: 'Voice policy requires authentication'
      })
      this.reconcileVoiceLinks([player.sessionId])
      return
    }

    const policyRequestedAt = Date.now()
    if (player.voicePolicyInFlight) return
    if (
      policyRequestedAt - player.voicePolicyLastRequestedAt <
      VOICE_POLICY_REFRESH_MIN_INTERVAL_MS
    ) {
      this.sendVoiceConfig(client, player)
      if (!player.voiceEnabled || !player.voicePolicyLoaded) {
        client.send('voice_error', {
          code: 'voice_disabled',
          reasonCode: 'policy_rate_limited',
          message: 'Please wait a moment before enabling voice again'
        })
      }
      return
    }

    const requestId = player.voicePolicyRequestId + 1
    player.voicePolicyRequestId = requestId
    player.voicePolicyInFlight = true
    player.voicePolicyLastRequestedAt = policyRequestedAt
    let response
    try {
      response = await callBackendJson(player.token, '/voice/policy', 'GET')
    } catch (error) {
      const current = this.players.get(client.sessionId)
      if (current === player && player.voicePolicyRequestId === requestId) {
        player.voicePolicyInFlight = false
      }
      if (current !== player || player.voicePolicyRequestId !== requestId) return
      this.clearVoiceOptIn(player)
      this.sendVoiceConfig(client, player)
      client.send('voice_error', {
        code: 'voice_disabled',
        reasonCode: error?.code ?? 'policy_unavailable',
        message: error instanceof Error ? error.message : 'Voice policy is unavailable'
      })
      this.reconcileVoiceLinks([player.sessionId])
      return
    }

    const current = this.players.get(client.sessionId)
    if (current === player && player.voicePolicyRequestId === requestId) {
      player.voicePolicyInFlight = false
    }
    if (current !== player || player.voicePolicyRequestId !== requestId) return
    const policy = parseVoicePolicy(response)
    if (!policy.ok) {
      this.clearVoiceOptIn(player)
      this.sendVoiceConfig(client, player)
      client.send('voice_error', {
        code: 'voice_disabled',
        reasonCode: 'invalid_policy',
        message: policy.error
      })
      this.reconcileVoiceLinks([player.sessionId])
      return
    }

    player.blockedAccountIds = policy.blockedAccountIds
    player.voicePolicyLoaded = true
    player.voiceEnabled = true
    player.voiceSpeaking = false
    player.voiceSignalTokens = VOICE_SIGNAL_MAX_TOKENS
    player.voiceSignalLastRefillAt = Date.now()
    player.voiceSpeakingTokens = VOICE_SPEAKING_MAX_TOKENS
    player.voiceSpeakingLastRefillAt = Date.now()
    this.sendVoiceConfig(client, player)
    this.reconcileVoiceLinks([player.sessionId])
  }

  reconcileVoiceLinks(forceSessionIds = []) {
    const desired = selectVoiceTopology(
      this.players.values(),
      this.voiceLinks.values(),
      this.voiceConfig
    )
    const desiredByKey = new Map(
      desired.map((link) => [voicePairKey(link.a, link.b), link])
    )
    const nextLinks = new Map()
    const affected = new Set(forceSessionIds)
    let changed = false

    for (const [key, existing] of this.voiceLinks) {
      if (desiredByKey.has(key)) {
        nextLinks.set(key, existing)
        continue
      }
      changed = true
      affected.add(existing.a)
      affected.add(existing.b)
      const first = this.players.get(existing.a)
      const second = this.players.get(existing.b)
      const firstClient = this.clientForSession(existing.a)
      const secondClient = this.clientForSession(existing.b)
      if (first?.voiceSpeaking && secondClient) {
        secondClient.send('voice_speaking', { sessionId: existing.a, active: false })
      }
      if (second?.voiceSpeaking && firstClient) {
        firstClient.send('voice_speaking', { sessionId: existing.b, active: false })
      }
    }

    for (const [key, desiredLink] of desiredByKey) {
      if (nextLinks.has(key)) continue
      changed = true
      affected.add(desiredLink.a)
      affected.add(desiredLink.b)
      nextLinks.set(key, {
        a: desiredLink.a,
        b: desiredLink.b,
        linkId: randomUUID()
      })
    }

    this.voiceLinks = nextLinks
    if (changed) this.voiceRevision += 1
    if (changed) {
      for (const player of this.players.values()) {
        if (player.voiceEnabled) affected.add(player.sessionId)
      }
    }
    for (const sessionId of affected) {
      const targetClient = this.clientForSession(sessionId)
      if (targetClient) this.sendVoicePeerSnapshot(targetClient)
    }
    return changed
  }

  consumeVoiceSignalToken(player, now = Date.now()) {
    const result = consumeTokenBucket(
      {
        tokens: player.voiceSignalTokens,
        lastRefillAt: player.voiceSignalLastRefillAt
      },
      {
        capacity: VOICE_SIGNAL_MAX_TOKENS,
        refillPerSecond: VOICE_SIGNAL_REFILL_PER_SECOND
      },
      now
    )
    player.voiceSignalTokens = result.tokens
    player.voiceSignalLastRefillAt = result.lastRefillAt
    return result.allowed
  }

  consumeVoiceSpeakingToken(player, now = Date.now()) {
    const result = consumeTokenBucket(
      {
        tokens: player.voiceSpeakingTokens,
        lastRefillAt: player.voiceSpeakingLastRefillAt
      },
      {
        capacity: VOICE_SPEAKING_MAX_TOKENS,
        refillPerSecond: VOICE_SPEAKING_REFILL_PER_SECOND
      },
      now
    )
    player.voiceSpeakingTokens = result.tokens
    player.voiceSpeakingLastRefillAt = result.lastRefillAt
    return result.allowed
  }

  consumeActivityControlTokens(player, client, cost, now = Date.now()) {
    const result = consumeTokenBucket(
      {
        tokens: player.activityControlTokens,
        lastRefillAt: player.activityControlLastRefillAt
      },
      {
        capacity: ACTIVITY_CONTROL_MAX_TOKENS,
        refillPerSecond: ACTIVITY_CONTROL_REFILL_PER_SECOND,
        cost
      },
      now
    )
    player.activityControlTokens = result.tokens
    player.activityControlLastRefillAt = result.lastRefillAt
    if (!result.allowed && now - player.activityRateLimitNoticeAt >= 1_000) {
      player.activityRateLimitNoticeAt = now
      this.sendActivityError(
        client,
        'rate_limited',
        'Cove Rush controls are being used too quickly'
      )
    }
    return result.allowed
  }

  onVoiceSignal(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player?.voiceEnabled || !player.voicePolicyLoaded) return
    if (!this.consumeVoiceSignalToken(player)) {
      client.send('voice_error', {
        code: 'rate_limited',
        message: 'Voice signaling rate limit exceeded'
      })
      return
    }
    const validation = validateVoiceSignal(payload)
    if (!validation.ok) {
      client.send('voice_error', {
        code: 'invalid_signal',
        message: validation.error
      })
      return
    }
    const signal = validation.value
    const key = voicePairKey(client.sessionId, signal.targetSessionId)
    const link = this.voiceLinks.get(key)
    if (!link || link.linkId !== signal.linkId) {
      client.send('voice_error', {
        code: 'stale_link',
        message: 'Voice link is no longer active'
      })
      return
    }
    const target = this.players.get(signal.targetSessionId)
    const targetClient = this.clientForSession(signal.targetSessionId)
    if (!target || !targetClient || !canVoicePair(player, target)) {
      client.send('voice_error', {
        code: 'unavailable_peer',
        message: 'Voice peer is unavailable'
      })
      this.reconcileVoiceLinks([player.sessionId])
      return
    }
    const outbound = {
      fromSessionId: client.sessionId,
      linkId: signal.linkId,
      kind: signal.kind
    }
    if (signal.kind === 'ice') outbound.candidate = signal.candidate
    else outbound.description = signal.description
    targetClient.send('voice_signal', outbound)
  }

  onVoiceSpeaking(client, payload) {
    const player = this.players.get(client.sessionId)
    if (
      !player?.voiceEnabled ||
      !player.voicePolicyLoaded ||
      !isPlainObject(payload) ||
      !hasOnlyKeys(payload, new Set(['active'])) ||
      typeof payload.active !== 'boolean' ||
      player.voiceSpeaking === payload.active
    ) {
      return
    }
    if (!this.consumeVoiceSpeakingToken(player) && payload.active) return
    player.voiceSpeaking = payload.active
    for (const link of this.voiceLinksForSession(player.sessionId)) {
      const targetSessionId = link.a === player.sessionId ? link.b : link.a
      const targetClient = this.clientForSession(targetSessionId)
      if (targetClient) {
        targetClient.send('voice_speaking', {
          sessionId: player.sessionId,
          active: payload.active
        })
      }
    }
  }

  activityConfigPayload() {
    return {
      mode: 'orb_rush',
      hub: {
        x: ORB_RUSH_HUB.x,
        z: ORB_RUSH_HUB.z,
        radius: ORB_RUSH_HUB_RADIUS
      },
      route: ORB_RUSH_ROUTE.map((checkpoint, index) => ({
        index,
        x: checkpoint.x,
        z: checkpoint.z,
        radius: ORB_RUSH_PICKUP_RADIUS
      })),
      checkpointCount: ORB_RUSH_ROUTE.length,
      countdownMs: ORB_RUSH_COUNTDOWN_MS,
      timeoutMs: ORB_RUSH_TIMEOUT_MS
    }
  }

  sendActivityError(client, code, message) {
    client.send('activity_error', { code, message })
  }

  isActivityCountdownLocked(player, now = Date.now()) {
    const matchId = this.activityBySessionId.get(player.sessionId)
    const match = matchId ? this.activityMatches.get(matchId) : null
    return match?.phase === 'countdown' && now < match.startsAt
  }

  isActivityEligible(player) {
    return player?.zone === 'city' && isInsideOrbRushHub(player)
  }

  activityOpponent(match, sessionId) {
    if (match.mode !== 'duel') return null
    const opponentSessionId = match.players.find((candidate) => candidate !== sessionId)
    const opponent = this.players.get(opponentSessionId)
    if (!opponent) return null
    return {
      sessionId: opponent.sessionId,
      id: String(opponent.accountId),
      pseudo: opponent.pseudo,
      checkpointIndex: match.checkpointBySessionId.get(opponent.sessionId) ?? 0
    }
  }

  activityStatePayload(match, player, now = Date.now()) {
    const checkpointIndex = match.checkpointBySessionId.get(player.sessionId) ?? 0
    const target = checkpointIndex < ORB_RUSH_ROUTE.length
      ? {
          index: checkpointIndex,
          x: ORB_RUSH_ROUTE[checkpointIndex].x,
          z: ORB_RUSH_ROUTE[checkpointIndex].z,
          radius: ORB_RUSH_PICKUP_RADIUS
        }
      : null
    return {
      activityId: match.id,
      mode: match.mode,
      phase: match.phase,
      status: match.phase,
      serverNow: now,
      startsAt: match.startsAt,
      endsAt: match.endsAt,
      checkpointIndex,
      checkpointCount: ORB_RUSH_ROUTE.length,
      target,
      opponent: this.activityOpponent(match, player.sessionId),
      bestMs: match.mode === 'solo'
        ? this.activityBestByAccountId.get(player.accountId) ?? null
        : null
    }
  }

  sendActivityState(match, player, now = Date.now()) {
    const client = this.clientForSession(player.sessionId)
    if (client) client.send('activity_state', this.activityStatePayload(match, player, now))
  }

  sendActivityStates(match, now = Date.now()) {
    for (const sessionId of match.players) {
      const player = this.players.get(sessionId)
      if (player) this.sendActivityState(match, player, now)
    }
  }

  clearActivityTimers(match) {
    if (match.startTimer) clearTimeout(match.startTimer)
    if (match.timeoutTimer) clearTimeout(match.timeoutTimer)
    match.startTimer = null
    match.timeoutTimer = null
  }

  createActivityMatch(players, mode, now = Date.now()) {
    const match = {
      id: randomUUID(),
      mode,
      phase: 'countdown',
      players: players.map((player) => player.sessionId),
      checkpointBySessionId: new Map(players.map((player) => [player.sessionId, 0])),
      startsAt: now + ORB_RUSH_COUNTDOWN_MS,
      endsAt: now + ORB_RUSH_COUNTDOWN_MS + ORB_RUSH_TIMEOUT_MS,
      startTimer: null,
      timeoutTimer: null
    }
    this.activityMatches.set(match.id, match)
    for (const player of players) {
      this.activityQueue.delete(player.sessionId)
      this.activityBySessionId.set(player.sessionId, match.id)
    }
    players.forEach((player, index) => {
      const start = orbRushStartPosition(index, players.length)
      player.x = start.x
      player.y = start.y
      player.z = start.z
      player.lastMoveAt = now
      player.moveAllowance = MOVE_INITIAL_ALLOWANCE
      const client = this.clientForSession(player.sessionId)
      client?.send('position_corrected', start)
      this.forEachVisibleClient(player, (targetClient) => {
        targetClient.send('user_moved', {
          sessionId: player.sessionId,
          x: player.x,
          y: player.y,
          z: player.z
        })
      }, client)
    })
    this.reconcileVoiceLinks(players.map((player) => player.sessionId))

    match.startTimer = setTimeout(() => {
      if (this.activityMatches.get(match.id) !== match || match.phase !== 'countdown') return
      match.phase = 'running'
      const startedAt = Date.now()
      for (const sessionId of match.players) {
        const player = this.players.get(sessionId)
        if (!player) continue
        player.lastMoveAt = startedAt
        player.moveAllowance = MOVE_INITIAL_ALLOWANCE
      }
      this.sendActivityStates(match)
    }, Math.max(0, match.startsAt - Date.now()))
    match.startTimer.unref?.()
    match.timeoutTimer = setTimeout(() => {
      if (this.activityMatches.get(match.id) !== match) return
      this.finishActivityTimeout(match)
    }, Math.max(0, match.endsAt - Date.now()))
    match.timeoutTimer.unref?.()

    if (mode === 'duel') {
      for (const player of players) {
        const client = this.clientForSession(player.sessionId)
        if (!client) continue
        client.send('activity_queue_state', {
          status: 'matched',
          serverNow: now,
          activityId: match.id,
          opponent: this.activityOpponent(match, player.sessionId),
          startsAt: match.startsAt
        })
      }
    }
    this.sendActivityStates(match, now)
    return match
  }

  onActivityStart(client, payload) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    if (!this.consumeActivityControlTokens(player, client, 2)) return
    if (
      !isPlainObject(payload) ||
      !hasOnlyKeys(payload, new Set(['mode'])) ||
      payload.mode !== 'solo'
    ) {
      this.sendActivityError(client, 'invalid_mode', 'activity_start supports mode "solo"')
      return
    }
    if (this.activityBySessionId.has(player.sessionId) || this.activityQueue.has(player.sessionId)) {
      this.sendActivityError(client, 'already_active', 'Finish or cancel the current activity first')
      return
    }
    if (!this.isActivityEligible(player)) {
      this.sendActivityError(client, 'not_at_hub', 'Move inside the Orb Rush hub to start')
      return
    }
    this.createActivityMatch([player], 'solo')
  }

  onActivityQueue(client) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    if (!this.consumeActivityControlTokens(player, client, 2)) return
    if (this.activityBySessionId.has(player.sessionId) || this.activityQueue.has(player.sessionId)) {
      this.sendActivityError(client, 'already_active', 'Already queued or playing')
      return
    }
    if (!this.isActivityEligible(player)) {
      this.sendActivityError(client, 'not_at_hub', 'Move inside the Orb Rush hub to queue')
      return
    }
    const queuedAt = Date.now()
    this.activityQueue.set(player.sessionId, { queuedAt })
    client.send('activity_queue_state', {
      status: 'queued',
      serverNow: queuedAt,
      queuedAt
    })
    this.matchActivityQueue()
  }

  matchActivityQueue() {
    const queueEntries = [...this.activityQueue.entries()]
      .sort((first, second) => (
        first[1].queuedAt - second[1].queuedAt ||
        first[0].localeCompare(second[0])
      ))

    for (const [sessionId] of queueEntries) {
      const player = this.players.get(sessionId)
      if (
        !player ||
        this.activityBySessionId.has(sessionId) ||
        !this.isActivityEligible(player)
      ) {
        this.activityQueue.delete(sessionId)
        const client = this.clientForSession(sessionId)
        if (client) {
          client.send('activity_queue_state', {
            status: 'idle',
            serverNow: Date.now(),
            reason: 'ineligible'
          })
        }
      }
    }

    while (this.activityQueue.size >= 2) {
      const ordered = [...this.activityQueue.entries()]
        .sort((first, second) => (
          first[1].queuedAt - second[1].queuedAt ||
          first[0].localeCompare(second[0])
        ))
      let selected = null
      for (let firstIndex = 0; firstIndex < ordered.length && !selected; firstIndex += 1) {
        const first = this.players.get(ordered[firstIndex][0])
        if (!first) continue
        for (let secondIndex = firstIndex + 1; secondIndex < ordered.length; secondIndex += 1) {
          const second = this.players.get(ordered[secondIndex][0])
          if (!second || voiceVisibilityKey(first) !== voiceVisibilityKey(second)) continue
          if (Math.hypot(first.x - second.x, first.z - second.z) <= ORB_RUSH_QUEUE_PAIR_DISTANCE) {
            selected = [first, second]
            break
          }
        }
      }
      if (!selected) return
      this.createActivityMatch(selected, 'duel')
    }
  }

  onActivityCancel(client) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    if (!this.consumeActivityControlTokens(player, client, 1)) return
    if (this.activityQueue.delete(player.sessionId)) {
      client.send('activity_queue_state', {
        status: 'idle',
        serverNow: Date.now(),
        reason: 'cancelled'
      })
      return
    }
    const matchId = this.activityBySessionId.get(player.sessionId)
    const match = matchId ? this.activityMatches.get(matchId) : null
    if (!match) {
      this.sendActivityError(client, 'not_active', 'No activity is active')
      return
    }
    if (match.mode === 'solo') {
      this.finishSoloActivity(match, 'cancelled', Date.now(), new Set())
    } else {
      this.finishDuelActivity(match, {
        winnerSessionId: match.players.find((sessionId) => sessionId !== player.sessionId) ?? null,
        forfeitSessionId: player.sessionId,
        now: Date.now()
      })
    }
  }

  activityFinishedPayload(match, player, {
    result,
    winnerSessionId,
    durationMs,
    bestMs = null,
    isNewBest = false,
    now = Date.now()
  }) {
    return {
      activityId: match.id,
      mode: match.mode,
      result,
      serverNow: now,
      winnerSessionId,
      durationMs,
      checkpointIndex: match.checkpointBySessionId.get(player.sessionId) ?? 0,
      checkpointCount: ORB_RUSH_ROUTE.length,
      bestMs,
      isNewBest,
      opponent: this.activityOpponent(match, player.sessionId)
    }
  }

  releaseActivityMatch(match) {
    this.clearActivityTimers(match)
    this.activityMatches.delete(match.id)
    for (const sessionId of match.players) {
      if (this.activityBySessionId.get(sessionId) === match.id) {
        this.activityBySessionId.delete(sessionId)
      }
    }
  }

  finishSoloActivity(match, result, now = Date.now(), skipSessionIds = new Set()) {
    if (this.activityMatches.get(match.id) !== match) return
    const sessionId = match.players[0]
    const player = this.players.get(sessionId)
    let durationMs = null
    let bestMs = player ? this.activityBestByAccountId.get(player.accountId) ?? null : null
    let isNewBest = false
    if (result === 'completed' && player) {
      durationMs = Math.max(0, now - match.startsAt)
      if (bestMs === null || durationMs < bestMs) {
        bestMs = durationMs
        isNewBest = true
        this.activityBestByAccountId.set(player.accountId, durationMs)
      }
    } else if (result === 'timeout') {
      durationMs = ORB_RUSH_TIMEOUT_MS
    }
    if (player && !skipSessionIds.has(sessionId)) {
      const client = this.clientForSession(sessionId)
      if (client) {
        client.send('activity_finished', this.activityFinishedPayload(match, player, {
          result,
          winnerSessionId: result === 'completed' ? sessionId : null,
          durationMs,
          bestMs,
          isNewBest,
          now
        }))
      }
    }
    this.releaseActivityMatch(match)
  }

  finishDuelActivity(match, {
    winnerSessionId = null,
    forfeitSessionId = null,
    timeout = false,
    now = Date.now(),
    skipSessionIds = new Set()
  } = {}) {
    if (this.activityMatches.get(match.id) !== match) return
    const durationMs = now >= match.startsAt ? Math.max(0, now - match.startsAt) : null
    for (const sessionId of match.players) {
      if (skipSessionIds.has(sessionId)) continue
      const player = this.players.get(sessionId)
      const client = this.clientForSession(sessionId)
      if (!player || !client) continue
      const result = timeout
        ? 'timeout'
        : sessionId === forfeitSessionId
          ? 'forfeit'
          : sessionId === winnerSessionId
            ? 'win'
            : 'loss'
      client.send('activity_finished', this.activityFinishedPayload(match, player, {
        result,
        winnerSessionId,
        durationMs,
        now
      }))
    }
    this.releaseActivityMatch(match)
  }

  finishActivityTimeout(match, now = Date.now()) {
    if (match.mode === 'solo') {
      this.finishSoloActivity(match, 'timeout', now)
    } else {
      this.finishDuelActivity(match, { timeout: true, now })
    }
  }

  stopActivityForSession(sessionId, { notify = true } = {}) {
    if (this.activityQueue.delete(sessionId)) {
      const client = this.clientForSession(sessionId)
      if (notify && client) {
        client.send('activity_queue_state', {
          status: 'idle',
          serverNow: Date.now(),
          reason: 'zone_or_leave'
        })
      }
    }
    const matchId = this.activityBySessionId.get(sessionId)
    const match = matchId ? this.activityMatches.get(matchId) : null
    if (!match) return
    const skipSessionIds = notify ? new Set() : new Set([sessionId])
    if (match.mode === 'solo') {
      this.finishSoloActivity(match, 'cancelled', Date.now(), skipSessionIds)
      return
    }
    this.finishDuelActivity(match, {
      winnerSessionId: match.players.find((candidate) => candidate !== sessionId) ?? null,
      forfeitSessionId: sessionId,
      now: Date.now(),
      skipSessionIds
    })
  }

  onActivityMovement(player, now = Date.now()) {
    if (this.activityQueue.has(player.sessionId) && !this.isActivityEligible(player)) {
      this.activityQueue.delete(player.sessionId)
      const client = this.clientForSession(player.sessionId)
      if (client) {
        client.send('activity_queue_state', {
          status: 'idle',
          serverNow: now,
          reason: 'left_hub'
        })
      }
    }

    const matchId = this.activityBySessionId.get(player.sessionId)
    const match = matchId ? this.activityMatches.get(matchId) : null
    if (!match) return
    if (player.zone !== 'city') {
      this.stopActivityForSession(player.sessionId)
      return
    }
    if (now >= match.endsAt) {
      this.finishActivityTimeout(match, now)
      return
    }
    if (match.phase === 'countdown' && now >= match.startsAt) {
      match.phase = 'running'
      if (match.startTimer) clearTimeout(match.startTimer)
      match.startTimer = null
      this.sendActivityStates(match, now)
    }
    if (match.phase !== 'running') return

    const currentIndex = match.checkpointBySessionId.get(player.sessionId) ?? 0
    const progression = advanceOrbRushProgress(currentIndex, player)
    if (!progression.advanced) return
    match.checkpointBySessionId.set(player.sessionId, progression.checkpointIndex)
    if (progression.finished) {
      if (match.mode === 'solo') {
        this.finishSoloActivity(match, 'completed', now)
      } else {
        this.finishDuelActivity(match, {
          winnerSessionId: player.sessionId,
          now
        })
      }
      return
    }
    this.sendActivityStates(match, now)
  }

  async onAppearance(client) {
    const player = this.players.get(client.sessionId)
    if (!player || !player.token) return
    const now = Date.now()
    if (now - player.lastAppearanceRefreshAt < APPEARANCE_REFRESH_MIN_INTERVAL_MS) return
    player.lastAppearanceRefreshAt = now
    const refreshToken = player.appearanceRefreshToken + 1
    player.appearanceRefreshToken = refreshToken

    let authoritativeAppearance
    try {
      authoritativeAppearance = await fetchAuthoritativeAppearance(player.token)
    } catch (error) {
      client.send('appearance_error', {
        message: error instanceof Error ? error.message : 'Could not refresh appearance',
        code: error?.code ?? 'appearance_refresh_error'
      })
      return
    }

    const current = this.players.get(client.sessionId)
    if (current !== player || player.appearanceRefreshToken !== refreshToken) return
    player.appearance = authoritativeAppearance.appearance
    player.slotHexes = authoritativeAppearance.slotHexes
    player.bodyModelGlb = authoritativeAppearance.bodyModelGlb
    this.forEachVisibleClient(player, (targetClient) => {
      targetClient.send('appearance_updated', {
        sessionId: client.sessionId,
        appearance: { ...player.appearance },
        slotHexes: { ...player.slotHexes },
        bodyModelGlb: player.bodyModelGlb
      })
    })
  }

  playerZonePayload(player) {
    return {
      sessionId: player.sessionId,
      zone: player.zone,
      apartmentOwnerId: player.apartmentOwnerId,
      x: player.x,
      y: player.y,
      z: player.z
    }
  }

  announceVisibilityTransition(client, player, previousVisibilityKey) {
    const nextVisibilityKey = this.visibilityKey(player)
    const transition = computeVisibilityTransition(
      player.sessionId,
      previousVisibilityKey,
      nextVisibilityKey,
      this.players.values()
    )

    for (const sessionId of transition.lost) {
      const peer = this.players.get(sessionId)
      const peerClient = this.clientForSession(sessionId)
      if (!peer || !peerClient) continue
      peerClient.send('user_left', { sessionId: player.sessionId })
      client.send('user_left', { sessionId: peer.sessionId })
    }

    const zonePayload = this.playerZonePayload(player)
    client.send('user_zone_changed', zonePayload)

    for (const sessionId of transition.gained) {
      const peer = this.players.get(sessionId)
      const peerClient = this.clientForSession(sessionId)
      if (!peer || !peerClient) continue
      peerClient.send('user_joined', this.publicPlayer(player))
      client.send('user_joined', this.publicPlayer(peer))
    }

    for (const sessionId of transition.stayed) {
      const peerClient = this.clientForSession(sessionId)
      if (peerClient) peerClient.send('user_zone_changed', zonePayload)
    }
    this.reconcileVoiceLinks([player.sessionId])
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
    if (this.players.get(client.sessionId) !== player) return
    const previousVisibilityKey = this.visibilityKey(player)
    this.stopActivityForSession(player.sessionId)
    player.zone = 'apartment'
    player.apartmentOwnerId = ownerAccountId
    player.apartmentTemplateKey = templateKey
    player.x = APARTMENT_SPAWN.x
    player.y = APARTMENT_SPAWN.y
    player.z = APARTMENT_SPAWN.z
    player.lastMoveAt = Date.now()
    player.moveAllowance = MOVE_INITIAL_ALLOWANCE
    client.send('apartment_init', {
      ownerAccountId: apartment.ownerAccountId,
      templateKey: apartment.templateKey,
      name: apartment.name,
      objects: [...apartment.objects.values()]
    })
    this.announceVisibilityTransition(client, player, previousVisibilityKey)
    await this.onApartmentInventoryRequest(client)
  }

  onExitApartment(client) {
    const player = this.players.get(client.sessionId)
    if (!player) return
    const previousVisibilityKey = this.visibilityKey(player)
    this.stopActivityForSession(player.sessionId)
    player.zone = 'city'
    player.apartmentOwnerId = null
    player.apartmentTemplateKey = null
    player.x = CITY_APARTMENT_EXIT.x
    player.y = CITY_APARTMENT_EXIT.y
    player.z = CITY_APARTMENT_EXIT.z
    player.lastMoveAt = Date.now()
    player.moveAllowance = MOVE_INITIAL_ALLOWANCE
    this.announceVisibilityTransition(client, player, previousVisibilityKey)
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
    if (player) {
      this.stopActivityForSession(player.sessionId, { notify: false })
      this.clearVoiceOptIn(player)
      this.forEachVisibleClient(player, (targetClient) => {
        targetClient.send('user_left', { sessionId: client.sessionId })
      }, client)
      this.players.delete(client.sessionId)
      if (this.byAccountId.get(player.accountId) === client.sessionId) {
        this.byAccountId.delete(player.accountId)
      }
      this.reconcileVoiceLinks()
    }
  }

  getInitExtrasFor() {
    return {
      activityConfig: this.activityConfigPayload()
    }
  }

  onDispose() {
    if (this.voiceTopologyTimer) clearTimeout(this.voiceTopologyTimer)
    this.voiceTopologyTimer = null
    for (const match of this.activityMatches.values()) {
      this.clearActivityTimers(match)
    }
    this.activityMatches.clear()
    this.activityBySessionId.clear()
    this.activityQueue.clear()
    this.voiceLinks.clear()
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
  if (Server === null || WebSocketTransport === null) {
    throw new Error('Colyseus runtime is unavailable')
  }
  const port = parseInt(process.env.PORT || '3000', 10)
  const gameServer = new Server({
    transport: new WebSocketTransport()
  })
  gameServer.define('city', CityRoom)
  await gameServer.listen(port)
  console.log(`Colyseus server on port ${port} (city:${CITY_MAX_PLAYERS}, apartment-in-city enabled)`)
  console.log('[colyseus] apartment economy is backend-authoritative via Laravel API')
}

if (IS_MAIN_MODULE) {
  boot().catch((error) => {
    console.error('[colyseus] fatal boot error', error)
    process.exit(1)
  })
}
