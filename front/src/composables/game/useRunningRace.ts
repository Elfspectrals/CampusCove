import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import {
  BOARD_RANGE_M,
  BREATHLESS_MS,
  LEAN_MS,
  RESULT_SHOWN_MS,
  WEEK_BOARD_RANGE_M,
  WEEK_BOARD_REFRESH_MS,
  type BoardSection,
  type ScoreboardSpot,
  cadenceBar,
  footOfButton,
  isRacing,
  liveBoardRows,
  myRunner,
  parseBoardIds,
  parseScoreboard,
  poseChange,
  predictPosition,
  relativeBearing,
  resultBoardRows,
  weekBoardSections,
  weekNumber,
} from '../../game/sports/runningRace'
import { fetchRunningBoards, type RunningBoardId, type RunningBoards } from '../../api/running'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import { playStartBeep } from '../../game/sports/startBeep'
import type { RacePose } from '../../avatar/glbCharacter'
import type { SportsRunResultPayload, SportsRunStatePayload } from '../../types/gameRealtime'

const LOOK_EMIT_MS = 50
const FOLLOW_RATE = 12
const SNAP_DISTANCE = 5

export interface RunningRaceDeps {
  gameRoomRef: ShallowRef<Room | null>
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  setLook: (yaw: number, pitch: number) => void
  onFinished: () => void
  onStep: (inRhythm: boolean) => void
  setRacePose: (sessionId: string, pose: RacePose | null) => void
}

export interface RunningBoard {
  x: number
  y: number
  kind: 'live' | 'result' | 'week'
  week: number | null
  sections: BoardSection[]
}

async function fetchScoreboard(): Promise<{ spot: ScoreboardSpot; boardIds: RunningBoardId[] }> {
  const url = sportRulesUrl('running')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const rules: unknown = await response.json()
  return { spot: parseScoreboard(rules), boardIds: parseBoardIds(rules) }
}

export function useRunningRace(deps: RunningRaceDeps) {
  const state = shallowRef<SportsRunStatePayload | null>(null)
  const result = shallowRef<SportsRunResultPayload | null>(null)
  const clockOffset = ref(0)
  const clientNow = ref(Date.now())
  const lastStepAt = ref<number | null>(null)
  const gateBearing = ref<number | null>(null)
  let receivedAt = 0
  let lastLookAt = 0
  let lastLookYaw = NaN
  let resultUntil = 0
  let lastFoot: string | null = null
  const board = shallowRef<RunningBoard | null>(null)
  const boardResult = shallowRef<SportsRunResultPayload | null>(null)
  let boardResultUntil = 0
  let spot: ScoreboardSpot | null = null
  let boardIds: RunningBoardId[] = []
  let spotLoading: Promise<void> | null = null
  const projection = new THREE.Vector3()
  const poseTimers = new Map<string, { next: 'breathless' | 'clear'; at: number }>()
  let weekBoards: RunningBoards | null = null
  let weekFetchedAt = -Infinity

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  const runner = computed(() => myRunner(state.value, mySessionId()))
  const racing = computed(() => isRacing(runner.value))

  function updatePoses(data: SportsRunStatePayload): void {
    const previous = new Map((state.value?.runners ?? []).map((r) => [r.sessionId, r.state]))
    for (const r of data.runners) {
      if (r.sessionId === mySessionId()) continue
      const change = poseChange(previous.get(r.sessionId), r.state)
      if (change === 'set') deps.setRacePose(r.sessionId, 'set')
      if (change === 'clear') {
        poseTimers.delete(r.sessionId)
        deps.setRacePose(r.sessionId, null)
      }
      if (change === 'lean') {
        deps.setRacePose(r.sessionId, 'lean')
        poseTimers.set(r.sessionId, { next: 'breathless', at: Date.now() + LEAN_MS })
      }
    }
  }

  function runPoseTimers(now: number): void {
    for (const [sessionId, timer] of poseTimers) {
      if (now < timer.at) continue
      if (timer.next === 'breathless') {
        deps.setRacePose(sessionId, 'breathless')
        poseTimers.set(sessionId, { next: 'clear', at: now + BREATHLESS_MS })
      } else {
        deps.setRacePose(sessionId, null)
        poseTimers.delete(sessionId)
      }
    }
  }

  function onState(data: SportsRunStatePayload): void {
    updatePoses(data)
    const before = myRunner(state.value, mySessionId())
    const now = myRunner(data, mySessionId())
    if (now && !before) {
      deps.setLook(now.ry, 0)
      lastStepAt.value = null
      lastFoot = null
      result.value = null
    }
    if (now && state.value?.phase !== 'running' && data.phase === 'running') playStartBeep()
    if (now?.state === 'finished' && before?.state === 'running') deps.onFinished()
    state.value = data
    clockOffset.value = data.serverNow - Date.now()
    receivedAt = performance.now()
  }

  function onResult(data: SportsRunResultPayload): void {
    const mine = data.results.some((r) => r.sessionId === mySessionId())
    state.value = null
    boardResult.value = data
    boardResultUntil = Date.now() + RESULT_SHOWN_MS
    if (!mine) return
    result.value = data
    resultUntil = Date.now() + RESULT_SHOWN_MS
  }

  function onMouseDown(e: MouseEvent): boolean {
    const room = deps.gameRoomRef.value
    const foot = footOfButton(e.button)
    if (!racing.value || !room || !foot) return false
    room.send('sports_run_step', { foot })
    const now = Date.now()
    const live = state.value
    const previous = lastStepAt.value
    const alternated = foot !== lastFoot
    deps.onStep(previous === null || (alternated && live !== null && cadenceBar(live.goodStepMs, live.toleranceMs, now - previous).inWindow))
    lastStepAt.value = now
    lastFoot = foot
    return true
  }

  function followServer(dt: number): void {
    const me = runner.value
    if (!me) return
    const target = predictPosition(me, performance.now() - receivedAt)
    const p = deps.myPosition
    if (Math.hypot(target.x - p.x, target.z - p.z) > SNAP_DISTANCE) {
      p.x = target.x
      p.z = target.z
      return
    }
    const k = Math.min(1, dt * FOLLOW_RATE)
    p.x += (target.x - p.x) * k
    p.z += (target.z - p.z) * k
  }

  function sendLook(): void {
    const room = deps.gameRoomRef.value
    const camera = deps.getCamera()
    const now = performance.now()
    if (!room || !camera || now - lastLookAt < LOOK_EMIT_MS || camera.rotation.y === lastLookYaw) return
    lastLookAt = now
    lastLookYaw = camera.rotation.y
    room.send('sports_run_look', { ry: camera.rotation.y })
  }

  function loadSpot(): void {
    spotLoading ??= fetchScoreboard().then(
      (loaded) => {
        spot = loaded.spot
        boardIds = loaded.boardIds
      },
      (err: unknown) => console.error('[running] scoreboard spot failed to load', err),
    )
  }

  function refreshWeek(now: number): void {
    if (now - weekFetchedAt < WEEK_BOARD_REFRESH_MS) return
    weekFetchedAt = now
    fetchRunningBoards(boardIds).then(
      (loaded) => {
        weekBoards = loaded
      },
      (err: unknown) => console.error('[running] weekly boards failed to load', err),
    )
  }

  function boardContent(distance: number): Omit<RunningBoard, 'x' | 'y'> | null {
    const live = state.value
    const final = boardResult.value
    if (live) return { kind: 'live', week: null, sections: [{ distanceM: live.distanceM, rows: liveBoardRows(live) }] }
    if (final) return { kind: 'result', week: null, sections: [{ distanceM: final.distanceM, rows: resultBoardRows(final) }] }
    if (distance > WEEK_BOARD_RANGE_M) return null
    refreshWeek(clientNow.value)
    return weekBoards ? { kind: 'week', week: weekNumber(weekBoards.week), sections: weekBoardSections(weekBoards) } : null
  }

  function updateBoard(): void {
    if (boardResult.value && clientNow.value > boardResultUntil) boardResult.value = null
    if (!spot) {
      loadSpot()
      board.value = null
      return
    }
    const distance = Math.hypot(spot.x - deps.myPosition.x, spot.z - deps.myPosition.z)
    const content = distance <= BOARD_RANGE_M ? boardContent(distance) : null
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!content || !camera || !canvas) {
      board.value = null
      return
    }
    projection.set(spot.x, spot.heightM, spot.z).project(camera)
    if (projection.z > 1) {
      board.value = null
      return
    }
    const rect = canvas.getBoundingClientRect()
    board.value = { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, ...content }
  }

  function tick(dt: number): void {
    clientNow.value = Date.now()
    if (result.value && clientNow.value > resultUntil) result.value = null
    runPoseTimers(clientNow.value)
    updateBoard()
    if (!racing.value) return
    followServer(dt)
    sendLook()
    const next = runner.value?.next
    const camera = deps.getCamera()
    gateBearing.value = next && camera ? relativeBearing(deps.myPosition.x, deps.myPosition.z, camera.rotation.y, next.x, next.z) : null
  }

  function onRoomJoined(): void {
    state.value = null
    result.value = null
    boardResult.value = null
  }

  return { state, result, runner, racing, clockOffset, clientNow, lastStepAt, gateBearing, board, onState, onResult, onMouseDown, onRoomJoined, tick }
}
