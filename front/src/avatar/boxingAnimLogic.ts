export const BOX_STEP_DESIGN_SPEED = 2.5
const STEP_BLEND_FROM = 0.3
const STEP_BLEND_TO = 1.6
const STEP_TIMESCALE_MIN = 0.7
const STEP_TIMESCALE_MAX = 1.4

export const LOWER_BODY_BONES = ['Hips', 'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR', 'ToeL', 'ToeR'] as const
export const UPPER_BODY_BONES = ['Spine', 'Chest', 'Neck', 'Head', 'ShoulderL', 'ShoulderR', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'HandL', 'HandR'] as const

export type UpperLoop = 'Guard' | 'Block'
export type UpperShot = 'Jab' | 'Cross' | 'Hook' | 'DodgeL' | 'DodgeR' | 'HitReact'
export type FullBody = 'Knockdown' | 'Down' | 'GetUp' | 'KO' | 'Win'
export type UpperClip = UpperLoop | UpperShot

export const UPPER_SHOT_CLIPS: readonly UpperShot[] = ['Jab', 'Cross', 'Hook', 'DodgeL', 'DodgeR', 'HitReact']
export const FULL_BODY_ONE_SHOTS: readonly FullBody[] = ['Knockdown', 'GetUp', 'KO']

function smoothstep(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

export function footwork(speed: number): { idle: number; step: number; stepTimeScale: number } {
  const step = smoothstep(STEP_BLEND_FROM, STEP_BLEND_TO, Math.max(0, speed))
  const stepTimeScale = Math.min(STEP_TIMESCALE_MAX, Math.max(STEP_TIMESCALE_MIN, speed / BOX_STEP_DESIGN_SPEED))
  return { idle: 1 - step, step, stepTimeScale }
}

export function keepsTrack(trackName: string, bones: readonly string[]): boolean {
  const bone = trackName.split('.')[0]!
  return bones.includes(bone)
}

export interface BoxerPose {
  guard: boolean
  down: boolean
  result: 'won' | 'lost' | 'draw' | null
}

export class BoxingAnimState {
  upper: UpperClip = 'Guard'
  full: FullBody | null = null
  private wasDown = false

  shot(clip: UpperShot): UpperClip | null {
    if (this.full !== null) return null
    this.upper = clip
    return clip
  }

  shotFinished(clip: UpperShot, guard: boolean): UpperLoop | null {
    if (this.upper !== clip) return null
    this.upper = guard ? 'Block' : 'Guard'
    return this.upper
  }

  pose(next: BoxerPose): { upper: UpperClip | null; full: FullBody | null | 'none' } {
    let full: FullBody | null | 'none' = 'none'
    if (next.result === 'lost' && this.full !== 'KO') full = this.full = 'KO'
    else if (next.result === 'won' && this.full !== 'Win') full = this.full = 'Win'
    else if (next.result === null && next.down && !this.wasDown) full = this.full = 'Knockdown'
    else if (next.result === null && !next.down && this.wasDown) full = this.full = 'GetUp'
    this.wasDown = next.down
    let upper: UpperClip | null = null
    const loop: UpperLoop = next.guard ? 'Block' : 'Guard'
    if (!UPPER_SHOT_CLIPS.includes(this.upper as UpperShot) && this.upper !== loop) upper = this.upper = loop
    return { upper, full }
  }

  fullFinished(clip: FullBody): FullBody | null {
    if (this.full !== clip) return null
    this.full = clip === 'Knockdown' ? 'Down' : clip === 'GetUp' ? null : clip
    return this.full
  }
}

export function punchClip(kind: 'jab' | 'cross' | 'hook'): UpperShot {
  return kind === 'jab' ? 'Jab' : kind === 'cross' ? 'Cross' : 'Hook'
}
