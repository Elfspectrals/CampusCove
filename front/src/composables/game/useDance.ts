import { computed, ref, shallowRef, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import {
  DANCE_LANES,
  danceBoardId,
  JUDGEMENT_SHOW_MS,
  LANE_FLASH_MS,
  fallingNotes,
  laneOfKey,
  songTimeMs,
  type DanceEnd,
  type DanceJudge,
  type DanceStart,
  type Judgement,
  type MoveAction,
} from '../../game/sports/danceHud'
import { startDanceMusic, type DanceMusic } from '../../game/sports/danceMusic'
import { fetchSportsBoard, type SportsBoard } from '../../api/sportsBoards'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import { yawTowards, type SportsView } from '../../game/camera/sportsCamera'

export interface DanceDeps {
  gameRoomRef: ShallowRef<Room | null>
  myPosition: { x: number; z: number }
  dancerPosition: (sessionId: string) => { x: number; z: number } | null
  isMoveKey: (action: MoveAction, code: string) => boolean
}

export interface DancerScore {
  sessionId: string
  name: string
  score: number
  combo: number
  me: boolean
}

export function useDance(deps: DanceDeps) {
  const start = shallowRef<DanceStart | null>(null)
  const result = shallowRef<DanceEnd | null>(null)
  const boards = shallowRef<{ solo: SportsBoard; team: SportsBoard } | null>(null)
  const boardsFailed = ref(false)
  const scores = shallowRef<ReadonlyMap<string, { score: number; combo: number }>>(new Map())
  const judged = shallowRef<ReadonlySet<number>>(new Set())
  const lastJudgement = shallowRef<{ judgement: Judgement; lane: number; at: number; synced: boolean } | null>(null)
  const teamScore = ref<number | null>(null)
  const clockOffset = ref(0)
  const clientNow = ref(Date.now())
  const pressedAt = ref<readonly number[]>(new Array(DANCE_LANES).fill(Number.NEGATIVE_INFINITY))
  let music: DanceMusic | null = null
  let coachX: number | null = null
  fetch(sportRulesUrl('dance'))
    .then((res) => {
      if (!res.ok) throw new Error(`${res.url} answered ${res.status}`)
      return res.json()
    })
    .then((rules: { venue?: { coach?: unknown } }) => {
      const coach = rules.venue?.coach
      if (!Array.isArray(coach) || typeof coach[0] !== 'number') throw new Error('dance rules: venue.coach must be [x, z]')
      coachX = coach[0]
    })
    .catch((error: unknown) => console.error('[dance] studio layout not loaded', error))

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  const dancing = computed(() => start.value !== null && result.value === null && start.value.dancers.some((d) => d.sessionId === mySessionId()))
  const songMs = computed(() => (start.value ? songTimeMs(start.value, clientNow.value, clockOffset.value) : 0))
  const notes = computed(() => (start.value && dancing.value ? fallingNotes(start.value.notes, songMs.value, judged.value) : []))
  const judgementShown = computed(() => (lastJudgement.value && clientNow.value - lastJudgement.value.at < JUDGEMENT_SHOW_MS ? lastJudgement.value : null))
  const board = computed<DancerScore[]>(() =>
    (start.value?.dancers ?? []).map((d) => ({ sessionId: d.sessionId, name: d.name, me: d.sessionId === mySessionId(), ...(scores.value.get(d.sessionId) ?? { score: 0, combo: 0 }) })),
  )
  const mine = computed(() => board.value.find((d) => d.me) ?? null)
  const litLanes = computed(() => pressedAt.value.map((at) => clientNow.value - at < LANE_FLASH_MS))

  function stopMusic(): void {
    music?.stop()
    music = null
  }

  function setScore(sessionId: string, score: number, combo: number): void {
    const next = new Map(scores.value)
    next.set(sessionId, { score, combo })
    scores.value = next
  }

  function onStart(data: DanceStart): void {
    stopMusic()
    start.value = data
    result.value = null
    scores.value = new Map()
    judged.value = new Set()
    lastJudgement.value = null
    teamScore.value = data.mode === 'team' ? 0 : null
    clockOffset.value = data.serverNow - Date.now()
    clientNow.value = Date.now()
    music = startDanceMusic(data.song, data.bpm, data.lengthMs, data.startAt - data.serverNow)
  }

  function onJudge(data: DanceJudge): void {
    if (!start.value) return
    setScore(data.sessionId, data.score, data.combo)
    if (data.teamScore !== null) teamScore.value = data.teamScore
    if (data.sessionId !== mySessionId()) return
    judged.value = new Set([...judged.value, data.index])
    lastJudgement.value = { judgement: data.judgement, lane: data.lane, at: clientNow.value, synced: data.synced }
    music?.hit(data.judgement)
  }

  function onStray(): void {
    const me = mySessionId()
    const current = me ? scores.value.get(me) : undefined
    if (me) setScore(me, current?.score ?? 0, 0)
  }

  function onEnd(data: DanceEnd): void {
    stopMusic()
    result.value = data
    for (const d of data.dancers) setScore(d.sessionId, d.score, 0)
    const played = start.value
    boards.value = null
    boardsFailed.value = false
    if (!played) return
    Promise.all([fetchSportsBoard(danceBoardId(played.song, played.difficulty, 'solo')), fetchSportsBoard(danceBoardId(played.song, played.difficulty, 'team'))])
      .then(([solo, team]) => {
        if (start.value === played) boards.value = { solo, team }
      })
      .catch((err: unknown) => {
        console.error('[dance] boards not loaded', err)
        boardsFailed.value = true
      })
  }

  function close(): void {
    stopMusic()
    start.value = null
    result.value = null
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (result.value && e.code === 'Escape') {
      close()
      return true
    }
    if (!dancing.value) return false
    const lane = laneOfKey(e.code, deps.isMoveKey)
    if (lane === null) return false
    e.preventDefault()
    if (e.repeat) return true
    pressedAt.value = pressedAt.value.map((at, i) => (i === lane ? Date.now() : at))
    deps.gameRoomRef.value?.send('dance_press', { lane })
    return true
  }

  function tick(): void {
    if (start.value) clientNow.value = Date.now()
  }

  function cameraView(): SportsView | null {
    if (!dancing.value || coachX === null) return null
    const me = mySessionId()
    const others = (start.value?.dancers ?? []).flatMap((d) => (d.sessionId === me ? [] : (deps.dancerPosition(d.sessionId) ?? [])))
    return { kind: 'stage', sport: 'dance', optional: false, facingYaw: yawTowards(deps.myPosition, { x: coachX, z: deps.myPosition.z }), others }
  }

  return {
    start,
    result,
    boards,
    boardsFailed,
    dancing,
    notes,
    songMs,
    board,
    mine,
    teamScore,
    judgementShown,
    litLanes,
    handlers: { onStart, onJudge, onStray, onEnd, onStop: close },
    onKeyDown,
    tick,
    close,
    cameraView,
  }
}
