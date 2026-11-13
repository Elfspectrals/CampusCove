import { callRealtimeBackend } from './backend.ts'
import type { Player } from './types.ts'
import { worldZoneKeysAt } from './world.ts'

export const ACTIVE_WINDOW_MS = 60_000
export const ACTIVE_MIN_DISTANCE_M = 2
export const ACTIVE_MINUTES_PER_DAY = 10

export interface ActivityDay {
  day: string
  minutes: number
  windowStart: number
  distance: number
  reported: boolean
}

const parisDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

export function parisDay(now: number): string {
  return parisDayFormat.format(now)
}

export function trackActivity(previous: ActivityDay | undefined, now: number, distance: number): ActivityDay {
  const day = parisDay(now)
  const state = previous?.day === day ? { ...previous } : { day, minutes: 0, windowStart: now, distance: 0, reported: false }
  state.distance += distance
  if (now - state.windowStart >= ACTIVE_WINDOW_MS) {
    if (state.distance >= ACTIVE_MIN_DISTANCE_M) state.minutes += 1
    state.windowStart = now
    state.distance = 0
  }
  return state
}

export function isActiveDayToReport(state: ActivityDay): boolean {
  return state.minutes >= ACTIVE_MINUTES_PER_DAY && !state.reported
}

const activityByAccount = new Map<number, ActivityDay>()
const zonesReportedByAccount = new Map<number, Set<string>>()

function warn(context: string, error: unknown): void {
  console.warn(`[tasks] ${context}:`, error instanceof Error ? error.message : error)
}

function reportNewZones(player: Player): void {
  const reported = zonesReportedByAccount.get(player.accountId) ?? new Set<string>()
  zonesReportedByAccount.set(player.accountId, reported)
  for (const zone of worldZoneKeysAt(player.x, player.z)) {
    if (reported.has(zone)) continue
    reported.add(zone)
    callRealtimeBackend(player.token, '/tasks/zone-visited', 'POST', { zone }).catch((error: unknown) => {
      reported.delete(zone)
      warn(`zone ${zone} not counted`, error)
    })
  }
}

function reportActivity(player: Player, distance: number, now: number): void {
  const state = trackActivity(activityByAccount.get(player.accountId), now, distance)
  activityByAccount.set(player.accountId, state)
  if (!isActiveDayToReport(state)) return
  state.reported = true
  callRealtimeBackend(player.token, '/tasks/active-day', 'POST').catch((error: unknown) => {
    state.reported = false
    warn('active day not counted', error)
  })
}

export function onTaskMove(player: Player, distance: number, now: number): void {
  if (player.token === null) return
  reportNewZones(player)
  reportActivity(player, distance, now)
}
