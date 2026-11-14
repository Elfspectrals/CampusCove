import { computed, ref, shallowRef, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import {
  SKATING_RULES_URL,
  fall,
  hitBoards,
  newSkater,
  onIce,
  parseSkatingSpec,
  push,
  raceClock,
  rhythmCue,
  rhythmWindow,
  skateStep,
  speedKmh,
  type PushKind,
  type SkatingSpec,
} from '../../game/sports/skating/skateMotion'
import type { SkateFallPayload, SkateRacePayload, SkateResultPayload } from '../../types/gameRealtime'
import type { SfxName } from '../../game/sfx'

export interface SkatingDeps {
  myPosition: { x: number; y: number; z: number }
  gameRoomRef: ShallowRef<Room | null>
  ownsSkates: () => boolean
  say: (text: string) => void
  correctionText: (reason: string) => string | null
  onFall: () => void
  playSound: (name: SfxName) => void
}

export interface SkateKeys {
  forward: boolean
  brake: boolean
}

export interface SkateRaceRow {
  sessionId: string
  name: string
  lap: number
  penaltyMs: number
  status: string | null
  mine: boolean
}

const RESULT_SHOWN_MS = 12_000

export function useSkating(deps: SkatingDeps) {
  const spec = shallowRef<SkatingSpec | null>(null)
  const skater = newSkater(0)
  const active = ref(false)
  const speed = ref(0)
  const cue = ref(0)
  const lastPush = ref<PushKind | null>(null)
  const race = shallowRef<SkateRacePayload | null>(null)
  const result = shallowRef<SkateResultPayload | null>(null)
  const clockOffset = ref(0)
  const clientNow = ref(Date.now())
  let forwardHeld = false
  let braking = false
  let resultUntil = 0

  void fetch(SKATING_RULES_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`${SKATING_RULES_URL}: HTTP ${response.status}`)
      return response.json()
    })
    .then((raw) => {
      spec.value = parseSkatingSpec(raw)
    })
    .catch((error) => console.error('[skating] rules not loaded:', error))

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  function serverNow(): number {
    return Date.now() + clockOffset.value
  }

  function onTheIce(): boolean {
    const s = spec.value
    return s !== null && deps.ownsSkates() && onIce(s.rink, deps.myPosition.x, deps.myPosition.z)
  }

  function waitingForStart(): boolean {
    const r = race.value
    return r !== null && serverNow() < r.goAt && r.racers.some((x) => x.sessionId === mySessionId())
  }

  function setBraking(on: boolean): void {
    if (on === braking) return
    braking = on
    deps.gameRoomRef.value?.send('skate_brake', { on })
  }

  function step(dt: number, yaw: number, keys: SkateKeys): { dx: number; dz: number } | null {
    const s = spec.value
    const now = Date.now()
    if (!s || !onTheIce()) {
      if (active.value) {
        active.value = false
        skater.speed = 0
        setBraking(false)
      }
      forwardHeld = keys.forward
      return null
    }
    if (!active.value) {
      active.value = true
      skater.heading = yaw
      skater.speed = 0
    }
    if (waitingForStart()) {
      forwardHeld = keys.forward
      skater.speed = 0
      speed.value = 0
      return { dx: 0, dz: 0 }
    }
    if (keys.forward && !forwardHeld && now >= skater.fallenUntil) {
      lastPush.value = push(s.tuning, skater, now)
      deps.gameRoomRef.value?.send('skate_push', {})
      deps.playSound('whoosh')
    }
    forwardHeld = keys.forward
    setBraking(keys.brake)
    const move = skateStep(s.tuning, skater, yaw, keys.brake, dt, now)
    speed.value = speedKmh(skater)
    cue.value = rhythmCue(s.tuning, skater, now)
    return move
  }

  function afterMove(wanted: number, moved: number): void {
    const s = spec.value
    if (!s || !active.value) return
    if (hitBoards(s, skater, wanted, moved, Date.now())) {
      deps.playSound('impact')
      deps.onFall()
    }
  }

  const rhythmZone = computed(() => (spec.value ? rhythmWindow(spec.value.tuning) : { from: 0, to: 1 }))

  const rows = computed<SkateRaceRow[]>(() =>
    (race.value?.racers ?? []).map((r) => ({
      sessionId: r.sessionId,
      name: r.name,
      lap: r.lap,
      penaltyMs: r.penaltyMs,
      status: r.dnf ? 'dnf' : r.finishedMs === null ? null : raceClock(r.finishedMs),
      mine: r.sessionId === mySessionId(),
    })),
  )

  const myRacer = computed(() => race.value?.racers.find((r) => r.sessionId === mySessionId()) ?? null)

  const clock = computed(() => {
    const r = race.value
    if (!r) return null
    const now = clientNow.value + clockOffset.value
    if (now < r.goAt) return { countdown: Math.ceil((r.goAt - now) / 1000), elapsed: null }
    const mine = myRacer.value
    return { countdown: 0, elapsed: raceClock(mine?.finishedMs ?? now - r.goAt) }
  })

  function tick(): void {
    clientNow.value = Date.now()
    if (result.value && Date.now() > resultUntil) result.value = null
  }

  const handlers = {
    onRace(data: SkateRacePayload): void {
      clockOffset.value = data.serverNow - Date.now()
      const before = race.value
      if (data.phase === 'racing' && before?.phase === 'countdown') deps.playSound('market_bell')
      race.value = data
      result.value = null
    },
    onFall(data: SkateFallPayload): void {
      if (data.sessionId !== mySessionId()) return
      fall(skater, Date.now() + Math.max(0, data.until - data.serverNow))
      deps.playSound('impact')
      deps.onFall()
    },
    onResult(data: SkateResultPayload): void {
      race.value = null
      result.value = data
      resultUntil = Date.now() + RESULT_SHOWN_MS
      const mine = data.results.find((r) => r.sessionId === mySessionId())
      if (mine) deps.playSound('market_sold')
    },
    onCorrection(reason: string | undefined): void {
      if (!reason) return
      if (reason === 'skate_grid') skater.speed = 0
      const text = deps.correctionText(reason)
      if (text) deps.say(text)
    },
    onRoomJoined(): void {
      race.value = null
      result.value = null
    },
  }

  return { active, speed, cue, rhythmZone, lastPush, race, rows, clock, result, step, afterMove, tick, handlers }
}
