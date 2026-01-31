import { createServer } from 'http'
import { Server } from 'socket.io'

const COLORS = [
  0xe94560, 0x0f3460, 0x533483, 0x00d9ff, 0x00ff88,
  0xffaa00, 0xff3366, 0x9d4edd, 0x06ffa5, 0xff6b35
]

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

const users = new Map() // socketId -> { id, pseudo, color, x, y, z }

function getColor(index) {
  return COLORS[index % COLORS.length]
}

io.on('connection', (socket) => {
  const { userId, pseudo } = socket.handshake.auth || {}
  const id = userId || socket.id
  const color = getColor(users.size)
  const user = {
    id: String(id),
    pseudo: pseudo || `User_${socket.id.slice(0, 6)}`,
    color,
    x: 0,
    y: 1.6,
    z: 0
  }
  users.set(socket.id, user)
  socket.emit('me', { socketId: socket.id, ...user })
  io.emit('user_joined', {
    socketId: socket.id,
    ...user
  })
  socket.emit('users', Array.from(users.entries()).map(([sid, u]) => ({
    socketId: sid,
    ...u
  })).filter(u => u.socketId !== socket.id))

  socket.on('move', (pos) => {
    const u = users.get(socket.id)
    if (u) {
      u.x = pos.x ?? u.x
      u.y = pos.y ?? u.y
      u.z = pos.z ?? u.z
      socket.broadcast.emit('user_moved', { socketId: socket.id, ...u })
    }
  })

  socket.on('disconnect', () => {
    const u = users.get(socket.id)
    users.delete(socket.id)
    if (u) io.emit('user_left', { socketId: socket.id })
  })
})

const PORT = parseInt(process.env.PORT || '3000', 10)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.io server on port ${PORT}`)
})
