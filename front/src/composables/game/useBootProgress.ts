import { computed, onUnmounted, shallowRef } from 'vue'
import * as THREE from 'three'
import {
  BOOT_STAGES,
  bootPercent,
  completeStage,
  createBootProgress,
  isBootDone,
  stageState,
  withFiles,
  type BootStage,
} from '../../game/loading/bootProgress'

/**
 * Boot progress of /game for the loading screen. File counts come from three.js' default loading manager, which every
 * GLTFLoader / TextureLoader / ImageBitmapLoader of the game uses. Logs `[boot]` stage timings once everything is in.
 */
export function useBootProgress() {
  const progress = shallowRef(createBootProgress(performance.now()))
  let shownPercent = 0
  const manager = THREE.DefaultLoadingManager

  manager.onProgress = (_url, loaded, total) => {
    if (isBootDone(progress.value)) return
    progress.value = withFiles(progress.value, loaded, total)
  }

  function complete(stage: BootStage): void {
    const before = progress.value
    progress.value = completeStage(before, stage, performance.now())
    if (before === progress.value || !isBootDone(progress.value)) return
    const timings = progress.value.timings
    const sincePage = Math.round(performance.now())
    console.info(`[boot] ready in ${Math.max(...BOOT_STAGES.map((s) => timings[s] ?? 0))} ms (${sincePage} ms since page load)`, timings)
  }

  const percent = computed(() => (shownPercent = bootPercent(progress.value, shownPercent)))
  const stages = computed(() => BOOT_STAGES.map((stage) => ({ stage, state: stageState(progress.value, stage) })))
  const files = computed(() => progress.value.files)
  const done = computed(() => isBootDone(progress.value))

  onUnmounted(() => {
    manager.onProgress = () => undefined
  })

  return { complete, percent, stages, files, done }
}
