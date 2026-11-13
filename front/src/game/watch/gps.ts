import type { MapMarker, MapMarkerKind } from '../world/minimap.ts'

const ARRIVAL_RADIUS_M = 8

const NEAREST_ATM_ID = 'atm'

export interface GpsPlace {
  id: string
  kind: MapMarkerKind | 'atm' | 'friend'
  name: string
  x: number
  z: number
}

export interface GpsPlaceAt extends GpsPlace {
  distance: number
}

type Ground = { x: number; z: number }

export function groundDistance(from: Ground, to: Ground): number {
  return Math.hypot(to.x - from.x, to.z - from.z)
}

export function nearestAtm(atms: readonly Ground[], me: Ground, name: string): GpsPlace | null {
  let best: Ground | null = null
  for (const atm of atms) if (!best || groundDistance(me, atm) < groundDistance(me, best)) best = atm
  return best ? { id: NEAREST_ATM_ID, kind: 'atm', name, x: best.x, z: best.z } : null
}

export function placesByDistance(markers: readonly MapMarker[], atm: GpsPlace | null, me: Ground): GpsPlaceAt[] {
  const places: GpsPlace[] = atm ? [atm, ...markers] : [...markers]
  return places.map((place) => ({ ...place, distance: groundDistance(me, place) })).sort((a, b) => a.distance - b.distance)
}

export function hasArrived(target: Ground, me: Ground): boolean {
  return groundDistance(me, target) <= ARRIVAL_RADIUS_M
}

export function relativeBearingDegrees(target: Ground, me: Ground & { heading: number }): number {
  const bearing = (Math.atan2(target.x - me.x, -(target.z - me.z)) * 180) / Math.PI
  return bearing - me.heading
}
