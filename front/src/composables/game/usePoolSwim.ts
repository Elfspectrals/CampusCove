import { computed, ref } from 'vue'
import * as THREE from 'three'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { buildingFloorAt } from '../../game/town/openHouses'
import type { PoolRules, WaterRect } from '../../game/sports/pool/poolRace'
import { playSubmerge, playSurface, setPoolSoundsMuffled } from '../../game/sports/pool/poolSounds'
import { createPoolWaterSurface } from '../../game/sports/pool/poolWaterSurface'
import { floatEyeY, isUnderwater, swimStep, swimWaterAt, type SwimInput } from '../../game/sports/pool/swimMotion'

const UNDERWATER_FOG = { color: 0x1b6f86, near: 0.5, far: 14 }
const MUFFLE_HZ = 700
const RIPPLE_EVERY_M = 0.7
const SURFACE_BAND_M = 0.35
const LOW_BREATH = 0.3
const GASP_BELOW = 0.5

export interface PoolSwimDeps {
  rules: () => PoolRules | null
  myPosition: { x: number; y: number; z: number }
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  listener: () => THREE.AudioListener | null
  remotePlayers: () => readonly { sessionId: string }[]
  remotePosition: (sessionId: string) => THREE.Vector3 | null
  say: (text: string) => void
  rescuedText: () => string
}

export function usePoolSwim(deps: PoolSwimDeps) {
  const breath = ref<{ ms: number; maxMs: number } | null>(null)
  const underwater = ref(false)
  const surface = createPoolWaterSurface(deps.getScene)
  const lastRipple = new Map<string, { x: number; z: number }>()
  let savedFog: { color: THREE.Color; near: number; far: number } | null = null
  let muffle: BiquadFilterNode | null = null

  const swim = {
    waterAt: (x: number, z: number, feetY: number) => {
      const rules = deps.rules()
      const water = rules ? swimWaterAt(rules, x, z) : null
      if (!rules || !water) return null
      const standingOn = buildingFloorAt(x, z, feetY)
      return standingOn !== null && standingOn > rules.waterY ? null : water
    },
    step: (water: WaterRect, eyeY: number, vy: number, input: SwimInput, yaw: number, pitch: number, dt: number) => {
      const rules = deps.rules()
      if (!rules) throw new Error('pool rules are not loaded')
      return swimStep(rules, water, eyeY, vy, input, yaw, pitch, dt)
    },
  }

  const breathHud = computed(() => {
    const b = breath.value
    if (!b || (b.ms >= b.maxMs && !underwater.value)) return null
    const fill = b.ms / b.maxMs
    return { fill, low: fill < LOW_BREATH }
  })

  const handlers = {
    onBreath(data: { breathMs: number; maxMs: number }) {
      breath.value = { ms: data.breathMs, maxMs: data.maxMs }
    },
    onRescued() {
      breath.value = null
      deps.say(deps.rescuedText())
    },
  }

  function setUnderwaterLook(on: boolean): void {
    const scene = deps.getScene()
    const fog = scene?.fog
    if (on && fog instanceof THREE.Fog) {
      savedFog = { color: fog.color.clone(), near: fog.near, far: fog.far }
      fog.color.setHex(UNDERWATER_FOG.color)
      fog.near = UNDERWATER_FOG.near
      fog.far = UNDERWATER_FOG.far
    } else if (!on && savedFog && fog instanceof THREE.Fog) {
      fog.color.copy(savedFog.color)
      fog.near = savedFog.near
      fog.far = savedFog.far
      savedFog = null
    }
    const listener = deps.listener()
    if (listener) {
      if (on) {
        muffle ??= Object.assign(listener.context.createBiquadFilter(), { type: 'lowpass' as BiquadFilterType })
        muffle.frequency.value = MUFFLE_HZ
        listener.setFilter(muffle)
      } else if (listener.getFilter()) {
        listener.removeFilter()
      }
    }
    setPoolSoundsMuffled(on)
  }

  function rippleWhereSwimming(rules: PoolRules, key: string, x: number, eyeY: number, z: number): void {
    if (!swimWaterAt(rules, x, z) || Math.abs(eyeY - floatEyeY(rules)) > SURFACE_BAND_M) {
      lastRipple.delete(key)
      return
    }
    const last = lastRipple.get(key)
    if (last && Math.hypot(x - last.x, z - last.z) < RIPPLE_EVERY_M) return
    surface.ripple(x, z, last ? 0.6 : 1.5)
    lastRipple.set(key, { x, z })
  }

  function tick(dt: number): void {
    surface.tick(dt)
    const rules = deps.rules()
    const camera = deps.getCamera()
    if (!rules || !camera) return
    const under = isUnderwater(rules, camera.position.x, camera.position.y, camera.position.z)
    if (under !== underwater.value) {
      underwater.value = under
      setUnderwaterLook(under)
      if (under) playSubmerge()
      else playSurface((breath.value?.ms ?? Infinity) < (breath.value?.maxMs ?? 0) * GASP_BELOW)
    }
    rippleWhereSwimming(rules, 'me', deps.myPosition.x, deps.myPosition.y, deps.myPosition.z)
    for (const { sessionId } of deps.remotePlayers()) {
      const p = deps.remotePosition(sessionId)
      if (p) rippleWhereSwimming(rules, sessionId, p.x, p.y + EYE_HEIGHT, p.z)
    }
  }

  function dispose(): void {
    if (underwater.value) setUnderwaterLook(false)
  }

  return { swim, breathHud, underwater, handlers, tick, dispose }
}
