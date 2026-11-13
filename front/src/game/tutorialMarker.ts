import type { TutorialStep } from '../api/tutorial.ts'
import type { Vec3 } from './mallTemplates/mallTemplate.ts'

export interface TutorialPlaces {
  trees: readonly Vec3[]
  farmer: Vec3 | null
  atms: readonly Vec3[]
  dartsOche: Vec3 | null
}

export interface ScreenMarker {
  x: number
  y: number
  onScreen: boolean
  angle: number
}

function horizontalDistance(from: { x: number; z: number }, to: Vec3): number {
  return Math.hypot(to[0] - from.x, to[2] - from.z)
}

function nearest(from: { x: number; z: number }, places: readonly Vec3[]): Vec3 | null {
  let best: Vec3 | null = null
  for (const place of places) {
    if (!best || horizontalDistance(from, place) < horizontalDistance(from, best)) best = place
  }
  return best
}

export function tutorialTarget(step: TutorialStep, player: { x: number; z: number }, places: TutorialPlaces): Vec3 | null {
  switch (step) {
    case 'pick_apples':
      return nearest(player, places.trees)
    case 'eat_apple':
      return null
    case 'sell_apples':
      return places.farmer
    case 'deposit_cash':
      return nearest(player, places.atms)
    case 'play_darts':
      return places.dartsOche
  }
}

export function metresTo(player: { x: number; z: number }, target: Vec3): number {
  return Math.round(horizontalDistance(player, target))
}

export function screenMarker(ndc: { x: number; y: number; z: number }, viewport: { width: number; height: number }, margin: number): ScreenMarker {
  const behind = ndc.z > 1
  const dirX = behind ? -ndc.x : ndc.x
  const dirY = behind ? -ndc.y : ndc.y
  const toPixels = (u: number, v: number) => ({ x: (u * 0.5 + 0.5) * viewport.width, y: (-v * 0.5 + 0.5) * viewport.height })
  if (!behind && Math.abs(dirX) <= 1 && Math.abs(dirY) <= 1) {
    return { ...toPixels(dirX, dirY), onScreen: true, angle: 0 }
  }
  const reach = Math.max(Math.abs(dirX), Math.abs(dirY)) || 1
  const edge = toPixels(dirX / reach, dirY / reach)
  return {
    x: Math.min(Math.max(edge.x, margin), viewport.width - margin),
    y: Math.min(Math.max(edge.y, margin), viewport.height - margin),
    onScreen: false,
    angle: Math.atan2(-dirY, dirX),
  }
}
