<script setup lang="ts">
import { computed } from 'vue'
import { actionKeyLabels } from '../../config/keybindings'

const rotateKey = computed(() => actionKeyLabels('rotate')[0] ?? '?')
defineProps<{
  visible: boolean
  hints: string[]
}>()
</script>

<template>
  <div
    v-show="visible && hints.length > 0"
    class="pointer-events-none fixed bottom-28 left-1/2 z-20 max-w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2"
  >
    <div class="cc-hud px-4 py-2.5 text-center">
      <p v-for="(line, i) in hints" :key="`hud-${i}`" class="m-0 text-xs font-bold leading-relaxed text-fog">
        {{ line }}
      </p>
      <div class="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] font-bold text-mist">
        <span class="cc-keycap">LMB</span><span>place / pick</span>
        <span class="cc-keycap">RMB</span><span>cancel</span>
        <span class="cc-keycap">{{ rotateKey }}</span><span>rotate</span>
        <span class="cc-keycap">⇧ {{ rotateKey }}</span><span>reverse</span>
      </div>
    </div>
  </div>
</template>
