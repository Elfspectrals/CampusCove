import { computed, shallowRef, watch } from 'vue'
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
}

export function useGps(deps: GpsDeps) {
  const target = shallowRef<GpsPlace | null>(null)

  const atm = computed(() => nearestAtm(deps.atms().map(([x, , z]) => ({ x, z })), deps.player, deps.atmName()))
  const places = computed(() => placesByDistance(deps.markers(), atm.value, deps.player))

  function clearIfArrived(): void {
    if (!target.value || !hasArrived(target.value, deps.player)) return
    deps.say(deps.arrivedText(target.value.name))
    target.value = null
  }

  function follow(place: GpsPlace): void {
    target.value = place
    clearIfArrived()
  }

  function toggle(place: GpsPlace): void {
    if (target.value?.id === place.id) target.value = null
    else follow(place)
  }

  function routeToNearestAtm(): void {
    if (!atm.value) return deps.say(deps.noAtmText())
    follow(atm.value)
  }

  watch(() => [deps.player.x, deps.player.z], clearIfArrived)

  return { target, atm, places, toggle, routeToNearestAtm }
}
