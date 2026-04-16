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

/** @type {Map<string, { id: string, pseudo: string, color: number, x: number, y: number, z: number, appearance: Record<string, number|null>, appearanceCodes: Record<string, string|null>, slotHexes: Record<string, string> }>} */
const users = new Map()

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

function normalizeAppearanceCodes(raw) {
  const out = {}
  for (const s of SLOTS) {
    const c = raw && Object.prototype.hasOwnProperty.call(raw, s) ? raw[s] : null
    out[s] = typeof c === 'string' && c.length > 0 ? c : null
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
    appearanceCodes: u.appearanceCodes,
    slotHexes: u.slotHexes
  }
}

io.on('connection', (socket) => {
  const room = io.sockets.adapter.rooms.get(GAME_ROOM)
  const inRoom = room ? room.size : 0
  if (inRoom >= MAX_PLAYERS) {
    socket.emit('room_full', { room: GAME_ROOM, max: MAX_PLAYERS })
    socket.disconnect(true)
    return
  }

  const {
    userId,
    pseudo,
    appearance: rawAppearance,
    appearanceCodes: rawCodes,
    slotHexes: rawHexes
  } = socket.handshake.auth || {}
  const id = userId || socket.id
  const color = getColor(users.size)
  const user = {
    id: String(id),
    pseudo: pseudo || `User_${socket.id.slice(0, 6)}`,
    color,
    x: 0,
    y: 1.6,
    z: 0,
    appearance: normalizeAppearanceIds(rawAppearance),
    appearanceCodes: normalizeAppearanceCodes(rawCodes),
    slotHexes: normalizeSlotHexes(rawHexes)
  }
  users.set(socket.id, user)
  socket.join(GAME_ROOM)

  socket.emit('me', publicUser(socket.id, user))

  socket.to(GAME_ROOM).emit('user_joined', publicUser(socket.id, user))

  const others = []
  const roomSet = io.sockets.adapter.rooms.get(GAME_ROOM)
  if (roomSet) {
    for (const sid of roomSet) {
      if (sid === socket.id) continue
      const u = users.get(sid)
      if (u) others.push(publicUser(sid, u))
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
    const codes = payload && payload.codes ? payload.codes : {}
    const hexes = payload && payload.slotHexes ? payload.slotHexes : {}
    u.appearance = normalizeAppearanceIds(slots)
    u.appearanceCodes = normalizeAppearanceCodes(codes)
    u.slotHexes = normalizeSlotHexes(hexes)
    io.to(GAME_ROOM).emit('appearance_updated', {
      socketId: socket.id,
      appearance: { ...u.appearance },
      appearanceCodes: { ...u.appearanceCodes },
      slotHexes: { ...u.slotHexes }
    })
  })

  socket.on('disconnect', () => {
    const u = users.get(socket.id)
    users.delete(socket.id)
    if (u) io.to(GAME_ROOM).emit('user_left', { socketId: socket.id })
  })
})

const PORT = parseInt(process.env.PORT || '3000', 10)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.io server on port ${PORT} (room ${GAME_ROOM}, max ${MAX_PLAYERS})`)
})
