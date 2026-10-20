/**
 * Pure Idle / Walk / Run selection for rigged skins (no three.js, unit-tested in avatarAnimationLogic.test.ts).
 *
 * Remote avatars move through exponential smoothing, so their measured speed decays through the Walk band on
 * every stop and jitters with network updates. The selector therefore low-passes the speed, uses separate
 * enter / exit thresholds (hysteresis) and refuses to switch clips again before `MIN_HOLD_S` has elapsed.
 */
export type AvatarClipName = 'Idle' | 'Walk' | 'Run'

export const WALK_ENTER = 0.5
export const WALK_EXIT = 0.25
export const RUN_ENTER = 5
export const RUN_EXIT = 3.5
export const MIN_HOLD_S = 0.18
/** Longest frame step fed to the animation system (a background tab can report several seconds). */
export const MAX_DT_S = 0.1
const SPEED_SMOOTHING = 14
/** Faster than any real movement (players move at 8 m/s): anything above is a teleport / glitch. */
const MAX_SPEED = 12

export function clampDt(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0
  return Math.min(dt, MAX_DT_S)
}

export function walkTimeScale(speed: number): number {
  return Math.max(0.6, Math.min(1.4, speed / 2.5))
}

export class AvatarClipSelector {
  clip: AvatarClipName = 'Idle'
  speed = 0
  private heldFor = MIN_HOLD_S

  /** Feed the measured speed (m/s); returns the clip to play and its time scale. */
  update(dt: number, measuredSpeed: number): { clip: AvatarClipName; timeScale: number } {
    const step = clampDt(dt)
    const target = Number.isFinite(measuredSpeed) ? Math.min(MAX_SPEED, Math.max(0, measuredSpeed)) : 0
    this.speed += (target - this.speed) * (1 - Math.exp(-SPEED_SMOOTHING * step))
    this.heldFor += step

    const wanted = this.wantedClip()
    if (wanted !== this.clip && this.heldFor >= MIN_HOLD_S) {
      this.clip = wanted
      this.heldFor = 0
    }
    return { clip: this.clip, timeScale: this.clip === 'Walk' ? walkTimeScale(this.speed) : 1 }
  }

  private wantedClip(): AvatarClipName {
    const s = this.speed
    switch (this.clip) {
      case 'Run':
        if (s >= RUN_EXIT) return 'Run'
        return s >= WALK_EXIT ? 'Walk' : 'Idle'
      case 'Walk':
        if (s >= RUN_ENTER) return 'Run'
        return s >= WALK_EXIT ? 'Walk' : 'Idle'
      default:
        if (s >= RUN_ENTER) return 'Run'
        return s >= WALK_ENTER ? 'Walk' : 'Idle'
    }
  }
}
