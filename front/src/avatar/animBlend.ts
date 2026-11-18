export const TWIN_SUFFIX = '#twin'
export const UPPER_BODY_BONES: readonly string[] = ['Spine', 'Chest', 'Neck', 'Head', 'ShoulderL', 'ShoulderR', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'HandL', 'HandR']
const SILENT = 1e-3

export type Weights = ReadonlyMap<string, number>

export function stepWeights(current: Weights, target: Weights, dt: number, fadeS: number): Map<string, number> {
  const maxStep = fadeS <= 0 ? Infinity : dt / fadeS
  const names = [...new Set([...current.keys(), ...target.keys()])]
  const targetSum = [...target.values()].reduce((a, w) => a + w, 0)
  const next = new Map<string, number>()
  let risen = 0
  let fallingFloor = 0
  let fallingSpan = 0
  for (const name of names) {
    const from = current.get(name) ?? 0
    const to = target.get(name) ?? 0
    if (to >= from) {
      const w = Math.min(to, from + maxStep)
      next.set(name, w)
      risen += w
    } else {
      fallingFloor += to
      fallingSpan += from - to
    }
  }
  const keep = fallingSpan > 0 ? Math.min(1, Math.max(0, (targetSum - risen - fallingFloor) / fallingSpan)) : 0
  for (const name of names) {
    const from = current.get(name) ?? 0
    const to = target.get(name) ?? 0
    if (to < from) next.set(name, to + (from - to) * keep)
  }
  for (const [name, w] of next) if (w <= SILENT && !((target.get(name) ?? 0) > 0)) next.delete(name)
  return next
}

export function freshInstance(clip: string, weights: Weights): string {
  const twin = clip + TWIN_SUFFIX
  const own = weights.get(clip) ?? 0
  if (own <= SILENT) return clip
  return (weights.get(twin) ?? 0) < own ? twin : clip
}

export function clipOfInstance(instance: string): string {
  return instance.endsWith(TWIN_SUFFIX) ? instance.slice(0, -TWIN_SUFFIX.length) : instance
}

export type BlendGroup = 'locomotion' | 'seated' | 'punch' | 'guard' | 'upperAction' | 'hit' | 'fullOneShot' | 'other'

const GROUPS: Record<Exclude<BlendGroup, 'other'>, readonly string[]> = {
  locomotion: ['Idle', 'Walk', 'Run', 'Hold', 'Swim', 'Tread', 'Dribble', 'TennisReady', 'PetanqueCrouch', 'RunSet', 'Breathless', 'SkateGlide', 'SkatePush', 'BoxIdle', 'BoxStep'],
  seated: ['Sit'],
  punch: ['Jab', 'Cross', 'Hook', 'Uppercut', 'Punch', 'PunchL', 'FpJab', 'FpCross', 'FpHook', 'FpUppercut'],
  guard: ['Guard', 'Block', 'HookCharge', 'UppercutCharge', 'FpGuard', 'FpBlock', 'FpHookCharge', 'FpUppercutCharge'],
  upperAction: ['Eat', 'Drink', 'Pick'],
  hit: ['HitReact', 'FpHit'],
  fullOneShot: ['DodgeL', 'DodgeR', 'Knockdown', 'Down', 'GetUp', 'KO', 'Win', 'Stumble'],
}

export function blendGroup(clip: string): BlendGroup {
  const name = clipOfInstance(clip)
  for (const [group, clips] of Object.entries(GROUPS)) if (clips.includes(name)) return group as BlendGroup
  return 'other'
}

const DEFAULT_FADE_S = 0.22
type FadeEnd = BlendGroup | '*' | `=${string}`
const FADES: readonly [FadeEnd, FadeEnd, number][] = [
  ['=FpJab', 'punch', 0.05],
  ['=FpCross', 'punch', 0.05],
  ['=FpHook', 'punch', 0.05],
  ['=FpUppercut', 'punch', 0.05],
  ['punch', 'punch', 0.08],
  ['guard', 'punch', 0.05],
  ['locomotion', 'punch', 0.05],
  ['punch', '*', 0.15],
  ['*', 'hit', 0.05],
  ['hit', '*', 0.15],
  ['=Knockdown', '*', 0.3],
  ['=Down', '*', 0.3],
  ['=KO', '*', 0.3],
  ['*', '=Knockdown', 0.08],
  ['*', '=DodgeL', 0.06],
  ['*', '=DodgeR', 0.06],
  ['=DodgeL', '*', 0.12],
  ['=DodgeR', '*', 0.12],
  ['guard', 'guard', 0.12],
  ['=Run', '=Idle', 0.3],
  ['=Walk', '=Run', 0.2],
  ['=Run', '=Walk', 0.2],
  ['locomotion', 'locomotion', 0.25],
  ['*', 'seated', 0.35],
  ['seated', '*', 0.3],
  ['*', 'upperAction', 0.2],
  ['upperAction', '*', 0.25],
  ['*', 'fullOneShot', 0.1],
  ['fullOneShot', '*', 0.2],
]

function matches(end: FadeEnd, clip: string, group: BlendGroup): boolean {
  return end === '*' || end === group || end === `=${clip}`
}

export function fadeSeconds(from: string | null, to: string): number {
  if (from === null) return 0
  const fromClip = clipOfInstance(from)
  const toClip = clipOfInstance(to)
  const a = blendGroup(fromClip)
  const b = blendGroup(toClip)
  const row = FADES.find(([f, t]) => matches(f, fromClip, a) && matches(t, toClip, b))
  return row ? row[2] : DEFAULT_FADE_S
}
