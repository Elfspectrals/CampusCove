import { computed, shallowRef } from 'vue'
import type * as THREE from 'three'
import { hasArrived, nearestAtm, placesByDistance, type GpsPlace } from '../../game/watch/gps'
import type { Vec3 } from '../../game/mallTemplates/mallTemplate'
import type { MapMarker } from '../../game/world/minimap'

export interface GpsDeps {
  markers: () => MapMarker[]
  atms: () => Vec3[]
  player: { x: number; z: number; heading: number }
  atmName: () => string
  say: (text: string) => void
  arrivedText: (name: string) => string
  noAtmText: () => string
  positionOf: (sessionId: string) => THREE.Vector3 | null
  leftText: (name: string) => string
}

const TICK_MS = 200

export function useGps(deps: GpsDeps) {
  const target = shallowRef<GpsPlace | null>(null)
  let followedSession: string | null = null
  let lastTick = 0

  const atm = computed(() => nearestAtm(deps.atms().map(([x, , z]) => ({ x, z })), deps.player, deps.atmName()))
  const places = computed(() => placesByDistance(deps.markers(), atm.value, deps.player))

  function clearIfArrived(): void {
    if (!target.value || !hasArrived(target.value, deps.player)) return
    deps.say(deps.arrivedText(target.value.name))
    target.value = null
  }

  function follow(place: GpsPlace): void {
    followedSession = null
    target.value = place
    clearIfArrived()
  }

  function toggle(place: GpsPlace): void {
    if (target.value?.id === place.id) target.value = null
    else follow(place)
  }

  function followedPlace(sessionId: string, name: string): GpsPlace | null {
    const position = deps.positionOf(sessionId)
    return position ? { id: `friend:${sessionId}`, kind: 'friend', name, x: position.x, z: position.z } : null
  }

  function togglePlayer(sessionId: string, name: string): void {
    const place = followedPlace(sessionId, name)
    if (!place) throw new Error(`[gps] no position for player ${sessionId}`)
    if (target.value?.id === place.id) return void (target.value = null)
    follow(place)
    if (target.value) followedSession = sessionId
  }

  function moveFollowedPlayer(): void {
    if (!followedSession || !target.value || target.value.id !== `friend:${followedSession}`) return
    const place = followedPlace(followedSession, target.value.name)
    if (place) target.value = place
    else {
      deps.say(deps.leftText(target.value.name))
      target.value = null
    }
  }

  function routeToNearestAtm(): void {
    if (!atm.value) return deps.say(deps.noAtmText())
    follow(atm.value)
  }

  function tick(): void {
    const now = performance.now()
    if (!target.value || now - lastTick < TICK_MS) return
    lastTick = now
    moveFollowedPlayer()
    clearIfArrived()
  }

  return { target, atm, places, toggle, togglePlayer, routeToNearestAtm, tick }
}
