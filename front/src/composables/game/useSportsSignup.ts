import { computed, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import {
  COACH_REACH,
  defaultSettings,
  lobbyPlayer,
  parseSignupSpec,
  shownLobby,
  signupMessage,
  sportRulesUrl,
  venueChoices,
  type SettingValue,
  type SignupSpec,
  type SportsCoachSpot,
  type SportsTeam,
} from '../../game/sports/sportsSignup'
import type { SportsErrorPayload, SportsLobbyClosedPayload, SportsLobbyPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PROMPT_HEIGHT = 2.2

export interface SportsSignupDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  coaches: () => readonly SportsCoachSpot[]
  coachPrompt: () => { action: string; detail?: string }
  errorText: (error: SportsErrorPayload) => string
  closedText: (reason: SportsLobbyClosedPayload['reason']) => string
  say: (text: string) => void
  onSignedUp: () => void
}

async function fetchSignupSpec(sport: string): Promise<SignupSpec> {
  const url = sportRulesUrl(sport)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return parseSignupSpec(await response.json(), sport)
}

export function useSportsSignup(deps: SportsSignupDeps) {
  const lobbies = shallowRef<ReadonlyMap<string, SportsLobbyPayload>>(new Map())
  const openCoach = ref<string | null>(null)
  const pickedVenue = ref<string | null>(null)
  const spec = shallowRef<SignupSpec | null>(null)
  const team = ref<SportsTeam | null>(null)
  const settings = ref<Record<string, SettingValue>>({})
  const pending = ref(false)
  const error = ref<string | null>(null)
  const clockOffset = ref(0)
  const clientNow = ref(Date.now())
  const specs = new Map<string, Promise<SignupSpec>>()
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  const choices = computed(() => (openCoach.value ? venueChoices(lobbies.value.values(), openCoach.value) : []))
  const lobby = computed(() => shownLobby(choices.value, pickedVenue.value, mySessionId()))
  const canPickVenue = computed(() => choices.value.length > 1 && !choices.value.some((c) => lobbyPlayer(c.lobby, mySessionId()) !== null))

  function aimedCoach(): SportsCoachSpot | null {
    const camera = deps.getCamera()
    if (!camera) return null
    camera.getWorldDirection(forward)
    return deps.coaches().find((c) => isAimingAtNpc(deps.myPosition, forward, c.position, COACH_REACH)) ?? null
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || openCoach.value) return null
    const coach = aimedCoach()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!coach || !camera || !canvas) return null
    const [x, y, z] = coach.position
    projection.set(x, y + PROMPT_HEIGHT, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, ...deps.coachPrompt() }
  }

  function interact(): boolean {
    const room = deps.gameRoomRef.value
    if (openCoach.value || !room) return false
    const coach = aimedCoach()
    if (!coach) return false
    if (document.pointerLockElement) document.exitPointerLock()
    openCoach.value = coach.coach
    pickedVenue.value = null
    error.value = null
    room.send('sports_coach_open', { coach: coach.coach })
    return true
  }

  function loadSpec(sport: string): void {
    let loading = specs.get(sport)
    if (!loading) {
      loading = fetchSignupSpec(sport)
      specs.set(sport, loading)
      loading.catch(() => specs.delete(sport))
    }
    loading.then(
      (loaded) => {
        if (lobby.value?.sport !== sport) return
        spec.value = loaded
        settings.value = defaultSettings(loaded)
      },
      (err: unknown) => {
        console.error('[sports] sign-up rules failed to load', err)
        error.value = err instanceof Error ? err.message : String(err)
      },
    )
  }

  watch(
    () => lobby.value?.venue,
    () => {
      spec.value = null
      team.value = null
      if (lobby.value) loadSpec(lobby.value.sport)
    },
  )

  function pickVenue(venue: string | null): void {
    if (pending.value) return
    error.value = null
    pickedVenue.value = venue
  }

  function signUp(): void {
    const room = deps.gameRoomRef.value
    const current = lobby.value
    if (pending.value || !room || !current || !spec.value) return
    const first = current.players.length === 0
    pending.value = true
    error.value = null
    room.send('sports_signup', signupMessage(current.coach, current.venue, spec.value, team.value, first ? settings.value : null))
  }

  function leave(): void {
    const room = deps.gameRoomRef.value
    if (pending.value || !room) return
    pending.value = true
    error.value = null
    room.send('sports_signup_leave', {})
  }

  function close(): void {
    openCoach.value = null
    pickedVenue.value = null
    pending.value = false
    error.value = null
  }

  function tick(): void {
    if (openCoach.value) clientNow.value = Date.now()
  }

  const handlers = {
    onLobby(data: SportsLobbyPayload): void {
      const me = mySessionId()
      const previous = lobbies.value.get(data.venue)
      const wasIn = previous ? lobbyPlayer(previous, me) !== null : false
      const isIn = lobbyPlayer(data, me) !== null
      clockOffset.value = data.serverNow - Date.now()
      lobbies.value = new Map(lobbies.value).set(data.venue, data)
      if (wasIn !== isIn) pending.value = false
      if (isIn && !wasIn) deps.onSignedUp()
    },
    onLobbyClosed(data: SportsLobbyClosedPayload): void {
      const closed = lobbies.value.get(data.venue)
      const wasIn = closed ? lobbyPlayer(closed, mySessionId()) !== null : false
      const shown = lobby.value?.venue === data.venue
      const next = new Map(lobbies.value)
      next.delete(data.venue)
      lobbies.value = next
      if (shown) close()
      if (wasIn) deps.say(deps.closedText(data.reason))
    },
    onError(data: SportsErrorPayload): void {
      const text = deps.errorText(data)
      pending.value = false
      if (openCoach.value) error.value = text
      else deps.say(text)
    },
    onRoomJoined(): void {
      lobbies.value = new Map()
      close()
    },
  }

  return {
    lobby,
    choices,
    canPickVenue,
    open: computed(() => openCoach.value !== null),
    spec,
    team,
    settings,
    pending,
    error,
    clockOffset,
    clientNow,
    pickVenue,
    signUp,
    leave,
    close,
    tick,
    source: { prompt, interact } as InteractionSource,
    handlers,
  }
}
