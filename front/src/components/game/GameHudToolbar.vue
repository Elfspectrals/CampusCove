<script setup lang="ts">
import { getGraphicsQuality, toggleGraphicsQuality } from '../../game/graphicsQuality'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  positionLabel: string
  /** The quality toggle is only clickable while the pointer is free. */
  showGraphicsToggle: boolean
}>()

const graphicsQualityLabel = getGraphicsQuality() === 'low' ? 'Low' : 'High'

/** The renderer is configured at creation, so a quality change needs a reload. */
function onToggleGraphicsQuality(): void {
  toggleGraphicsQuality()
  window.location.reload()
}
</script>

<template>
  <div class="pointer-events-auto absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
    <span class="cc-hud inline-flex items-center gap-2 px-3 py-1.5 font-display text-sm tracking-wide">
      <UiIcon name="map" :size="16" class="text-sun" />
      Campus Town
    </span>
    <span class="cc-hud px-2.5 py-1.5 font-mono text-[11px] text-mist" title="Player world coordinates">
      XYZ {{ positionLabel }}
    </span>
    <button
      v-if="showGraphicsToggle"
      type="button"
      class="cc-hud inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-extrabold text-fog transition hover:border-sun/70 hover:text-sun"
      @click.stop="onToggleGraphicsQuality"
      @mousedown.stop
    >
      <UiIcon name="monitor" :size="14" /> {{ graphicsQualityLabel }}
    </button>
  </div>
</template>
