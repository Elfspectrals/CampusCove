<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Test3DScene } from '../../game/test3d/Test3DScene'

const containerRef = ref<HTMLElement | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
let scene: Test3DScene | null = null

onMounted(async () => {
  if (!containerRef.value) return
  scene = new Test3DScene(containerRef.value)
  try {
    await scene.load()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  scene?.dispose()
  scene = null
})
</script>

<template>
  <div class="relative h-full min-h-[560px] w-full overflow-hidden bg-[#bfdcf2] text-white">
    <div ref="containerRef" class="absolute inset-0" />
    <div class="cc-hud pointer-events-none absolute bottom-4 left-4 px-4 py-2 text-xs font-semibold">
      Click to capture the mouse · WASD / arrows to move · Shift to run · Space / C up and down · Esc frees the mouse
    </div>
    <div v-if="loading" class="cc-hud absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-3 text-sm font-bold">Loading…</div>
    <div v-if="loadError" class="cc-hud absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-3 text-sm font-bold">
      {{ loadError }}
    </div>
  </div>
</template>
