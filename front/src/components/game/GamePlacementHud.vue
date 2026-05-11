<script setup lang="ts">
defineProps<{
  visible: boolean
  hints: string[]
}>()
</script>

<template>
  <div
    v-show="visible && hints.length > 0"
    class="pointer-events-none fixed bottom-8 left-1/2 z-20 max-w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2"
  >
    <div
      class="rounded-xl border border-white/15 bg-black/60 px-4 py-2 text-center shadow-lg backdrop-blur-md"
    >
      <p v-for="(line, i) in hints" :key="`hud-${i}`" class="text-xs leading-relaxed text-white/90">
        {{ line }}
      </p>
      <div class="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] text-white/75">
        <span class="rounded bg-white/10 px-1.5 py-0.5">LMB</span>
        <span>place / pick</span>
        <span class="rounded bg-white/10 px-1.5 py-0.5">RMB</span>
        <span>cancel</span>
        <span class="rounded bg-white/10 px-1.5 py-0.5">R</span>
        <span>rotate</span>
        <span class="rounded bg-white/10 px-1.5 py-0.5">Shift+R</span>
        <span>reverse</span>
      </div>
    </div>
  </div>
</template>
