import { computed, ref, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { standsOnFloor } from '../../game/pub/npcAim'
import { isStool } from '../../game/pub/seats'
import type { PubLayout, PubSeat, WorldManifest } from '../../game/world/worldManifest'
import type {
  PubDartPayload,
  PubDartsEndPayload,
  PubDartsLobbyPayload,
  PubDartsStatePayload,
  PubRaceEndPayload,
  PubRaceLobbyPayload,
  PubRaceStartPayload,
  PubRaceStatePayload,
  PubRewardPayload,
  PubShotsReadyPayload,
  PubShotsResultPayload,
} from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

/** Same reaches as socket/src/pubGames.ts (pub_shots_start, pub_darts_join). */
const SHOTS_REACH = 2.5
const DARTS_REACH = 3
const DARTS_THROWS = 3
const RACE_PROMPT_AHEAD = 0.7
const RACE_PROMPT_HEIGHT = 0.5
const GAME_PROMPT_HEIGHT = 1.2

interface Race {
  hostSessionId: string
  players: string[]
  startsAt: number
  seed: number
  progress: Record<string, number>
  finished: boolean
}

interface Shots {
  seed: number
  startedAt: number
  result: { ms: number; coins: number } | null
}

interface Darts {
  players: Array<{ sessionId: string; darts: PubDartPayload[]; total: number }>
  turn: string | null
  throwsLeft: number
  turnEndsAt: number
  ranking: Array<{ sessionId: string; total: number }> | null
}

export interface PubGamesDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  mySeat: () => PubSeat | null
  holdingConsumable: () => boolean
  pseudoOf: (sessionId: string) => string
  say: (text: string) => void
}

function ordinal(place: number): string {
  return place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`
}

/**
 * The pub's three games as the server runs them: Drink Fast (a race between the players on the bar stools),
 * Meter Shot (ten shots against the clock) and Darts (turn by turn). This composable mirrors the socket
 * messages, sends the player's moves and opens / closes the game screens; the screens themselves are
 * GameDrinkFast.vue, GameMeterShot.vue and GameDarts.vue.
 */
export function usePubGames(deps: PubGamesDeps) {
  let layout: PubLayout | null = null
  const race = ref<Race | null>(null)
  const shots = ref<Shots | null>(null)
  const darts = ref<Darts | null>(null)
  const projection = new THREE.Vector3()

  const me = () => deps.gameRoomRef.value?.sessionId ?? ''
  const send = (type: string, payload?: unknown) => deps.gameRoomRef.value?.send(type, payload)

  const raceOpen = computed(() => race.value !== null && race.value.players.includes(me()))
  const dartsOpen = computed(() => darts.value !== null && darts.value.players.some((p) => p.sessionId === me()))
  const shotsOpen = computed(() => shots.value !== null)
  const uiOpen = computed(() => raceOpen.value || shotsOpen.value || dartsOpen.value)

  watch(uiOpen, (open) => {
    if (open && document.pointerLockElement) document.exitPointerLock()
  })

  const racePlayers = computed(() => {
    const current = race.value
    if (!current) return []
    return current.players.map((sessionId) => ({
      sessionId,
      pseudo: deps.pseudoOf(sessionId),
      progress: current.progress[sessionId] ?? 0,
      me: sessionId === me(),
    }))
  })

  const dartsPlayers = computed(() =>
    (darts.value?.players ?? []).map((player) => ({ ...player, pseudo: deps.pseudoOf(player.sessionId), me: player.sessionId === me() })),
  )

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.pub ?? null
  }

  function myReward(rewards: PubRewardPayload[]): number {
    return rewards.find((r) => r.sessionId === me())?.coins ?? 0
  }

  // ------------------------------------------------------------ Drink Fast

  function onRaceLobby(data: PubRaceLobbyPayload): void {
    race.value = { ...data, seed: race.value?.seed ?? 0, progress: {}, finished: false }
  }

  function onRaceStart(data: PubRaceStartPayload): void {
    const current = race.value
    if (!current) return
    race.value = { ...current, seed: data.seed, players: data.players, progress: {} }
  }

  function onRaceState(data: PubRaceStatePayload): void {
    const current = race.value
    if (!current) return
    const progress = { ...current.progress }
    for (const player of data.players) progress[player.sessionId] = player.progress
    race.value = { ...current, progress }
  }

  function onRaceEnd(data: PubRaceEndPayload): void {
    const current = race.value
    if (!current) return
    race.value = { ...current, finished: true }
    const place = data.ranking.findIndex((r) => r.sessionId === me()) + 1
    if (place === 0) {
      race.value = null
      return
    }
    const coins = myReward(data.rewards)
    const alone = data.ranking.length === 1
    deps.say(`Drink Fast: ${alone ? 'done' : `you finished ${ordinal(place)}`}${coins > 0 ? ` · +${coins} coins` : ''}`)
  }

  function sendRaceProgress(progress: number): void {
    send('pub_race_progress', { progress })
  }

  function closeRace(): void {
    race.value = null
  }

  // ------------------------------------------------------------ Meter Shot

  function onShotsReady(data: PubShotsReadyPayload): void {
    shots.value = { seed: data.seed, startedAt: data.startedAt, result: null }
  }

  function onShotsResult(data: PubShotsResultPayload): void {
    if (shots.value) shots.value = { ...shots.value, result: { ms: data.ms, coins: data.coins } }
    deps.say(`Meter Shot: ${(data.ms / 1000).toFixed(2)} s${data.coins > 0 ? ` · +${data.coins} coins` : ''}`)
  }

  function sendShotsDone(ms: number): void {
    send('pub_shots_done', { ms })
  }

  function closeShots(): void {
    shots.value = null
  }

  // ------------------------------------------------------------ Darts

  function onDartsLobby(data: PubDartsLobbyPayload): void {
    const known = new Map(darts.value?.players.map((p) => [p.sessionId, p]) ?? [])
    darts.value = {
      players: data.players.map((sessionId) => known.get(sessionId) ?? { sessionId, darts: [], total: 0 }),
      turn: null,
      throwsLeft: DARTS_THROWS,
      turnEndsAt: data.startsAt,
      ranking: null,
    }
  }

  function onDartsState(data: PubDartsStatePayload): void {
    darts.value = { ...data, ranking: null }
  }

  function onDartsEnd(data: PubDartsEndPayload): void {
    const current = darts.value
    if (!current) return
    darts.value = { ...current, turn: null, ranking: data.ranking }
    const place = data.ranking.findIndex((r) => r.sessionId === me()) + 1
    if (place === 0) return
    const coins = myReward(data.rewards)
    const alone = data.ranking.length === 1
    deps.say(`Darts: ${alone ? 'game over' : `you finished ${ordinal(place)}`}${coins > 0 ? ` · +${coins} coins` : ''}`)
  }

  function sendThrow(x: number, y: number): void {
    send('pub_darts_throw', { x, y })
  }

  function closeDarts(): void {
    darts.value = null
  }

  // ------------------------------------------------------------ prompts

  /** `point` is a spot on the bar floor; the cellar right under it does not count. */
  function near(point: [number, number, number], reach: number): boolean {
    if (!standsOnFloor(deps.myPosition.y, point[1])) return false
    return Math.hypot(point[0] - deps.myPosition.x, point[2] - deps.myPosition.z) <= reach
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

  type Target = { action: string; detail: string; at: [number, number, number]; go: () => void }

  function raceTarget(seat: PubSeat): Target | null {
    const current = race.value
    const [x, y, z] = seat.position
    const at: [number, number, number] = [x - Math.sin(seat.yaw) * RACE_PROMPT_AHEAD, y + RACE_PROMPT_HEIGHT, z - Math.cos(seat.yaw) * RACE_PROMPT_AHEAD]
    if (!current) return { action: 'Drink Fast', detail: 'Race the bar · 20 coins', at, go: () => send('pub_race_open') }
    if (current.players.includes(me()) || current.finished) return null
    if (Date.now() >= current.startsAt) return null
    return { action: 'Join the race', detail: 'Drink Fast · 20 coins', at, go: () => send('pub_race_join') }
  }

  function target(): Target | null {
    if (!layout || uiOpen.value || deps.holdingConsumable()) return null
    const seat = deps.mySeat()
    if (seat) return isStool(seat) ? raceTarget(seat) : null
    if (near(layout.shots.player, SHOTS_REACH)) {
      const [x, y, z] = layout.shots.plank
      return { action: 'Meter Shot', detail: '10 shots against the clock · 35 coins', at: [x, y + 0.3, z], go: () => send('pub_shots_start') }
    }
    if (near(layout.darts.oche, DARTS_REACH)) {
      const [x, , z] = layout.darts.oche
      const lobby = darts.value !== null && darts.value.ranking === null
      return { action: lobby ? 'Join the darts' : 'Darts', detail: '3 darts each · 10 coins', at: [x, GAME_PROMPT_HEIGHT, z], go: () => send('pub_darts_join') }
    }
    return null
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const found = target()
    if (!found) return null
    const screen = projectToScreen(...found.at)
    return screen && { ...screen, action: found.action, detail: found.detail }
  }

  function interact(): boolean {
    const found = target()
    if (!found) return false
    found.go()
    return true
  }

  const source: InteractionSource = { prompt, interact }

  return {
    race,
    raceOpen,
    racePlayers,
    shots,
    darts,
    dartsOpen,
    dartsPlayers,
    uiOpen,
    onTownLoaded,
    sendRaceProgress,
    closeRace,
    sendShotsDone,
    closeShots,
    sendThrow,
    closeDarts,
    source,
    handlers: { onRaceLobby, onRaceStart, onRaceState, onRaceEnd, onShotsReady, onShotsResult, onDartsLobby, onDartsState, onDartsEnd },
  }
}
