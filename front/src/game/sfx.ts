import * as THREE from 'three'
import { ZZFX } from 'zzfx'

const SOUNDS = {
  whoosh: [0.55, 0.2, 900, 0.04, 0.02, 0.13, 4, 1, -12, 0, 0, 0, 0, 1.5, 0, 0, 0, 1, 0, 0, 1800],
  impact: [1, 0.12, 110, 0, 0.02, 0.18, 0, 2, -8, 0, 0, 0, 0, 0.6, 0, 0.1, 0, 0.6, 0.03, 0, -900],
  breath: [0.35, 0.2, 500, 0.12, 0.08, 0.35, 4, 1, -2, 0, 0, 0, 0, 2, 0, 0, 0, 0.5, 0.1, 0, -1400],
} satisfies Record<string, number[]>

export type SfxName = keyof typeof SOUNDS

const VOLUME = 0.6
const REF_DISTANCE = 2
const MAX_DISTANCE = 15

export function createSfx(getCamera: () => THREE.Camera | undefined) {
  THREE.AudioContext.setContext(ZZFX.audioContext)
  let listener: THREE.AudioListener | null = null

  function ready(): THREE.AudioListener | null {
    const camera = getCamera()
    if (!camera) return null
    if (!listener) {
      listener = new THREE.AudioListener()
      camera.add(listener)
    }
    if (listener.context.state === 'suspended') void listener.context.resume()
    return listener
  }

  function buffer(context: AudioContext, name: SfxName): AudioBuffer {
    const samples = ZZFX.buildSamples(...SOUNDS[name])
    const out = context.createBuffer(1, samples.length, ZZFX.sampleRate)
    out.getChannelData(0).set(samples)
    return out
  }

  function start(audio: THREE.Audio<GainNode | PannerNode>, name: SfxName, delayS: number): void {
    audio.setBuffer(buffer(audio.context, name))
    audio.setVolume(VOLUME)
    const ended = audio.onEnded.bind(audio)
    audio.onEnded = () => {
      ended()
      audio.removeFromParent()
      audio.disconnect()
    }
    audio.play(delayS)
  }

  function play(name: SfxName): void {
    const target = ready()
    if (!target) return
    const audio = new THREE.Audio(target)
    target.add(audio)
    start(audio, name, 0)
  }

  function playOn(name: SfxName, object: THREE.Object3D, delayS = 0): void {
    const target = ready()
    if (!target) return
    const audio = new THREE.PositionalAudio(target)
    audio.setDistanceModel('linear')
    audio.setRefDistance(REF_DISTANCE)
    audio.setMaxDistance(MAX_DISTANCE)
    object.add(audio)
    start(audio, name, delayS)
  }

  function dispose(): void {
    listener?.removeFromParent()
    listener = null
  }

  return { play, playOn, dispose }
}
