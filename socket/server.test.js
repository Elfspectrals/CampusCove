import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ORB_RUSH_HUB,
  ORB_RUSH_ROUTE,
  PresenceRoom,
  advanceOrbRushProgress,
  computeVisibilityTransition,
  consumeTokenBucket,
  isInsideOrbRushHub,
  normalizeAuthoritativeAppearance,
  normalizeBodyModelGlb,
  orbRushStartPosition,
  parseVoiceConfig,
  parseVoicePolicy,
  resolveIdentity,
  selectVoiceTopology,
  validateVoiceSignal,
  validateMove
} from './server.js'

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    }
  }
}

function applyMove(player, move) {
  player.lastMoveAt = move.at
  player.moveAllowance = move.moveAllowance
  if (!move.corrected) {
    player.x = move.x
    player.y = move.y
    player.z = move.z
  }
}

test('resolveIdentity rejects missing tokens even when a client supplies an account id', async () => {
  let fetchCalled = false

  await assert.rejects(
    resolveIdentity(
      { userId: 42, accountId: 42, pseudo: 'Impersonated' },
      async () => {
        fetchCalled = true
        return response(200, {})
      }
    ),
    /missing auth token/
  )

  assert.equal(fetchCalled, false)
})

test('resolveIdentity never falls back to client identity after backend rejection', async () => {
  await assert.rejects(
    resolveIdentity(
      { token: 'invalid-token', userId: 42, pseudo: 'Impersonated' },
      async () => response(401, { message: 'Unauthenticated.' })
    ),
    /auth failed \(401\)/
  )
})

test('resolveIdentity trusts only the authenticated backend identity', async () => {
  const identity = await resolveIdentity(
    { token: ' valid-token ', userId: 999, pseudo: 'Impersonated' },
    async (url, options) => {
      assert.equal(url, 'http://backend.test/api/user')
      assert.equal(options.headers.Authorization, 'Bearer valid-token')

      return response(200, {
        user: {
          account_id: 7,
          display_name: 'Verified#0007',
          username: 'Verified'
        }
      })
    },
    'http://backend.test/api'
  )

  assert.deepEqual(identity, {
    accountId: 7,
    pseudo: 'Verified#0007',
    token: 'valid-token'
  })
})

test('resolveIdentity rejects malformed backend identity payloads', async () => {
  await assert.rejects(
    resolveIdentity(
      { token: 'valid-token', userId: 42 },
      async () => response(200, { user: { account_id: 'not-an-id' } })
    ),
    /invalid account id in auth payload/
  )
})

test('validateMove accepts normal movement and rejects teleport attempts', () => {
  const player = { x: 0, y: 1.6, z: 0, lastMoveAt: 1_000, moveAllowance: 0.6 }

  assert.deepEqual(validateMove(player, { x: 0.4, y: 1.6, z: 0 }, 1_050), {
    x: 0.4,
    y: 1.6,
    z: 0,
    at: 1_050,
    moveAllowance: 0.6,
    corrected: false
  })
  assert.deepEqual(validateMove(player, { x: 50, y: 1.6, z: 50 }, 1_050), {
    x: 0,
    y: 1.6,
    z: 0,
    at: 1_050,
    moveAllowance: 1,
    corrected: true
  })
  assert.equal(validateMove(player, { x: 0.1, y: 8, z: 0 }, 1_050), null)
  assert.equal(validateMove(player, { x: 0.1, y: 1.6, z: 0 }, 1_010), null)
})

test('validateMove limits sustained packet speed without freezing after a backlog', () => {
  const player = { x: 0, y: 1.6, z: 0, lastMoveAt: 1_000, moveAllowance: 0.6 }
  let now = 1_000

  for (let index = 0; index < 40; index += 1) {
    now += 25
    const move = validateMove(player, { x: player.x + 0.2, y: 1.6, z: 0 }, now)
    assert.ok(move)
    assert.equal(move.corrected, false)
    applyMove(player, move)
  }
  assert.ok(Math.abs(player.x - 8) < 1e-9)

  let corrections = 0
  for (let index = 0; index < 20; index += 1) {
    now += 25
    const move = validateMove(player, { x: player.x + 0.3, y: 1.6, z: 0 }, now)
    assert.ok(move)
    if (move.corrected) corrections += 1
    applyMove(player, move)
  }
  assert.ok(corrections > 0)
  assert.ok(player.x <= 12.6 + Number.EPSILON)

  now += 1_000
  const backlogCorrection = validateMove(player, { x: player.x + 20, y: 1.6, z: 0 }, now)
  assert.ok(backlogCorrection)
  assert.equal(backlogCorrection.corrected, true)
  assert.equal(backlogCorrection.x, player.x)
  applyMove(player, backlogCorrection)

  now += 50
  const recoveredMove = validateMove(player, { x: player.x + 0.4, y: 1.6, z: 0 }, now)
  assert.ok(recoveredMove)
  assert.equal(recoveredMove.corrected, false)
})

test('token buckets allow bursts, reject exhaustion, and recover over time', () => {
  const consumed = consumeTokenBucket(
    { tokens: 2, lastRefillAt: 1_000 },
    { capacity: 2, refillPerSecond: 1, cost: 2 },
    1_000
  )
  assert.deepEqual(consumed, {
    allowed: true,
    tokens: 0,
    lastRefillAt: 1_000
  })

  const exhausted = consumeTokenBucket(
    consumed,
    { capacity: 2, refillPerSecond: 1 },
    1_100
  )
  assert.equal(exhausted.allowed, false)
  assert.ok(Math.abs(exhausted.tokens - 0.1) < 1e-9)

  const recovered = consumeTokenBucket(
    exhausted,
    { capacity: 2, refillPerSecond: 1 },
    2_000
  )
  assert.equal(recovered.allowed, true)
  assert.ok(Math.abs(recovered.tokens) < 1e-9)
})

test('activity controls allow a normal start/cancel burst and throttle restart spam', () => {
  const room = Object.create(PresenceRoom.prototype)
  const errors = []
  room.sendActivityError = (_client, code, message) => {
    errors.push({ code, message })
  }
  const player = {
    activityControlTokens: 4,
    activityControlLastRefillAt: 1_000,
    activityRateLimitNoticeAt: 0
  }
  const client = {}

  assert.equal(room.consumeActivityControlTokens(player, client, 2, 1_000), true)
  assert.equal(room.consumeActivityControlTokens(player, client, 1, 1_000), true)
  assert.equal(room.consumeActivityControlTokens(player, client, 2, 1_000), false)
  assert.equal(errors[0]?.code, 'rate_limited')
  assert.equal(room.consumeActivityControlTokens(player, client, 2, 2_000), true)
})

test('countdown movement stays locked until the authoritative start time', () => {
  const room = Object.create(PresenceRoom.prototype)
  room.activityBySessionId = new Map([['player-a', 'match-a']])
  room.activityMatches = new Map([
    ['match-a', { phase: 'countdown', startsAt: 2_000 }]
  ])
  const player = { sessionId: 'player-a' }

  assert.equal(room.isActivityCountdownLocked(player, 1_999), true)
  assert.equal(room.isActivityCountdownLocked(player, 2_000), false)
  room.activityMatches.get('match-a').phase = 'running'
  assert.equal(room.isActivityCountdownLocked(player, 1_999), false)
})

test('voice topology throttling schedules one trailing reconciliation', async () => {
  const room = Object.create(PresenceRoom.prototype)
  let reconciliations = 0
  room.voiceTopologyTimer = null
  room.lastVoiceTopologyAt = 1_000
  room.reconcileVoiceLinks = () => {
    reconciliations += 1
    return true
  }

  room.scheduleVoiceTopologyReconcile(1_240)
  room.scheduleVoiceTopologyReconcile(1_245)
  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.equal(reconciliations, 1)
  assert.equal(room.voiceTopologyTimer, null)
})

test('normalizeBodyModelGlb preserves backend-approved GLB locations and rejects unsafe schemes', () => {
  assert.equal(
    normalizeBodyModelGlb('https://campuscove.example/models/CharacterAdventurer.glb'),
    'https://campuscove.example/models/CharacterAdventurer.glb'
  )
  assert.equal(
    normalizeBodyModelGlb('/api/assets/public/skins/models/abc123.glb'),
    '/api/assets/public/skins/models/abc123.glb'
  )
  assert.equal(
    normalizeBodyModelGlb('https://cdn.example/custom/avatar.glb?version=2'),
    'https://cdn.example/custom/avatar.glb?version=2'
  )
  assert.equal(normalizeBodyModelGlb('/custom/body.glb'), '/custom/body.glb')
  assert.equal(normalizeBodyModelGlb('https://tracker.example/avatar.png'), null)
  assert.equal(normalizeBodyModelGlb('data:model/gltf-binary;base64,AAAA'), null)
})

test('normalizeAuthoritativeAppearance uses only backend loadout fields', () => {
  const appearance = normalizeAuthoritativeAppearance({
    slots: {
      body: {
        item_def_id: 17,
        model_glb: 'https://api.campuscove.example/api/assets/public/skins/models/owned.glb'
      },
      hair: { item_def_id: 23 }
    },
    colors: {
      body: '#112233',
      hair: 'not-a-color'
    },
    bodyModelGlb: 'https://tracker.example/spoofed.glb',
    appearance: { body: 999 }
  })

  assert.equal(appearance.appearance.body, 17)
  assert.equal(appearance.appearance.hair, 23)
  assert.equal(appearance.appearance.top, null)
  assert.equal(appearance.slotHexes.body, '#112233')
  assert.equal(appearance.slotHexes.hair, '#6B5B95')
  assert.equal(
    appearance.bodyModelGlb,
    'https://api.campuscove.example/api/assets/public/skins/models/owned.glb'
  )
})

test('parseVoiceConfig accepts an explicitly empty ICE list and validated overrides', () => {
  assert.deepEqual(parseVoiceConfig({
    VOICE_ENABLED: 'true',
    VOICE_MAX_PEERS: '3',
    VOICE_CONNECT_DISTANCE: '16.5',
    VOICE_DISCONNECT_DISTANCE: '21',
    VOICE_ICE_SERVERS_JSON: '[]',
    VOICE_ICE_TRANSPORT_POLICY: 'relay'
  }), {
    enabled: true,
    maxPeers: 3,
    connectDistance: 16.5,
    disconnectDistance: 21,
    iceServers: [],
    iceTransportPolicy: 'relay',
    error: null
  })
})

test('parseVoiceConfig explicitly disables voice for malformed settings', () => {
  const malformedJson = parseVoiceConfig({ VOICE_ICE_SERVERS_JSON: '{' })
  assert.equal(malformedJson.enabled, false)
  assert.match(malformedJson.error, /valid JSON/)

  const invertedHysteresis = parseVoiceConfig({
    VOICE_CONNECT_DISTANCE: '22',
    VOICE_DISCONNECT_DISTANCE: '18'
  })
  assert.equal(invertedHysteresis.enabled, false)
  assert.match(invertedHysteresis.error, /at least/)

  const malformedIceUrl = parseVoiceConfig({
    VOICE_ICE_SERVERS_JSON: JSON.stringify([{ urls: 'https://not-an-ice-server.test' }])
  })
  assert.equal(malformedIceUrl.enabled, false)
  assert.match(malformedIceUrl.error, /invalid ICE server/)
})

test('parseVoicePolicy rejects malformed block data instead of silently allowing voice', () => {
  assert.deepEqual(
    parseVoicePolicy({ blocked_account_ids: [7, '8', 7] }),
    { ok: true, blockedAccountIds: new Set([7, 8]) }
  )
  assert.deepEqual(
    parseVoicePolicy({ blocked_account_ids: ['not-an-id'] }),
    { ok: false, error: 'invalid blocked account id' }
  )
  assert.deepEqual(
    parseVoicePolicy({}),
    { ok: false, error: 'invalid voice policy response' }
  )
})

function voicePlayer(
  sessionId,
  accountId,
  x,
  z,
  {
    zone = 'city',
    apartmentOwnerId = null,
    blockedAccountIds = new Set(),
    voiceEnabled = true,
    voicePolicyLoaded = true
  } = {}
) {
  return {
    sessionId,
    accountId,
    x,
    z,
    zone,
    apartmentOwnerId,
    blockedAccountIds,
    voiceEnabled,
    voicePolicyLoaded
  }
}

test('selectVoiceTopology applies connect/disconnect hysteresis symmetrically', () => {
  const players = [
    voicePlayer('a', 1, 0, 0),
    voicePlayer('b', 2, 20, 0)
  ]
  const config = { maxPeers: 4, connectDistance: 18, disconnectDistance: 22 }

  assert.deepEqual(selectVoiceTopology(players, [], config), [])
  assert.deepEqual(
    selectVoiceTopology(players, [{ a: 'a', b: 'b', linkId: 'existing' }], config),
    [{ a: 'a', b: 'b' }]
  )
  players[1].x = 22.1
  assert.deepEqual(
    selectVoiceTopology(players, [{ a: 'a', b: 'b', linkId: 'existing' }], config),
    []
  )
})

test('selectVoiceTopology enforces visibility, bilateral blocks, and peer caps', () => {
  const blocked = [
    voicePlayer('a', 1, 0, 0, { blockedAccountIds: new Set([2]) }),
    voicePlayer('b', 2, 1, 0)
  ]
  assert.deepEqual(selectVoiceTopology(blocked), [])

  const splitApartment = [
    voicePlayer('a', 1, 0, 0, { zone: 'apartment', apartmentOwnerId: 1 }),
    voicePlayer('b', 2, 1, 0, { zone: 'apartment', apartmentOwnerId: 2 })
  ]
  assert.deepEqual(selectVoiceTopology(splitApartment), [])

  const crowded = Array.from(
    { length: 6 },
    (_, index) => voicePlayer(String.fromCharCode(97 + index), index + 1, 0, 0)
  )
  const links = selectVoiceTopology(crowded, [], {
    maxPeers: 2,
    connectDistance: 18,
    disconnectDistance: 22
  })
  const degree = new Map(crowded.map((player) => [player.sessionId, 0]))
  for (const link of links) {
    degree.set(link.a, degree.get(link.a) + 1)
    degree.set(link.b, degree.get(link.b) + 1)
  }
  assert.ok([...degree.values()].every((value) => value <= 2))
  assert.ok(links.every((link) => link.a.localeCompare(link.b) < 0))
})

test('validateVoiceSignal accepts bounded descriptions and ICE candidates', () => {
  assert.deepEqual(validateVoiceSignal({
    targetSessionId: 'peer-b',
    linkId: 'link-1',
    kind: 'offer',
    description: { type: 'offer', sdp: 'v=0' }
  }), {
    ok: true,
    value: {
      targetSessionId: 'peer-b',
      linkId: 'link-1',
      kind: 'offer',
      description: { type: 'offer', sdp: 'v=0' }
    }
  })

  assert.equal(validateVoiceSignal({
    targetSessionId: 'peer-b',
    linkId: 'link-1',
    kind: 'ice',
    candidate: {
      candidate: 'candidate:1 1 UDP 1 127.0.0.1 9999 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
      usernameFragment: 'fragment'
    }
  }).ok, true)
  assert.equal(validateVoiceSignal({
    targetSessionId: 'peer-b',
    linkId: 'link-1',
    kind: 'ice',
    candidate: null
  }).ok, true)
})

test('validateVoiceSignal rejects mismatched, oversized, and unexpected data', () => {
  assert.equal(validateVoiceSignal({
    targetSessionId: 'peer-b',
    linkId: 'link-1',
    kind: 'answer',
    description: { type: 'offer', sdp: 'v=0' }
  }).ok, false)
  assert.equal(validateVoiceSignal({
    targetSessionId: 'peer-b',
    linkId: 'link-1',
    kind: 'offer',
    description: { type: 'offer', sdp: 'x'.repeat(65_537) }
  }).ok, false)
  assert.equal(validateVoiceSignal({
    targetSessionId: 'peer-b',
    linkId: 'link-1',
    kind: 'ice',
    candidate: { candidate: 'candidate', sdpMLineIndex: -1 }
  }).ok, false)
  assert.equal(validateVoiceSignal({
    targetSessionId: 'peer-b',
    linkId: 'link-1',
    kind: 'ice',
    candidate: null,
    fromSessionId: 'spoofed'
  }).ok, false)
})

test('Orb Rush progression uses horizontal hub and checkpoint pickup radii', () => {
  assert.equal(isInsideOrbRushHub(ORB_RUSH_HUB), true)
  assert.equal(isInsideOrbRushHub({
    x: ORB_RUSH_HUB.x + 7.01,
    z: ORB_RUSH_HUB.z
  }), false)

  assert.deepEqual(
    advanceOrbRushProgress(0, { x: ORB_RUSH_ROUTE[0].x + 2, z: ORB_RUSH_ROUTE[0].z }),
    {
      checkpointIndex: 0,
      advanced: false,
      finished: false,
      target: ORB_RUSH_ROUTE[0]
    }
  )
  assert.deepEqual(
    advanceOrbRushProgress(0, ORB_RUSH_ROUTE[0]),
    {
      checkpointIndex: 1,
      advanced: true,
      finished: false,
      target: ORB_RUSH_ROUTE[1]
    }
  )
  assert.deepEqual(
    advanceOrbRushProgress(ORB_RUSH_ROUTE.length - 1, ORB_RUSH_ROUTE.at(-1)),
    {
      checkpointIndex: ORB_RUSH_ROUTE.length,
      advanced: true,
      finished: true,
      target: null
    }
  )
})

test('Orb Rush gives solo and duel players fair deterministic start positions', () => {
  const solo = orbRushStartPosition(0, 1)
  assert.equal(solo.x, ORB_RUSH_HUB.x)
  assert.equal(solo.z, ORB_RUSH_HUB.z)

  const first = orbRushStartPosition(0, 2)
  const second = orbRushStartPosition(1, 2)
  const firstDistance = Math.hypot(
    first.x - ORB_RUSH_ROUTE[0].x,
    first.z - ORB_RUSH_ROUTE[0].z
  )
  const secondDistance = Math.hypot(
    second.x - ORB_RUSH_ROUTE[0].x,
    second.z - ORB_RUSH_ROUTE[0].z
  )
  assert.ok(Math.abs(firstDistance - secondDistance) < 1e-9)
  assert.ok(
    Math.abs(Math.hypot(first.x - second.x, first.z - second.z) - 1.5) <
      1e-9
  )
  assert.throws(
    () => orbRushStartPosition(2, 2),
    /invalid Orb Rush start slot/
  )
})

test('computeVisibilityTransition identifies scoped leave and join peers', () => {
  const players = [
    voicePlayer('self', 1, 0, 0, { zone: 'apartment', apartmentOwnerId: 8 }),
    voicePlayer('city-peer', 2, 0, 0),
    voicePlayer('apartment-peer', 3, 0, 0, { zone: 'apartment', apartmentOwnerId: 8 }),
    voicePlayer('other-apartment', 4, 0, 0, { zone: 'apartment', apartmentOwnerId: 9 })
  ]
  assert.deepEqual(
    computeVisibilityTransition('self', 'city', 'apartment:8', players),
    {
      lost: ['city-peer'],
      gained: ['apartment-peer'],
      stayed: []
    }
  )
})
