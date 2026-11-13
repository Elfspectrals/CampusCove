import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { QUIZMASTER_REACH } from '../../game/gameRoomConstants'
import { isAimingAtNpc, standsOnFloor } from '../../game/pub/npcAim'
import type { PubLayout, WorldManifest } from '../../game/world/worldManifest'
import type { PubQuizAnnouncePayload, PubQuizCancelledPayload, PubQuizLobbyPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const NPC_PROMPT_HEIGHT = 2

export interface PubQuizDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  say: (text: string) => void
}

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function usePubQuiz(deps: PubQuizDeps) {
  const startsAt = ref<number | null>(null)
  const contestants = ref<PubQuizLobbyPayload['contestants']>([])
  let layout: PubLayout | null = null
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function joined(): boolean {
    const me = deps.gameRoomRef.value?.sessionId
    return contestants.value.some((c) => c.sessionId === me)
  }

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.pub ?? null
  }

  function onInit(quiz: PubQuizAnnouncePayload | null): void {
    startsAt.value = quiz?.startsAt ?? null
    contestants.value = []
  }

  function onAnnounce(data: PubQuizAnnouncePayload): void {
    const firstCall = startsAt.value !== data.startsAt
    startsAt.value = data.startsAt
    if (firstCall) contestants.value = []
    deps.say(`Pub quiz at The Salty Shamrock at ${clockTime(data.startsAt)}. Sign up with the quiz host.`)
  }

  function onLobby(data: PubQuizLobbyPayload): void {
    const wasIn = joined()
    startsAt.value = data.startsAt
    contestants.value = data.contestants
    if (!wasIn && joined()) deps.say(`You're in. The quiz starts at ${clockTime(data.startsAt)}. Stay in the pub.`)
  }

  function onCancelled(_data: PubQuizCancelledPayload): void {
    startsAt.value = null
    contestants.value = []
    deps.say('Quiz host: "Not enough of you tonight. Same time tomorrow!"')
  }

  function aimingAtHost(): boolean {
    const camera = deps.getCamera()
    if (!layout || !camera || !standsOnFloor(deps.myPosition.y, layout.quizmaster[1])) return false
    camera.getWorldDirection(forward)
    return isAimingAtNpc(deps.myPosition, forward, layout.quizmaster, QUIZMASTER_REACH)
  }

  function projectToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(x, y, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height }
  }

  function prompt(): ScreenPrompt | null {
    if (!layout || startsAt.value === null || joined() || deps.promptsHidden() || !aimingAtHost()) return null
    const [x, y, z] = layout.quizmaster
    const screen = projectToScreen(x, y + NPC_PROMPT_HEIGHT, z)
    return screen && { ...screen, action: 'Join the quiz', detail: `Starts at ${clockTime(startsAt.value)}` }
  }

  function interact(): boolean {
    if (!layout || startsAt.value === null || joined() || !aimingAtHost()) return false
    deps.gameRoomRef.value?.send('pub_quiz_join')
    return true
  }

  const source: InteractionSource = { prompt, interact }

  return {
    startsAt,
    contestants,
    onTownLoaded,
    source,
    handlers: { onInit, onAnnounce, onLobby, onCancelled },
  }
}
