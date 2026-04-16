import { createServer } from 'http'
import { Server } from 'socket.io'

const COLORS = [
  0xe94560, 0x0f3460, 0x533483, 0x00d9ff, 0x00ff88,
  0xffaa00, 0xff3366, 0x9d4edd, 0x06ffa5, 0xff6b35
]

const GAME_ROOM = 'campus'
const MAX_PLAYERS = 10

const SLOTS = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']

const DEFAULT_SLOT_HEX = {
  body: '#8B7AA8',
  hair: '#6B5B95',
  top: '#9B8ABF',
  bottom: '#5A4E72',
  shoes: '#4A3F62',
  head_accessory: '#7A6B94'
}

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

/** @type {Map<string, { id: string, pseudo: string, color: number, x: number, y: number, z: number, appearance: Record<string, number|null>, slotHexes: Record<string, string>, bodyModelGlb: string|null }>} */
const users = new Map()
/** @type {Map<string, string>} */
const activeUserSockets = new Map()

function getColor(index) {
  return COLORS[index % COLORS.length]
}

function normalizeAppearanceIds(raw) {
  const out = {}
  for (const s of SLOTS) {
    const v = raw && Object.prototype.hasOwnProperty.call(raw, s) ? raw[s] : null
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[s] = v
    } else {
      out[s] = null
    }
  }
  return out
}

function normalizeSlotHexes(raw) {
  const out = {}
  for (const s of SLOTS) {
    const v = raw && Object.prototype.hasOwnProperty.call(raw, s) ? raw[s] : null
    if (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)) {
      out[s] = v
    } else {
      out[s] = DEFAULT_SLOT_HEX[s]
    }
  }
  return out
}

function normalizeBodyModelGlb(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function publicUser(socketId, u) {
  return {
    socketId: socketId,
    id: u.id,
    pseudo: u.pseudo,
    color: u.color,
    x: u.x,
    y: u.y,
    z: u.z,
    appearance: u.appearance,
    slotHexes: u.slotHexes,
    bodyModelGlb: u.bodyModelGlb
  }
}

function disconnectSocketAsDuplicate(socketId, reasonUserId) {
  const duplicateUser = users.get(socketId)
  users.delete(socketId)
  const duplicateSocket = io.sockets.sockets.get(socketId)
  if (duplicateSocket) {
    duplicateSocket.disconnect(true)
  }
  if (duplicateUser) {
    io.to(GAME_ROOM).emit('user_left', { socketId })
  }
  console.log(`[socket] replaced stale socket ${socketId} for user ${reasonUserId}`)
}

io.on('connection', (socket) => {
  const {
    userId,
    pseudo,
    appearance: rawAppearance,
    slotHexes: rawHexes,
    bodyModelGlb: rawBodyModelGlb
  } = socket.handshake.auth || {}
  const id = userId || socket.id
  const normalizedUserId = String(id)

  const previousSocketId = activeUserSockets.get(normalizedUserId)
  if (previousSocketId && previousSocketId !== socket.id) {
    disconnectSocketAsDuplicate(previousSocketId, normalizedUserId)
  }

  // Defensive pass: handle stale duplicates even if activeUserSockets got out of sync.
  for (const [sid, existing] of users) {
    if (sid === socket.id) continue
    if (existing.id !== normalizedUserId) continue
    disconnectSocketAsDuplicate(sid, normalizedUserId)
  }

  const room = io.sockets.adapter.rooms.get(GAME_ROOM)
  const inRoom = room ? room.size : 0
  if (inRoom >= MAX_PLAYERS) {
    socket.emit('room_full', { room: GAME_ROOM, max: MAX_PLAYERS })
    socket.disconnect(true)
    return
  }

  const color = getColor(users.size)
  const user = {
    id: normalizedUserId,
    pseudo: pseudo || `User_${socket.id.slice(0, 6)}`,
    color,
    x: 0,
    y: 1.6,
    z: 0,
    appearance: normalizeAppearanceIds(rawAppearance),
    slotHexes: normalizeSlotHexes(rawHexes),
    bodyModelGlb: normalizeBodyModelGlb(rawBodyModelGlb)
  }
  users.set(socket.id, user)
  activeUserSockets.set(user.id, socket.id)
  socket.join(GAME_ROOM)

  socket.emit('me', publicUser(socket.id, user))

  socket.to(GAME_ROOM).emit('user_joined', publicUser(socket.id, user))

  const others = []
  const seenUserIds = new Set()
  const roomSet = io.sockets.adapter.rooms.get(GAME_ROOM)
  if (roomSet) {
    for (const sid of roomSet) {
      if (sid === socket.id) continue
      const u = users.get(sid)
      if (!u) continue
      if (seenUserIds.has(u.id)) {
        console.warn(`[socket] skipping duplicate room member for user id ${u.id} (socket ${sid})`)
        continue
      }
      seenUserIds.add(u.id)
      others.push(publicUser(sid, u))
    }
  }
  socket.emit('users', others)

  socket.on('move', (pos) => {
    const u = users.get(socket.id)
    if (u) {
      u.x = pos.x ?? u.x
      u.y = pos.y ?? u.y
      u.z = pos.z ?? u.z
      socket.to(GAME_ROOM).emit('user_moved', { socketId: socket.id, x: u.x, y: u.y, z: u.z })
    }
  })

  socket.on('appearance', (payload) => {
    const u = users.get(socket.id)
    if (!u) return
    const slots = payload && payload.slots ? payload.slots : payload
    const hexes = payload && payload.slotHexes ? payload.slotHexes : {}
    const bodyModelGlb = payload && Object.prototype.hasOwnProperty.call(payload, 'bodyModelGlb')
      ? payload.bodyModelGlb
      : null
    u.appearance = normalizeAppearanceIds(slots)
    u.slotHexes = normalizeSlotHexes(hexes)
    u.bodyModelGlb = normalizeBodyModelGlb(bodyModelGlb)
    io.to(GAME_ROOM).emit('appearance_updated', {
      socketId: socket.id,
      appearance: { ...u.appearance },
      slotHexes: { ...u.slotHexes },
      bodyModelGlb: u.bodyModelGlb
    })
  })

  socket.on('disconnect', () => {
    const u = users.get(socket.id)
    users.delete(socket.id)
    if (u && activeUserSockets.get(u.id) === socket.id) {
      activeUserSockets.delete(u.id)
    }
    if (u) io.to(GAME_ROOM).emit('user_left', { socketId: socket.id })
  })
})

const PORT = parseInt(process.env.PORT || '3000', 10)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.io server on port ${PORT} (room ${GAME_ROOM}, max ${MAX_PLAYERS})`)
})
