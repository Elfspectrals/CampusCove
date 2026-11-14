import { computed, onUnmounted, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches, mouseButtonCode } from '../../config/keybindings'
import type { SfxName } from '../../game/sfx'
import {
  type GymCourtView,
  type GymHudRules,
  clockText,
  goodWindowStart,
  meterFill,
  myTeam,
  parseGymCourtView,
  parseGymHudRules,
  predictBall,
} from '../../game/sports/gymMatch'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import type { GymEndPayload, GymEventPayload, GymSport, GymStatePayload, GymTeam } from '../../types/gameRealtime'

export interface GymMatchDeps {
  gameRoomRef: ShallowRef<Room | null>
  pointerLocked: Ref<boolean>
  myPosition: { x: number; z: number }
  getScene: () => THREE.Scene | undefined
  playOn: (name: SfxName, object: THREE.Object3D) => void
}

export type GymBanner =
  | { kind: 'score'; team: GymTeam; points: number; dunk: boolean; scorer: string | null; sport: GymSport }
  | { kind: 'block' | 'steal' | 'tackle'; mine: boolean }
  | { kind: 'half'; half: number }
  | { kind: 'end'; winner: GymTeam | null; mine: GymTeam | null; score: Record<GymTeam, number> }

const STALE_MS = 3000
const GYM_COURT_URL = '/assets/sports/gym/court.json'
const BANNER_MS = 2600
const END_BANNER_MS = 6000
const BALL_COLOURS: Record<GymSport, number> = { football: 0xf4f4f4, basketball: 0xe07b2c }

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

export function useGymMatch(deps: GymMatchDeps) {
  const state = shallowRef<GymStatePayload | null>(null)
  const banner = shallowRef<GymBanner | null>(null)
  const rules = shallowRef<GymHudRules | null>(null)
  const clientNow = ref(Date.now())
  const holdStartedAt = ref<number | null>(null)
  const cooldownUntil = ref(0)
  let court: GymCourtView | null = null
  let clockOffset = 0
  let receivedAt = 0
  let bannerUntil = 0
  const loaded = new Map<GymSport, Promise<GymHudRules>>()
  const balls = new Map<GymSport, THREE.Mesh>()
  let courtLoad: Promise<void> | null = null

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  const team = computed(() => myTeam(state.value, mySessionId()))

  function loadRules(sport: GymSport): void {
    if (!loaded.has(sport)) {
      const load = fetchJson(sportRulesUrl(sport)).then((raw) => parseGymHudRules(sport, raw))
      loaded.set(sport, load)
      load.catch((error) => console.error(`[gym] ${sport} rules`, error))
    }
    void loaded.get(sport)?.then((r) => {
      if (state.value?.sport === sport) rules.value = r
    })
    courtLoad ??= fetchJson(GYM_COURT_URL).then((raw) => {
      court = parseGymCourtView(raw)
    })
    courtLoad.catch((error) => console.error('[gym] court', error))
  }

  function ballFor(sport: GymSport, radius: number): THREE.Mesh {
    let ball = balls.get(sport)
    if (!ball) {
      ball = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), new THREE.MeshStandardMaterial({ color: BALL_COLOURS[sport], roughness: 0.6 }))
      ball.name = `gym_ball_${sport}`
      balls.set(sport, ball)
    }
    return ball
  }

  function hideBalls(): void {
    for (const ball of balls.values()) ball.removeFromParent()
  }

  function show(next: GymBanner, ms = BANNER_MS): void {
    banner.value = next
    bannerUntil = Date.now() + ms
  }

  function send(kind: string): void {
    deps.gameRoomRef.value?.send('gym_action', { kind })
  }

  function onState(data: GymStatePayload): void {
    if (state.value?.sport !== data.sport) loadRules(data.sport)
    state.value = data
    receivedAt = Date.now()
    clockOffset = data.serverNow - receivedAt
    if (!myTeam(data, mySessionId())) holdStartedAt.value = null
  }

  function soundAtBall(name: SfxName): void {
    const ball = state.value ? balls.get(state.value.sport) : undefined
    if (ball?.parent) deps.playOn(name, ball)
  }

  function onEvent(data: GymEventPayload): void {
    const mine = data.sessionId !== null && data.sessionId === mySessionId()
    if (data.kind === 'score') {
      show({ kind: 'score', team: data.team, points: data.points, dunk: data.dunk, scorer: data.scorer, sport: state.value?.sport ?? 'football' })
      soundAtBall('market_bell')
    } else if (data.kind === 'kick') {
      soundAtBall(data.shot ? 'impact' : 'whoosh')
    } else if (data.kind === 'half') {
      show({ kind: 'half', half: data.half })
    } else {
      if (mine && rules.value && data.kind !== 'block') cooldownUntil.value = Date.now() + rules.value.defendCooldownMs
      if (data.kind === 'block' || data.won) {
        show({ kind: data.kind, mine })
        soundAtBall('impact')
      } else if (mine) {
        soundAtBall('whoosh')
      }
    }
  }

  function onEnd(data: GymEndPayload): void {
    const mine = myTeam(state.value, mySessionId())
    if (state.value?.venue === data.venue) state.value = null
    holdStartedAt.value = null
    hideBalls()
    show({ kind: 'end', winner: data.winner, mine, score: data.score }, END_BANNER_MS)
  }

  function playing(): boolean {
    return deps.pointerLocked.value && team.value !== null
  }

  function onPress(code: string, repeat: boolean): boolean {
    if (!playing()) return false
    if (matches('punch', code)) {
      if (!repeat) send('pass')
      return true
    }
    if (matches('interact', code)) {
      if (!repeat && holdStartedAt.value === null) {
        holdStartedAt.value = Date.now()
        send('shot_start')
      }
      return true
    }
    if (matches('sportsTackle', code)) {
      if (!repeat) send('tackle')
      return true
    }
    if (matches('jump', code) && !repeat && state.value?.sport === 'basketball') send('jump')
    return false
  }

  function onRelease(code: string): void {
    if (holdStartedAt.value === null || !matches('interact', code)) return
    holdStartedAt.value = null
    send('shot_release')
  }

  const onKeyUp = (e: KeyboardEvent) => onRelease(e.code)
  const onMouseUp = (e: MouseEvent) => onRelease(mouseButtonCode(e.button))
  const onBlur = () => {
    holdStartedAt.value = null
  }
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', onBlur)
  onUnmounted(() => {
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('blur', onBlur)
    hideBalls()
    for (const ball of balls.values()) {
      ball.geometry.dispose()
      ;(ball.material as THREE.Material).dispose()
    }
  })

  function tick(): void {
    const now = Date.now()
    clientNow.value = now
    if (banner.value && now > bannerUntil) banner.value = null
    const current = state.value
    if (current && now - receivedAt > STALE_MS) {
      state.value = null
      hideBalls()
      return
    }
    if (!current || !rules.value || !court || rules.value.sport !== current.sport) return
    const ball = ballFor(current.sport, rules.value.ballRadius)
    const scene = deps.getScene()
    if (scene && ball.parent !== scene) {
      hideBalls()
      scene.add(ball)
    }
    const [x, y, z] = predictBall(current.ball, (now - receivedAt) / 1000, court.floorY, rules.value.ballRadius, current.owner !== null)
    ball.position.set(x, y, z)
  }

  const hud = computed(() => {
    const current = state.value
    if (!current) return null
    const remaining = current.endsAt - (clientNow.value + clockOffset)
    const r = rules.value
    const held = holdStartedAt.value
    const basket = team.value && court ? court.baskets[team.value] : null
    const distance = basket ? Math.hypot(deps.myPosition.x - basket.x, deps.myPosition.z - basket.z) : 0
    const meter = r && held !== null ? { fill: meterFill(r.meter, clientNow.value - held), goodFrom: goodWindowStart(r.meter, distance) } : null
    const cooldown = r && cooldownUntil.value > clientNow.value ? (cooldownUntil.value - clientNow.value) / r.defendCooldownMs : null
    return {
      sport: current.sport,
      score: current.score,
      clock: clockText(remaining),
      half: current.half,
      halves: current.halves,
      team: team.value,
      meter,
      cooldown,
    }
  })

  return { hud, banner, handlers: { onState, onEvent, onEnd }, onPress, tick }
}
