import * as THREE from 'three'

/** Moves `current` towards `target`, taking `seconds` for a full 0 → 1 swing. */
export function fadeTowards(current: number, target: number, dt: number, seconds: number): number {
  const step = dt / seconds
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step)
}

/**
 * Background music of a place (e.g. the Cove Threads store): a non-positional loop that fades in while `active`
 * and fades out, then pauses, once the player leaves. Loaded on the first visit only.
 */
export function createAmbientLoop(url: string, volume: number, getListener: () => THREE.AudioListener | null, fadeSeconds = 1.5) {
  let audio: THREE.Audio | null = null
  let loading = false
  let level = 0

  function load(listener: THREE.AudioListener): void {
    loading = true
    new THREE.AudioLoader()
      .loadAsync(url)
      .then((buffer) => {
        audio = new THREE.Audio(listener)
        audio.setBuffer(buffer)
        audio.setLoop(true)
        audio.setVolume(0)
        listener.add(audio)
      })
      .catch((err: unknown) => console.error('[ambient] load failed', url, err))
  }

  function update(dt: number, active: boolean): void {
    if (active && !audio && !loading) {
      const listener = getListener()
      if (listener) load(listener)
    }
    if (!audio) return
    level = fadeTowards(level, active ? 1 : 0, dt, fadeSeconds)
    if (level > 0 && !audio.isPlaying) audio.play()
    audio.setVolume(level * volume)
    if (level === 0 && audio.isPlaying) audio.pause()
  }

  function dispose(): void {
    if (audio?.isPlaying) audio.stop()
    audio?.removeFromParent()
    audio = null
  }

  return { update, dispose }
}
