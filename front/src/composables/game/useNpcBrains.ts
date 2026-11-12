import { onUnmounted } from 'vue'
import type * as THREE from 'three'
import { setAvatarEating, setAvatarPicking, setAvatarSeated, updateAvatarAnimation } from '../../avatar/glbCharacter'
import { createChatBubble, type ChatBubble } from '../../game/chatBubble'
import { npcPoseAt, turnTowards } from '../../game/npcBehavior/npcMotion'
import type { NpcStatePayload } from '../../types/gameRealtime'

const TURN_RAD_PER_S = 8

export interface NpcBrainsDeps {
  /** The NPC's figure once its zone is loaded, handed over to this driver (useZoneDecor.driveNpc). */
  driveNpc: (id: string) => THREE.Object3D | null
  releaseNpc: (id: string) => void
}

interface Driven {
  state: NpcStatePayload
  receivedAt: number
  object: THREE.Object3D | null
  appliedSeq: number
  bubble: ChatBubble | null
  bubbleText: string | null
}

/**
 * Shows the NPCs whose behavior tree runs on the socket (docs/NPC_BEHAVIOR.md): glides them along the server's
 * moves, plays its clips and speech bubbles. Decides nothing.
 */
export function useNpcBrains(deps: NpcBrainsDeps) {
  const driven = new Map<string, Driven>()

  function clearBubble(d: Driven): void {
    d.bubble?.dispose()
    d.bubble = null
    d.bubbleText = null
  }

  function release(id: string): void {
    const d = driven.get(id)
    if (!d) return
    clearBubble(d)
    driven.delete(id)
    deps.releaseNpc(id)
  }

  function onState(state: NpcStatePayload): void {
    const d = driven.get(state.id)
    if (d) {
      d.state = state
      d.receivedAt = performance.now()
      return
    }
    driven.set(state.id, { state, receivedAt: performance.now(), object: null, appliedSeq: -1, bubble: null, bubbleText: null })
  }

  function onSnapshot(payload: { npcs?: NpcStatePayload[] }): void {
    const npcs = Array.isArray(payload.npcs) ? payload.npcs : []
    const ids = new Set(npcs.map((n) => n.id))
    for (const id of [...driven.keys()]) if (!ids.has(id)) release(id)
    for (const state of npcs) onState(state)
  }

  function applyClip(d: Driven, object: THREE.Object3D): void {
    const { clip, clipSeq } = d.state
    setAvatarSeated(object, clip === 'sit')
    if (clip !== 'pick') setAvatarPicking(object, false)
    if (clipSeq === d.appliedSeq) return
    d.appliedSeq = clipSeq
    if (clip === 'pick') setAvatarPicking(object, true)
    else if (clip === 'eat' || clip === 'drink') setAvatarEating(object, clip)
  }

  function applyBubble(d: Driven, object: THREE.Object3D, dt: number): void {
    if (d.state.say !== d.bubbleText) {
      clearBubble(d)
      if (d.state.say) {
        d.bubble = createChatBubble(object, d.state.say)
        d.bubbleText = d.state.say
      }
    }
    if (d.bubble && !d.bubble.update(dt)) d.bubble = null
  }

  function tick(dt: number): void {
    const now = performance.now()
    for (const [id, d] of driven) {
      d.object ??= deps.driveNpc(id)
      const object = d.object
      if (!object) continue
      const pose = npcPoseAt(d.state, now - d.receivedAt)
      object.position.set(pose.x, pose.y, pose.z)
      object.rotation.y = turnTowards(object.rotation.y, d.state.ry, TURN_RAD_PER_S * dt)
      applyClip(d, object)
      applyBubble(d, object, dt)
      if (object.parent?.visible) updateAvatarAnimation(object, dt, pose.speed)
    }
  }

  function clear(): void {
    for (const id of [...driven.keys()]) release(id)
  }

  onUnmounted(clear)

  return { tick, handlers: { onSnapshot, onState } }
}
