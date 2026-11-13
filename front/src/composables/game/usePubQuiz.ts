import { computed, ref, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { QUIZMASTER_REACH } from '../../game/gameRoomConstants'
import { isAimingAtNpc, standsOnFloor } from '../../game/pub/npcAim'
import { RESULT_LINGER_MS } from '../../game/pub/raceBoard'
import { choiceForKey, seesQuizBoard, type QuizChoice, type QuizRankingEntry, type QuizText } from '../../game/pub/quiz'
import type { PubLayout, WorldManifest } from '../../game/world/worldManifest'
import type {
  PubQuizAnnouncePayload,
  PubQuizAnsweredPayload,
  PubQuizCancelledPayload,
  PubQuizLobbyPayload,
  PubQuizPrizePayload,
  PubQuizQuestionPayload,
  PubQuizResultsPayload,
  PubQuizRevealPayload,
} from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const NPC_PROMPT_HEIGHT = 2
const BOARD_ABOVE_HOST = 2.4
const ANNOUNCE_SHOWN_MS = 8000

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PubQuizDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  say: (text: string) => void
  t: Translate
}

interface QuizQuestionView {
  index: number
  count: number
  prompt: QuizText
  choices: readonly [QuizText, QuizText, QuizText, QuizText]
  closesAt: number
}

export type QuizScreen =
  | { kind: 'question', question: QuizQuestionView, myChoice: QuizChoice | null }
  | { kind: 'reveal', question: QuizQuestionView, myChoice: QuizChoice | null, answer: QuizChoice, ranking: QuizRankingEntry[] }
  | { kind: 'results', ranking: QuizRankingEntry[], prize: PubQuizPrizePayload | null }

export interface QuizBoard {
  x: number
  y: number
  progress: string
  ranking: QuizRankingEntry[]
}

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function usePubQuiz(deps: PubQuizDeps) {
  const startsAt = ref<number | null>(null)
  const contestants = ref<PubQuizLobbyPayload['contestants']>([])
  const screen = ref<QuizScreen | null>(null)
  const announcement = ref<string | null>(null)
  const board = ref<QuizBoard | null>(null)
  let playing = false
  let spectated: { progress: string, ranking: QuizRankingEntry[], until: number | null } | null = null
  let layout: PubLayout | null = null
  let announceTimer: ReturnType<typeof setTimeout> | null = null
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  const open = computed(() => screen.value !== null)
  watch(open, (isOpen) => {
    if (isOpen && document.pointerLockElement) document.exitPointerLock()
  })

  function mySessionId(): string {
    return deps.gameRoomRef.value?.sessionId ?? ''
  }

  function joined(): boolean {
    return contestants.value.some((c) => c.sessionId === mySessionId())
  }

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.pub ?? null
  }

  function onInit(quiz: PubQuizAnnouncePayload | null): void {
    startsAt.value = quiz?.startsAt ?? null
    contestants.value = []
    screen.value = null
    playing = false
    spectated = null
  }

  function onAnnounce(data: PubQuizAnnouncePayload): void {
    if (startsAt.value !== data.startsAt) contestants.value = []
    startsAt.value = data.startsAt
    announcement.value = deps.t('pubQuiz.announce', { time: clockTime(data.startsAt) })
    if (announceTimer) clearTimeout(announceTimer)
    announceTimer = setTimeout(() => (announcement.value = null), ANNOUNCE_SHOWN_MS)
  }

  function onLobby(data: PubQuizLobbyPayload): void {
    const wasIn = joined()
    startsAt.value = data.startsAt
    contestants.value = data.contestants
    if (!wasIn && joined()) deps.say(deps.t('pubQuiz.joined', { time: clockTime(data.startsAt) }))
  }

  function onCancelled(_data: PubQuizCancelledPayload): void {
    startsAt.value = null
    contestants.value = []
    deps.say(deps.t('pubQuiz.cancelled'))
  }

  function onQuestion(data: PubQuizQuestionPayload): void {
    if (data.index === 0) {
      playing = joined()
      startsAt.value = null
    }
    if (playing) screen.value = { kind: 'question', question: data, myChoice: null }
    else spectated = { progress: deps.t('pubQuiz.progress', { n: data.index + 1, count: data.count }), ranking: spectated?.ranking ?? [], until: null }
  }

  function onAnswered(data: PubQuizAnsweredPayload): void {
    if (screen.value?.kind === 'question') screen.value = { ...screen.value, myChoice: data.choice }
  }

  function onReveal(data: PubQuizRevealPayload): void {
    const current = screen.value
    if (playing && !data.ranking.some((r) => r.sessionId === mySessionId())) {
      playing = false
      screen.value = null
      deps.say(deps.t('pubQuiz.dropped'))
    }
    if (playing && current && current.kind !== 'results') {
      screen.value = { kind: 'reveal', question: current.question, myChoice: current.myChoice, answer: data.answer, ranking: data.ranking }
      return
    }
    if (spectated) spectated = { ...spectated, ranking: data.ranking }
  }

  function onResults(data: PubQuizResultsPayload): void {
    if (playing) screen.value = { kind: 'results', ranking: data.ranking, prize: null }
    else spectated = { progress: deps.t('pubQuiz.final'), ranking: data.ranking, until: Date.now() + RESULT_LINGER_MS }
    playing = false
  }

  function onPrize(data: PubQuizPrizePayload): void {
    if (screen.value?.kind === 'results') screen.value = { ...screen.value, prize: data }
    const key = data.pint ? 'pubQuiz.prizeWithPint' : 'pubQuiz.prize'
    if (data.sessionId !== mySessionId()) deps.say(deps.t(key, { name: data.pseudo, coins: data.coins }))
  }

  function answer(choice: QuizChoice): void {
    if (screen.value?.kind !== 'question' || screen.value.myChoice !== null) return
    deps.gameRoomRef.value?.send('pub_quiz_answer', { choice })
  }

  function close(): void {
    if (screen.value?.kind === 'results') screen.value = null
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (!open.value) return false
    const choice = choiceForKey(e.code)
    if (choice !== null) answer(choice)
    if (e.code === 'Escape') close()
    return true
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

  function tick(): void {
    if (spectated?.until && Date.now() > spectated.until) spectated = null
    if (!layout || !spectated || !seesQuizBoard(deps.myPosition, layout.quizmaster, open.value)) {
      board.value = null
      return
    }
    const [x, y, z] = layout.quizmaster
    const point = projectToScreen(x, y + BOARD_ABOVE_HOST, z)
    board.value = point && { ...point, progress: spectated.progress, ranking: spectated.ranking }
  }

  function prompt(): ScreenPrompt | null {
    if (!layout || startsAt.value === null || joined() || deps.promptsHidden() || !aimingAtHost()) return null
    const [x, y, z] = layout.quizmaster
    const point = projectToScreen(x, y + NPC_PROMPT_HEIGHT, z)
    return point && { ...point, action: deps.t('pubQuiz.join'), detail: deps.t('pubQuiz.startsAt', { time: clockTime(startsAt.value) }) }
  }

  function interact(): boolean {
    if (!layout || startsAt.value === null || joined() || !aimingAtHost()) return false
    deps.gameRoomRef.value?.send('pub_quiz_join')
    return true
  }

  const source: InteractionSource = { prompt, interact }

  return {
    screen,
    open,
    board,
    announcement,
    answer,
    close,
    onKeyDown,
    tick,
    onTownLoaded,
    source,
    handlers: { onInit, onAnnounce, onLobby, onCancelled, onQuestion, onAnswered, onReveal, onResults, onPrize },
  }
}
