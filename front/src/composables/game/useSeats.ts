import { computed, ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches } from '../../config/keybindings'
import { nearestFreeSeat, seatCameraYaw, seatedEye } from '../../game/pub/seats'
import type { PubSeat, WorldManifest } from '../../game/world/worldManifest'
import type { UserSeatedPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'
import type { SeatPose } from './useRemoteAvatars'

const SEAT_PROMPT_HEIGHT = 0.5

const SEAT_LABELS: Record<PubSeat['kind'], string> = {
  stool: 'Bar stool',
  chair: 'Chair',
  bench: 'Bench',
  armchair: 'Armchair',
  sofa: 'Sofa',
  garden: 'Picnic bench',
}

export interface SeatsDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  /** Knocked out or recovering: no sitting down. */
  canSit: () => boolean
  teleport: (x: number, y: number, z: number) => void
  setLook: (yaw: number, pitch: number) => void
}

/**
 * Sitting on the pub's seats: the prompt on the nearest free seat, `sit` / `stand` to the server, the camera
 * resting on the seat, and who sits where (so other players' avatars can be sat down too).
 */
export function useSeats(deps: SeatsDeps) {
  let seats: PubSeat[] = []
  const seatBySession = new Map<string, string>()
  const occupied = ref<Set<string>>(new Set())
  const mySeat = ref<PubSeat | null>(null)
  /** A `sit` sent and not yet confirmed by the server's `user_seated`. */
  let pendingSeatId: string | null = null
  let standingAt: { x: number; y: number; z: number } | null = null
  const seated = computed(() => mySeat.value !== null)
  const projection = new THREE.Vector3()

  function onTownLoaded(manifest: WorldManifest): void {
    seats = manifest.pub?.seats ?? []
  }

  function seatById(seatId: string | null | undefined): PubSeat | null {
    return seats.find((seat) => seat.id === seatId) ?? null
  }

  function seatPose(seatId: string | null | undefined): SeatPose | null {
    const seat = seatById(seatId)
    if (!seat) return null
    const [x, y, z] = seat.position
    return { x, y, z, yaw: seat.yaw }
  }

  function refreshOccupied(): void {
    occupied.value = new Set(seatBySession.values())
  }

  function onSeated(data: UserSeatedPayload, mySessionId: string): void {
    if (data.seatId) seatBySession.set(data.sessionId, data.seatId)
    else seatBySession.delete(data.sessionId)
    refreshOccupied()
    if (data.sessionId !== mySessionId) return
    pendingSeatId = null
    mySeat.value = seatById(data.seatId)
  }

  /** The server refused something at the pub while a `sit` was pending: back on our feet. */
  function onPubError(): void {
    if (pendingSeatId === null) return
    pendingSeatId = null
    mySeat.value = null
    if (standingAt) deps.teleport(standingAt.x, standingAt.y, standingAt.z)
    standingAt = null
  }

  function nearest(): PubSeat | null {
    return nearestFreeSeat(deps.myPosition, seats, occupied.value)
  }

  function sit(): boolean {
    if (mySeat.value || !deps.canSit()) return false
    const seat = nearest()
    if (!seat) return false
    deps.gameRoomRef.value?.send('sit', { seatId: seat.id })
    pendingSeatId = seat.id
    standingAt = { x: deps.myPosition.x, y: deps.myPosition.y, z: deps.myPosition.z }
    mySeat.value = seat
    const eye = seatedEye(seat)
    deps.teleport(eye.x, eye.y, eye.z)
    deps.setLook(seatCameraYaw(seat), 0)
    return true
  }

  function stand(): boolean {
    if (!mySeat.value) return false
    deps.gameRoomRef.value?.send('stand')
    pendingSeatId = null
    mySeat.value = null
    // Back where we sat down from: a booth seat sits inside its bench collider, standing in place would trap us.
    if (standingAt) deps.teleport(standingAt.x, standingAt.y, standingAt.z)
    standingAt = null
    return true
  }

  /** Any movement key or the jump stands the player up. */
  function onKeyDown(e: KeyboardEvent): boolean {
    if (!mySeat.value) return false
    const moves = (['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump'] as const).some((action) => matches(action, e.code))
    if (!moves) return false
    e.preventDefault()
    stand()
    return true
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
    if (deps.promptsHidden() || mySeat.value || !deps.canSit()) return null
    const seat = nearest()
    if (!seat) return null
    const [x, y, z] = seat.position
    const screen = projectToScreen(x, y + SEAT_PROMPT_HEIGHT, z)
    return screen && { ...screen, action: 'Sit', detail: SEAT_LABELS[seat.kind] }
  }

  const source: InteractionSource = { prompt, interact: sit }

  return { seated, mySeat, onTownLoaded, seatPose, onSeated, onPubError, stand, onKeyDown, source }
}
