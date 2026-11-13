// HTTP routes only the Laravel API calls (X-Realtime-Secret), for changes made outside the game: an admin
// kicking an owner or a key holder must stop doors and locks treating them as one at once, not at the next poll.
import { createHash, timingSafeEqual } from 'node:crypto'
import { createEndpoint, createRouter, matchMaker } from 'colyseus'
import { REALTIME_SHARED_SECRET } from './config.ts'
import { parseTaskTierReached, type TaskTierReached } from './tasks.ts'
import { parseTutorialChange, type TutorialChange } from './tutorial.ts'

interface HousingAware {
  onHousingChanged(): Promise<void>
}

interface BanAware {
  onIpBanned(ip: string): void
}

interface TaskAware {
  onTaskTierReached(reached: TaskTierReached): void
}

interface TutorialAware {
  onTutorialChanged(change: TutorialChange): void
}

const digest = (value: string) => createHash('sha256').update(value).digest()

export function isRealtimeSecret(given: string | null): boolean {
  if (!REALTIME_SHARED_SECRET || !given) return false
  return timingSafeEqual(digest(given), digest(REALTIME_SHARED_SECRET))
}

const housingChanged = createEndpoint('/internal/housing-changed', { method: 'POST' }, async (ctx) => {
  if (!isRealtimeSecret(ctx.request?.headers.get('x-realtime-secret') ?? null)) throw ctx.error(403)
  const rooms = await matchMaker.query({ name: 'city' })
  // Answer first: the reload calls the API back, which must not wait on the API request that called us.
  for (const cached of rooms) {
    const room = matchMaker.getLocalRoomById(cached.roomId) as unknown as HousingAware | undefined
    void room?.onHousingChanged()
  }
  return Response.json({ ok: true })
})

const ipBanned = createEndpoint('/internal/ip-banned', { method: 'POST' }, async (ctx) => {
  if (!isRealtimeSecret(ctx.request?.headers.get('x-realtime-secret') ?? null)) throw ctx.error(403)
  const ip = (ctx.body as { ip?: unknown } | undefined)?.ip
  if (typeof ip !== 'string' || ip === '') throw ctx.error(422)
  const rooms = await matchMaker.query({ name: 'city' })
  for (const cached of rooms) {
    const room = matchMaker.getLocalRoomById(cached.roomId) as unknown as BanAware | undefined
    room?.onIpBanned(ip)
  }
  return Response.json({ ok: true })
})

const taskTierReached = createEndpoint('/internal/task-tier-reached', { method: 'POST' }, async (ctx) => {
  if (!isRealtimeSecret(ctx.request?.headers.get('x-realtime-secret') ?? null)) throw ctx.error(403)
  const reached = parseTaskTierReached(ctx.body)
  if (reached === null) throw ctx.error(422)
  const rooms = await matchMaker.query({ name: 'city' })
  for (const cached of rooms) {
    const room = matchMaker.getLocalRoomById(cached.roomId) as unknown as TaskAware | undefined
    room?.onTaskTierReached(reached)
  }
  return Response.json({ ok: true })
})

const tutorialChanged = createEndpoint('/internal/tutorial-changed', { method: 'POST' }, async (ctx) => {
  if (!isRealtimeSecret(ctx.request?.headers.get('x-realtime-secret') ?? null)) throw ctx.error(403)
  const change = parseTutorialChange(ctx.body)
  if (change === null) throw ctx.error(422)
  const rooms = await matchMaker.query({ name: 'city' })
  for (const cached of rooms) {
    const room = matchMaker.getLocalRoomById(cached.roomId) as unknown as TutorialAware | undefined
    room?.onTutorialChanged(change)
  }
  return Response.json({ ok: true })
})

export const internalRoutes = createRouter({ housingChanged, ipBanned, taskTierReached, tutorialChanged })
