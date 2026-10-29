import * as THREE from 'three'

const SOUNDS = {
  whoosh: { urls: ['/assets/sfx/punch/whoosh_1.mp3', '/assets/sfx/punch/whoosh_2.mp3', '/assets/sfx/punch/whoosh_3.mp3'], volume: 0.6 },
  impact: { urls: ['/assets/sfx/punch/impact_1.mp3', '/assets/sfx/punch/impact_2.mp3', '/assets/sfx/punch/impact_3.mp3'], volume: 1 },
  breath: { urls: ['/assets/sfx/punch/breath_1.mp3'], volume: 0.35 },
}

export type SfxName = keyof typeof SOUNDS

const PITCH_SPREAD = 0.06
const REF_DISTANCE = 2
const MAX_DISTANCE = 15

export function createSfx(getCamera: () => THREE.Camera | undefined) {
  const loader = new THREE.AudioLoader()
  const buffers = new Map<SfxName, AudioBuffer[]>()
  let listener: THREE.AudioListener | null = null

  for (const name of Object.keys(SOUNDS) as SfxName[]) {
    Promise.all(SOUNDS[name].urls.map((url) => loader.loadAsync(url)))
      .then((loaded) => buffers.set(name, loaded))
      .catch((err: unknown) => console.error('[sfx] load failed', name, err))
  }

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

  function start(audio: THREE.Audio<GainNode | PannerNode>, name: SfxName, variants: AudioBuffer[], delayS: number): void {
    const buffer = variants[Math.floor(Math.random() * variants.length)]
    if (!buffer) throw new Error(`No sound loaded for ${name}`)
    audio.setBuffer(buffer)
    audio.setVolume(SOUNDS[name].volume)
    audio.setPlaybackRate(1 + (Math.random() * 2 - 1) * PITCH_SPREAD)
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
    const variants = buffers.get(name)
    if (!target || !variants) return
    const audio = new THREE.Audio(target)
    target.add(audio)
    start(audio, name, variants, 0)
  }

  function playOn(name: SfxName, object: THREE.Object3D, delayS = 0): void {
    const target = ready()
    const variants = buffers.get(name)
    if (!target || !variants) return
    const audio = new THREE.PositionalAudio(target)
    audio.setDistanceModel('linear')
    audio.setRefDistance(REF_DISTANCE)
    audio.setMaxDistance(MAX_DISTANCE)
    object.add(audio)
    start(audio, name, variants, delayS)
  }

  function dispose(): void {
    listener?.removeFromParent()
    listener = null
  }

  return { play, playOn, dispose }
}
