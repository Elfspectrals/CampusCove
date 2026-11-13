import { shallowRef, type Ref } from 'vue'
import * as THREE from 'three'
import { HINT_DURATION_MS, nextHint, parseSeenHints, type HintKind, type HintPlaces } from '../../game/tutorialHints'
import type { Vec3 } from '../../game/mallTemplates/mallTemplate'

const BUBBLE_HEIGHT = 4.4

export interface TutorialHintsDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  accountId: () => number | null
  active: () => boolean
  places: () => HintPlaces
}

export function useTutorialHints(deps: TutorialHintsDeps) {
  const bubble = shallowRef<{ kind: HintKind; x: number; y: number } | null>(null)
  const projection = new THREE.Vector3()
  let showing: { kind: HintKind; at: Vec3; until: number } | null = null
  let seen: Set<HintKind> | null = null
  let seenFor: number | null = null

  const storageKey = (accountId: number) => `cc.tutorialHints.${accountId}`

  function seenHints(accountId: number): Set<HintKind> {
    if (seen && seenFor === accountId) return seen
    try {
      seen = parseSeenHints(window.localStorage.getItem(storageKey(accountId)))
    } catch (error) {
      console.warn('[tutorial] seen hints could not be read, showing them again', error)
      seen = new Set()
    }
    seenFor = accountId
    return seen
  }

  function markSeen(accountId: number, kind: HintKind): void {
    const hints = seenHints(accountId)
    hints.add(kind)
    try {
      window.localStorage.setItem(storageKey(accountId), JSON.stringify([...hints]))
    } catch (error) {
      console.warn('[tutorial] seen hints could not be saved', error)
    }
  }

  function tick(now = performance.now()): void {
    const accountId = deps.accountId()
    if (showing && now >= showing.until) showing = null
    if (!showing && accountId !== null && deps.active()) {
      const hint = nextHint(deps.myPosition, deps.places(), seenHints(accountId))
      if (hint) {
        showing = { ...hint, until: now + HINT_DURATION_MS }
        markSeen(accountId, hint.kind)
      }
    }
    bubble.value = showing && place(showing.kind, showing.at)
  }

  function place(kind: HintKind, at: Vec3): { kind: HintKind; x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(at[0], at[1] + BUBBLE_HEIGHT, at[2]).project(camera)
    if (projection.z > 1 || Math.abs(projection.x) > 1 || Math.abs(projection.y) > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { kind, x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height }
  }

  return { bubble, tick }
}
