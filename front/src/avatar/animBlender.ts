import * as THREE from 'three'
import { TWIN_SUFFIX, UPPER_BODY_BONES, clipOfInstance, fadeSeconds, freshInstance, phaseTime, sharesFootPhase, stepWeights } from './animBlend.ts'

export interface BlendLayerSpec {
  name: string
  keepsBone: (bone: string) => boolean
}

export interface TorsoSpec {
  layer: string
  anchor: string
  bone: string
}

export interface PlayOptions {
  fadeS?: number
  fromS?: number
  timeScale?: number
  once?: boolean
  onDone?: () => void
}

interface LayerState {
  spec: BlendLayerSpec
  weights: Map<string, number>
  target: Map<string, number>
  fadeS: number
  lead: string | null
  done: { instance: string; returnS: number; onDone: () => void } | null
}

const maskedByClip = new WeakMap<THREE.AnimationClip, Map<string, THREE.AnimationClip>>()
const anchorTracks = new WeakMap<THREE.AnimationClip, Map<string, THREE.Interpolant | null>>()
const authored = new THREE.Quaternion()
const sample = new THREE.Quaternion()
const delta = new THREE.Quaternion()

export function torsoDelta(actualAnchor: THREE.Quaternion, authoredAnchor: THREE.Quaternion, out: THREE.Quaternion): THREE.Quaternion {
  return out.copy(actualAnchor).invert().multiply(authoredAnchor)
}

function anchorInterpolant(clip: THREE.AnimationClip, anchor: string): THREE.Interpolant | null {
  let byAnchor = anchorTracks.get(clip)
  if (!byAnchor) anchorTracks.set(clip, (byAnchor = new Map()))
  if (!byAnchor.has(anchor)) {
    const track = clip.tracks.find((t) => t.name === `${anchor}.quaternion`)
    byAnchor.set(anchor, track ? new THREE.QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4)) : null)
  }
  return byAnchor.get(anchor)!
}

function maskedClip(clip: THREE.AnimationClip, layer: BlendLayerSpec, instance: string): THREE.AnimationClip {
  let byLayer = maskedByClip.get(clip)
  if (!byLayer) maskedByClip.set(clip, (byLayer = new Map()))
  const key = `${layer.name}:${instance}`
  let masked = byLayer.get(key)
  if (!masked) {
    masked = new THREE.AnimationClip(instance, clip.duration, clip.tracks.filter((track) => layer.keepsBone(track.name.split('.')[0]!)))
    byLayer.set(key, masked)
  }
  return masked
}

export const HUMAN_TORSO: TorsoSpec = { layer: 'upper', anchor: 'Hips', bone: 'Spine' }

export function humanBodyLayers(): BlendLayerSpec[] {
  return [
    { name: 'lower', keepsBone: (bone) => !UPPER_BODY_BONES.includes(bone) },
    { name: 'upper', keepsBone: (bone) => UPPER_BODY_BONES.includes(bone) },
  ]
}

export function createAnimBlender(mixer: THREE.AnimationMixer, root: THREE.Object3D, layers: readonly BlendLayerSpec[], torso: TorsoSpec | null = null) {
  const clips = new Map<string, THREE.AnimationClip>()
  const actions = new Map<string, THREE.AnimationAction>()
  const looping = new Set<string>()
  const timeScales = new Map<string, number>()
  const released = new Set<string>()
  const states = new Map<string, LayerState>(layers.map((spec) => [spec.name, { spec, weights: new Map(), target: new Map(), fadeS: 0, lead: null, done: null }]))

  function layerOf(name: string): LayerState {
    const layer = states.get(name)
    if (!layer) throw new Error(`animation blender has no ${name} layer`)
    return layer
  }

  function actionOf(layer: LayerState, instance: string): THREE.AnimationAction | null {
    const key = `${layer.spec.name}:${instance}`
    const found = actions.get(key)
    if (found) return found
    const clip = clips.get(clipOfInstance(instance))
    if (!clip) return null
    const action = mixer.clipAction(maskedClip(clip, layer.spec, instance), root)
    action.setEffectiveWeight(0)
    actions.set(key, action)
    return action
  }

  function add(list: Iterable<THREE.AnimationClip>): void {
    for (const clip of list) {
      clips.set(clip.name, clip)
      released.delete(clip.name)
    }
  }

  function has(clip: string): boolean {
    return clips.has(clip)
  }

  function play(layerName: string, clip: string, options: PlayOptions = {}): void {
    const layer = layerOf(layerName)
    if (!clips.has(clip)) return
    const restart = options.once === true || options.fromS !== undefined
    if (!restart && layer.lead !== null && clipOfInstance(layer.lead) === clip) {
      if (options.timeScale !== undefined) setTimeScale(clip, options.timeScale)
      return
    }
    const instance = restart ? freshInstance(clip, layer.weights) : clip
    const action = actionOf(layer, instance)
    if (!action) return
    const fadeS = options.fadeS ?? fadeSeconds(layer.lead, clip)
    if (restart || !action.isRunning() || (layer.weights.get(instance) ?? 0) === 0) {
      action.reset()
      action.time = options.fromS ?? footPhaseStart(layer, instance, action)
      action.setLoop(options.once ? THREE.LoopOnce : THREE.LoopRepeat, options.once ? 1 : Infinity)
      action.clampWhenFinished = options.once === true
      action.setEffectiveWeight(layer.weights.get(instance) ?? 0)
      action.play()
    }
    if (options.once) looping.delete(instance)
    else looping.add(instance)
    if (options.timeScale !== undefined) timeScales.set(clip, options.timeScale)
    action.timeScale = timeScales.get(clip) ?? 1
    layer.target = new Map([[instance, 1]])
    layer.fadeS = fadeS
    layer.lead = instance
    layer.done = options.onDone ? { instance, returnS: options.once ? fadeS : 0, onDone: options.onDone } : null
  }

  function mix(layerName: string, weights: Record<string, number>, fadeS: number): void {
    const layer = layerOf(layerName)
    const target = new Map<string, number>()
    let lead: string | null = null
    for (const [clip, w] of Object.entries(weights)) {
      const action = clips.has(clip) && w > 0 ? actionOf(layer, clip) : null
      if (!action) continue
      if (!action.isRunning()) {
        action.reset().setLoop(THREE.LoopRepeat, Infinity)
        action.setEffectiveWeight(0)
        action.play()
      }
      looping.add(clip)
      target.set(clip, w)
      if (lead === null || w > (target.get(lead) ?? 0)) lead = clip
    }
    if (target.size === 0) return
    layer.target = target
    layer.fadeS = fadeS
    layer.lead = lead
    layer.done = null
  }

  function setTimeScale(clip: string, timeScale: number): void {
    timeScales.set(clip, timeScale)
    for (const layer of states.values()) {
      for (const instance of [clip, clip + TWIN_SUFFIX]) {
        const action = actions.get(`${layer.spec.name}:${instance}`)
        if (action) action.timeScale = timeScale
      }
    }
  }

  function footPhaseStart(layer: LayerState, instance: string, action: THREE.AnimationAction): number {
    const from = layer.lead === null ? null : actions.get(`${layer.spec.name}:${layer.lead}`)
    if (!from || layer.lead === null || !sharesFootPhase(layer.lead, instance)) return 0
    return phaseTime(from.time, from.getClip().duration, action.getClip().duration)
  }

  function syncFootPhase(layer: LayerState): void {
    if (layer.lead === null) return
    const lead = actions.get(`${layer.spec.name}:${layer.lead}`)
    if (!lead) return
    for (const instance of layer.weights.keys()) {
      if (!sharesFootPhase(layer.lead, instance)) continue
      const follower = actions.get(`${layer.spec.name}:${instance}`)
      if (follower) follower.time = phaseTime(lead.time, lead.getClip().duration, follower.getClip().duration)
    }
  }

  function lead(layerName: string): string | null {
    const instance = layerOf(layerName).lead
    return instance === null ? null : clipOfInstance(instance)
  }

  function checkDone(layer: LayerState): void {
    const done = layer.done
    if (!done) return
    const action = actions.get(`${layer.spec.name}:${done.instance}`)
    if (!action) return
    const clip = action.getClip()
    const left = (clip.duration - action.time) / Math.max(1e-3, Math.abs(action.timeScale))
    if (left > done.returnS && action.isRunning()) return
    layer.done = null
    done.onDone()
  }

  function dropReleased(): void {
    for (const clip of released) {
      const live = [...states.values()].some((layer) => (layer.weights.get(clip) ?? 0) > 0 || (layer.weights.get(clip + TWIN_SUFFIX) ?? 0) > 0)
      if (live) continue
      for (const [key, action] of actions) {
        if (clipOfInstance(key.slice(key.indexOf(':') + 1)) !== clip) continue
        action.stop()
        mixer.uncacheAction(action.getClip(), root)
        actions.delete(key)
      }
      clips.delete(clip)
      released.delete(clip)
    }
  }

  function update(dt: number): void {
    restoreTorso()
    for (const layer of states.values()) {
      layer.weights = stepWeights(layer.weights, layer.target, dt, layer.fadeS)
      syncFootPhase(layer)
      for (const [key, action] of actions) {
        if (!key.startsWith(`${layer.spec.name}:`)) continue
        const instance = key.slice(layer.spec.name.length + 1)
        const w = layer.weights.get(instance) ?? 0
        action.setEffectiveWeight(w)
        if (w === 0 && !looping.has(instance) && action.isRunning()) action.stop()
      }
      checkDone(layer)
    }
    dropReleased()
  }

  let anchorBone: THREE.Object3D | null | undefined
  let torsoBone: THREE.Object3D | null | undefined
  const uncorrected = new THREE.Quaternion()
  let corrected = false

  function restoreTorso(): void {
    if (!corrected || !torsoBone) return
    torsoBone.quaternion.copy(uncorrected)
    corrected = false
  }

  function authoredAnchor(upper: LayerState, actual: THREE.Quaternion): boolean {
    let total = 0
    let differs = false
    authored.set(0, 0, 0, 0)
    for (const [instance, w] of upper.weights) {
      if (w <= 0) continue
      const action = actions.get(`${upper.spec.name}:${instance}`)
      const clip = clips.get(clipOfInstance(instance))
      const interpolant = action && clip ? anchorInterpolant(clip, torso!.anchor) : null
      if (interpolant && action) {
        const v = interpolant.evaluate(action.time)
        sample.set(v[0]!, v[1]!, v[2]!, v[3]!)
        differs ||= !lowerPlays(instance)
      } else sample.copy(actual)
      const sign = authored.dot(sample) < 0 ? -1 : 1
      authored.set(authored.x + sample.x * w * sign, authored.y + sample.y * w * sign, authored.z + sample.z * w * sign, authored.w + sample.w * w * sign)
      total += w
    }
    if (!differs || total <= 0) return false
    authored.normalize()
    return true
  }

  function lowerPlays(instance: string): boolean {
    const clip = clipOfInstance(instance)
    for (const [name, layer] of states) {
      if (name === torso!.layer) continue
      for (const [other, w] of layer.weights) if (w > 0 && clipOfInstance(other) !== clip) return false
    }
    return true
  }

  function correctTorso(): void {
    if (!torso) return
    const upper = states.get(torso.layer)
    if (!upper) return
    if (anchorBone === undefined) anchorBone = root.getObjectByName(torso.anchor) ?? null
    if (torsoBone === undefined) torsoBone = root.getObjectByName(torso.bone) ?? null
    if (!anchorBone || !torsoBone) return
    if (!authoredAnchor(upper, anchorBone.quaternion)) return
    uncorrected.copy(torsoBone.quaternion)
    corrected = true
    torsoBone.quaternion.premultiply(torsoDelta(anchorBone.quaternion, authored, delta))
  }

  function release(list: Iterable<string>): void {
    for (const clip of list) released.add(clip)
  }

  function dispose(): void {
    for (const action of actions.values()) {
      action.stop()
      mixer.uncacheAction(action.getClip(), root)
    }
    actions.clear()
    clips.clear()
  }

  return { add, has, play, mix, setTimeScale, lead, update, correctTorso, release, dispose }
}

export type AnimBlender = ReturnType<typeof createAnimBlender>
