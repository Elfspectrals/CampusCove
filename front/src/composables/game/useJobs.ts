import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { actionKeyLabels, matches } from '../../config/keybindings'
import { i18n } from '../../i18n'
import { aimedStation, salaryPerMinute, stationPose, workingEye, workingLook, type ShiftClock } from '../../game/jobs/stations'
import type { JobStation, WorldManifest } from '../../game/world/worldManifest'
import type {
  JobEndedPayload,
  JobErrorPayload,
  JobPaidPayload,
  JobPaymentDelayedPayload,
  JobStartedPayload,
  UserWorkingPayload,
} from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'
import type { SeatPose } from './useRemoteAvatars'

/** The prompt floats this high above the desk's screen point. */
const PROMPT_ABOVE_SCREEN = 0.45
/** At most one "you are working" hint every this many ms when a walking key is pressed at the desk. */
const STILL_WORKING_HINT_MS = 4000
/** Ends where the server already put the player somewhere else (or no longer at the desk): no stand-up step. */
const ENDS_WITHOUT_STANDING: readonly JobEndedPayload['reason'][] = ['teleported', 'knocked_out', 'disconnected', 'replaced']

type Point = { x: number; y: number; z: number }

/** A shift as the panel shows it: the coins and the clock come from the server's messages only. */
export interface WorkShift {
  station: JobStation
  jobName: string
  salaryCoins: number
  salaryPerMinute: number
  earned: number
  clock: ShiftClock
  paymentDelayed: boolean
  /** Last paid period, to replay the "+coins" pop. */
  lastPaid: { period: number; coins: number } | null
}

/** A taken desk the player looks at: who works there, projected over the desk. */
export interface DeskTag {
  x: number
  y: number
  label: string
}

export interface JobsDeps {
  myPosition: Point
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  /** Not knocked out, recovering, seated at the pub or in a pub game. */
  canWork: () => boolean
  pseudoOf: (sessionId: string) => string | null
  teleport: (x: number, y: number, z: number) => void
  setLook: (yaw: number, pitch: number) => void
  say: (text: string) => void
}

const t = (key: string, values?: Record<string, unknown>) => (values ? i18n.global.t(key, values) : i18n.global.t(key))

/**
 * Paid jobs (docs/JOBS.md): the prompt on the desk the player aims at, job_start / job_stop to the server, the
 * camera resting on the chair, the panel's state, and who works at which desk (other players are sat down too).
 * The server decides everything: this only shows what it said.
 */
export function useJobs(deps: JobsDeps) {
  let stations: JobStation[] = []
  const stationBySession = new Map<string, string>()
  const occupantByStation = new Map<string, string>()
  const shift = shallowRef<WorkShift | null>(null)
  /** A job_start sent and not answered yet: movement stays locked, the camera already sits. */
  const pending = ref<JobStation | null>(null)
  const deskTag = ref<DeskTag | null>(null)
  const working = computed(() => shift.value !== null)
  const busy = computed(() => shift.value !== null || pending.value !== null)
  const leaveKey = computed(() => actionKeyLabels('leaveJob')[0] ?? '?')
  let standingAt: Point | null = null
  let lastStillWorkingHintAt = 0
  const projection = new THREE.Vector3()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')

  function onTownLoaded(manifest: WorldManifest): void {
    stations = manifest.jobs?.stations ?? []
  }

  function stationById(stationId: string | null | undefined): JobStation | null {
    return stations.find((s) => s.id === stationId) ?? null
  }

  /** Where an avatar working at `stationId` sits (null: not working). */
  function stationPoseOf(stationId: string | null | undefined): SeatPose | null {
    const station = stationById(stationId)
    return station ? stationPose(station) : null
  }

  /** 'user_working' (and the stationId of init / user_joined): who works where. */
  function onWorking(data: UserWorkingPayload): void {
    const previous = stationBySession.get(data.sessionId)
    if (previous && occupantByStation.get(previous) === data.sessionId) occupantByStation.delete(previous)
    if (data.stationId) {
      stationBySession.set(data.sessionId, data.stationId)
      occupantByStation.set(data.stationId, data.sessionId)
    } else {
      stationBySession.delete(data.sessionId)
    }
  }

  function forget(sessionId: string): void {
    onWorking({ sessionId, stationId: null })
  }

  function cameraYaw(): number {
    const camera = deps.getCamera()
    if (!camera) return 0
    return euler.setFromQuaternion(camera.quaternion, 'YXZ').y
  }

  function aimed(): JobStation | null {
    return aimedStation(deps.myPosition, cameraYaw(), stations)
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

  function screenAbove(station: JobStation): { x: number; y: number } | null {
    const [x, y, z] = station.lookAt
    return projectToScreen(x, y + PROMPT_ABOVE_SCREEN, z)
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || busy.value || !deps.canWork()) return null
    const station = aimed()
    if (!station || occupantByStation.has(station.id)) return null
    const screen = screenAbove(station)
    return screen && { ...screen, action: t('jobs.startWorking'), detail: `${t(`jobs.names.${station.job}`)} · ${t(`jobs.buildings.${station.building}`)}` }
  }

  /** Every frame: the "taken" tag over the desk the player looks at, if someone works there. */
  function updateDeskTag(): void {
    const station = deps.promptsHidden() || busy.value ? null : aimed()
    const occupant = station ? occupantByStation.get(station.id) : undefined
    const screen = station && occupant ? screenAbove(station) : null
    if (!screen) {
      deskTag.value = null
      return
    }
    const name = deps.pseudoOf(occupant!)
    deskTag.value = { ...screen, label: name ? t('jobs.occupiedBy', { name }) : t('jobs.occupied') }
  }

  function sitAt(station: JobStation): void {
    const eye = workingEye(station)
    deps.teleport(eye.x, eye.y, eye.z)
    const look = workingLook(station)
    deps.setLook(look.yaw, look.pitch)
  }

  function standUp(): void {
    if (standingAt) deps.teleport(standingAt.x, standingAt.y, standingAt.z)
    standingAt = null
  }

  /** Interact on a free desk: ask the server; the camera sits at once (like the pub seats) and stands back if refused. */
  function start(): boolean {
    if (busy.value || !deps.canWork()) return false
    const station = aimed()
    const room = deps.gameRoomRef.value
    if (!station || !room || occupantByStation.has(station.id)) return false
    room.send('job_start', { stationId: station.id })
    pending.value = station
    standingAt = { ...deps.myPosition }
    sitAt(station)
    return true
  }

  /** Leave the desk (key or panel button). */
  function stop(): boolean {
    if (!shift.value && !pending.value) return false
    deps.gameRoomRef.value?.send('job_stop')
    shift.value = null
    pending.value = null
    standUp()
    return true
  }

  function onStarted(data: JobStartedPayload): void {
    const station = stationById(data.stationId)
    pending.value = null
    if (!station) return
    deps.teleport(data.x, data.y, data.z)
    shift.value = {
      station,
      jobName: t(`jobs.names.${data.job}`),
      salaryCoins: data.salaryCoins,
      salaryPerMinute: salaryPerMinute(data.salaryCoins, data.periodMs),
      earned: 0,
      clock: { periodMs: data.periodMs, workedMs: data.workedMs, syncedAt: performance.now() },
      paymentDelayed: false,
      lastPaid: null,
    }
  }

  function onPaid(data: JobPaidPayload): void {
    if (data.balanceAfter !== null) applyCachedBalanceAfterPurchase('coins', data.balanceAfter)
    const current = shift.value
    if (!current) return
    shift.value = {
      ...current,
      earned: data.earned,
      clock: { periodMs: current.clock.periodMs, workedMs: data.workedMs, syncedAt: performance.now() },
      paymentDelayed: false,
      lastPaid: { period: data.period, coins: data.coins },
    }
  }

  function onPaymentDelayed(_data: JobPaymentDelayedPayload): void {
    if (shift.value) shift.value = { ...shift.value, paymentDelayed: true }
  }

  function onEnded(data: JobEndedPayload): void {
    const wasHere = shift.value !== null || pending.value !== null
    shift.value = null
    pending.value = null
    if (!wasHere) return
    if (ENDS_WITHOUT_STANDING.includes(data.reason)) standingAt = null
    else standUp()
    if (data.reason !== 'stopped' && data.reason !== 'disconnected' && data.reason !== 'replaced') deps.say(t(`jobs.ended.${data.reason}`))
  }

  function onError(data: JobErrorPayload): void {
    if (!pending.value) return
    pending.value = null
    standUp()
    deps.say(data.code === 'station_taken' && data.occupant ? t('jobs.occupiedBy', { name: data.occupant }) : data.message)
  }

  /** The room was lost: nothing runs on the server anymore. */
  function onRoomLeft(): void {
    shift.value = null
    pending.value = null
    standingAt = null
    stationBySession.clear()
    occupantByStation.clear()
  }

  /** The leave key ends the shift; walking keys only remind how to leave (no involuntary quit). */
  function onKeyDown(e: KeyboardEvent): boolean {
    if (!busy.value) return false
    if (matches('leaveJob', e.code)) {
      if (!e.repeat) stop()
      e.preventDefault()
      return true
    }
    const walks = (['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump'] as const).some((action) => matches(action, e.code))
    if (walks && !e.repeat && performance.now() - lastStillWorkingHintAt > STILL_WORKING_HINT_MS) {
      lastStillWorkingHintAt = performance.now()
      deps.say(t('jobs.stillWorking', { key: leaveKey.value }))
    }
    return false
  }

  const source: InteractionSource = { prompt, interact: start }

  return {
    working,
    busy,
    shift,
    deskTag,
    leaveKey,
    onTownLoaded,
    stationPose: stationPoseOf,
    updateDeskTag,
    stop,
    onKeyDown,
    source,
    handlers: { onWorking, forget, onStarted, onPaid, onPaymentDelayed, onEnded, onError, onRoomLeft },
  }
}
