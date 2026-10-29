import * as THREE from 'three'

interface SoundDef {
  urls: string[]
  volume: number
  /** 3D range of playOn: full volume up to refDistance, then a linear fade to silence at maxDistance. */
  refDistance?: number
  maxDistance?: number
}

const PITCH_SPREAD = 0.06
const REF_DISTANCE = 2
const MAX_DISTANCE = 15
/** Door sounds are discreet: the socket only sends them within 5 m (DOOR_SOUND_RADIUS), faded out by then. */
const DOOR_RANGE = { refDistance: 1, maxDistance: 5 }

const doorUrls = (name: string, count: number) => Array.from({ length: count }, (_, i) => `/assets/sfx/door/${name}_${i + 1}.mp3`)

const SOUNDS = {
  whoosh: { urls: ['/assets/sfx/punch/whoosh_1.mp3', '/assets/sfx/punch/whoosh_2.mp3', '/assets/sfx/punch/whoosh_3.mp3'], volume: 0.6 },
  impact: { urls: ['/assets/sfx/punch/impact_1.mp3', '/assets/sfx/punch/impact_2.mp3', '/assets/sfx/punch/impact_3.mp3'], volume: 1 },
  breath: { urls: ['/assets/sfx/punch/breath_1.mp3'], volume: 0.35 },
  door_open: { urls: doorUrls('open', 2), volume: 0.7, ...DOOR_RANGE },
  door_close: { urls: doorUrls('close', 2), volume: 0.9, ...DOOR_RANGE },
  door_lock: { urls: doorUrls('lock', 2), volume: 0.9, ...DOOR_RANGE },
  door_unlock: { urls: doorUrls('unlock', 2), volume: 0.9, ...DOOR_RANGE },
  door_rattle: { urls: doorUrls('rattle', 3), volume: 0.9, ...DOOR_RANGE },
} satisfies Record<string, SoundDef>

export type SfxName = keyof typeof SOUNDS

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
    const def: SoundDef = SOUNDS[name]
    audio.setDistanceModel('linear')
    audio.setRefDistance(def.refDistance ?? REF_DISTANCE)
    audio.setMaxDistance(def.maxDistance ?? MAX_DISTANCE)
    object.add(audio)
    start(audio, name, variants, delayS)
  }

  function dispose(): void {
    listener?.removeFromParent()
    listener = null
  }

  return { play, playOn, dispose, listener: ready }
}
