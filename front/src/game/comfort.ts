/**
 * First-person comfort (motion sickness): field of view, how much the camera may shake / roll,
 * and a smoothed eye height so steps and floor snaps do not jerk the view.
 * Pure functions + a small step smoother; the reactive store lives in composables/game/useComfortSettings.ts.
 */

export interface ComfortSettings {
  /** Vertical field of view in degrees (three.js convention), for a 4:3 or wider window. */
  fov: number
  /** No camera shake, punch kick, jolt or roll at all. */
  reduceCameraMotion: boolean
}

export const MIN_FOV = 60
export const MAX_FOV = 95
/** ~112° horizontal on 16:9: wide enough to give a stable peripheral reference, without fisheye edges. */
export const DEFAULT_FOV = 80
const DEFAULT_COMFORT: ComfortSettings = { fov: DEFAULT_FOV, reduceCameraMotion: false }

/** Below this aspect (portrait / split windows) the horizontal view is kept instead of shrinking. */
const NARROW_ASPECT = 4 / 3
const MAX_VERTICAL_FOV = 100

export function clampFov(fov: number): number {
  if (!Number.isFinite(fov)) return DEFAULT_FOV
  return Math.min(MAX_FOV, Math.max(MIN_FOV, Math.round(fov)))
}

export function parseComfort(raw: string | null): ComfortSettings {
  if (!raw) return { ...DEFAULT_COMFORT }
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_COMFORT }
    const { fov, reduceCameraMotion } = data as Record<string, unknown>
    return {
      fov: typeof fov === 'number' ? clampFov(fov) : DEFAULT_FOV,
      reduceCameraMotion: reduceCameraMotion === true,
    }
  } catch {
    return { ...DEFAULT_COMFORT }
  }
}

/**
 * Vertical FOV for the camera. Three.js keeps the vertical angle fixed, so a narrow window would
 * squeeze the horizontal view into a tunnel; below 4:3 the horizontal angle of 4:3 is kept instead.
 */
export function verticalFovFor(fov: number, aspect: number): number {
  const base = clampFov(fov)
  if (!(aspect > 0) || aspect >= NARROW_ASPECT) return base
  const halfTan = Math.tan((base * Math.PI) / 360) * (NARROW_ASPECT / aspect)
  return Math.min(MAX_VERTICAL_FOV, (Math.atan(halfTan) * 360) / Math.PI)
}

export interface CameraMotionScale {
  /** Pitch shake, punch kick and jolt. */
  shake: number
  /** Roll (tilting the horizon) is the strongest sickness trigger, so it is damped even by default. */
  roll: number
  /** The punch "zoom" pulse. */
  fovKick: number
}

export function cameraMotionScale(reduceCameraMotion: boolean): CameraMotionScale {
  if (reduceCameraMotion) return { shake: 0, roll: 0, fovKick: 0 }
  return { shake: 1, roll: 0.3, fovKick: 0.5 }
}

/** A frame-to-frame height change faster than this is a snap (stair step, floor edge), not a slope or a jump. */
const STEP_SPEED = 8.5
/** Bigger changes are teleports (doors, spawns): the camera follows at once. */
const MAX_STEP = 0.6
/** How fast the camera catches up with the body after a step (1/s). */
const STEP_CATCH_UP = 14
const MAX_OFFSET = 0.45
/** Lower frame times than this still count as one frame (avoids a zero threshold). */
const MIN_DT = 1 / 240

/**
 * Smooths the eye height over stair steps and floor snaps. The body position (collision, network)
 * stays exact; only the camera eases toward it.
 */
export function createStepSmoother() {
  let lastY: number | null = null
  let offset = 0

  return {
    /** Camera Y for a body eye height `y` this frame. */
    update(y: number, dt: number): number {
      if (lastY === null) {
        lastY = y
        return y
      }
      const dy = y - lastY
      lastY = y
      if (Math.abs(dy) > MAX_STEP) offset = 0
      else if (Math.abs(dy) > STEP_SPEED * Math.max(dt, MIN_DT)) offset -= dy
      offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, offset)) * Math.exp(-STEP_CATCH_UP * dt)
      if (Math.abs(offset) < 1e-4) offset = 0
      return y + offset
    },
    reset(): void {
      lastY = null
      offset = 0
    },
  }
}
