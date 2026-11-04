<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { labelRows, worldToMap, type MapMarker, type MapMarkerKind, type WorldMapImage } from '../../game/world/minimap'
import type { UiIconName } from '../ui/icons'
import UiIcon from '../ui/UiIcon.vue'

/** Corner map (north up, follows the player) and, when `fullOpen`, the whole town with a legend. Display only. */
const props = defineProps<{
  image: WorldMapImage | null
  markers: MapMarker[]
  player: { x: number; z: number; heading: number }
  insideName: string | null
  fullOpen: boolean
  mapKey: string
}>()

const emit = defineEmits<{ close: [] }>()

/** Corner map diameter (px) and the world radius it shows (m). */
const SIZE = 168
const VIEW_RADIUS = 60
const PX_PER_M = SIZE / 2 / VIEW_RADIUS
/** Your home stays on the corner map's rim when it is out of view, so you can always head back. */
const RIM = SIZE / 2 - 12

const MARKER_STYLE: Record<MapMarkerKind, { icon: UiIconName; color: string; label: string }> = {
  store: { icon: 'shop', color: 'rgb(var(--cc-coral))', label: 'Shop' },
  work: { icon: 'briefcase', color: 'rgb(var(--cc-pool))', label: 'Job' },
  home: { icon: 'home', color: 'rgb(var(--cc-sun))', label: 'Your home' },
}

const cornerBackground = computed(() => {
  const img = props.image
  if (!img) return {}
  const { area } = img
  const w = (area.maxX - area.minX) * PX_PER_M
  const h = (area.maxZ - area.minZ) * PX_PER_M
  return {
    backgroundImage: `url(${img.url})`,
    backgroundSize: `${w}px ${h}px`,
    backgroundPosition: `${SIZE / 2 - (props.player.x - area.minX) * PX_PER_M}px ${SIZE / 2 - (props.player.z - area.minZ) * PX_PER_M}px`,
  }
})

const cornerMarkers = computed(() =>
  props.markers.flatMap((m) => {
    let dx = (m.x - props.player.x) * PX_PER_M
    let dy = (m.z - props.player.z) * PX_PER_M
    const d = Math.hypot(dx, dy)
    if (d > RIM) {
      if (m.kind !== 'home') return []
      dx *= RIM / d
      dy *= RIM / d
    }
    return [{ ...m, left: SIZE / 2 + dx, top: SIZE / 2 + dy }]
  }),
)

const fullMapRef = ref<HTMLElement | null>(null)
const fullMapPx = ref({ w: 0, h: 0 })
const resizeObserver = new ResizeObserver(([entry]) => {
  if (entry) fullMapPx.value = { w: entry.contentRect.width, h: entry.contentRect.height }
})
watch(fullMapRef, (el, previous) => {
  if (previous) resizeObserver.unobserve(previous)
  if (el) resizeObserver.observe(el)
})
onBeforeUnmount(() => resizeObserver.disconnect())

const fullMarkers = computed(() => {
  const img = props.image
  if (!img) return []
  const pins = props.markers.map((m) => ({ ...m, ...worldToMap(m.x, m.z, img.area) }))
  const rows = labelRows(pins, fullMapPx.value)
  // label centre, in px from the pin centre: rows of 14px, pushed 3px further out to clear the pin
  return pins.map((pin, i) => {
    const row = rows[i] ?? 1
    return { ...pin, labelDy: row * 14 + Math.sign(row) * 3 }
  })
})
const fullPlayer = computed(() => (props.image ? worldToMap(props.player.x, props.player.z, props.image.area) : null))
const fullAspect = computed(() => {
  const area = props.image?.area
  return area ? (area.maxX - area.minX) / (area.maxZ - area.minZ) : 1
})
</script>

<template>
  <div v-if="image" class="pointer-events-none absolute right-3 top-14 z-10 flex flex-col items-center gap-1">
    <div class="cc-minimap relative overflow-hidden rounded-full" :style="{ width: `${SIZE}px`, height: `${SIZE}px`, ...cornerBackground }">
      <span
        v-for="m in cornerMarkers"
        :key="m.id"
        class="cc-map-pin absolute"
        :style="{ left: `${m.left}px`, top: `${m.top}px`, background: MARKER_STYLE[m.kind].color }"
        :title="m.name"
      >
        <UiIcon :name="MARKER_STYLE[m.kind].icon" :size="11" :stroke-width="2.6" />
      </span>
      <span class="cc-map-player absolute left-1/2 top-1/2" :style="{ transform: `translate(-50%, -50%) rotate(${player.heading}deg)` }" />
      <span class="absolute left-1/2 top-1 -translate-x-1/2 font-display text-[10px] text-fog [text-shadow:0_1px_2px_rgb(0_0_0)]">N</span>
    </div>
    <span class="cc-hud px-2 py-0.5 text-[10px] font-bold text-fog">
      <template v-if="insideName">In {{ insideName }} · </template><span class="text-mist">{{ mapKey }}</span> Map
    </span>
  </div>

  <div v-if="image && fullOpen" class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-ink-950/80 p-4" @click.self="emit('close')">
    <div class="cc-hud flex items-center gap-4 px-4 py-1.5 text-xs font-bold">
      <span class="font-display uppercase tracking-[0.2em] text-sun">Cove map</span>
      <span v-for="(style, kind) in MARKER_STYLE" :key="kind" class="inline-flex items-center gap-1.5">
        <span class="cc-map-pin static" :style="{ background: style.color }"><UiIcon :name="style.icon" :size="11" :stroke-width="2.6" /></span>
        {{ style.label }}
      </span>
      <span class="inline-flex items-center gap-1.5"><span class="cc-map-player static" /> You</span>
      <button type="button" class="ml-2 text-mist transition hover:text-coral" aria-label="Close the map" @click="emit('close')">
        <UiIcon name="x" :size="16" />
      </button>
    </div>
    <div
      ref="fullMapRef"
      class="cc-minimap relative max-h-[82vh] max-w-[94vw] rounded-xl"
      :style="{ aspectRatio: fullAspect, width: `min(94vw, calc(82vh * ${fullAspect}))` }"
    >
      <img :src="image.url" alt="Map of the Cove" class="block h-full w-full rounded-xl" draggable="false" />
      <template v-for="m in fullMarkers" :key="m.id">
        <span
          class="cc-map-pin absolute"
          :style="{ left: `${m.u * 100}%`, top: `${m.v * 100}%`, background: MARKER_STYLE[m.kind].color }"
        >
          <UiIcon :name="MARKER_STYLE[m.kind].icon" :size="12" :stroke-width="2.6" />
        </span>
        <span
          class="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold leading-none text-fog [text-shadow:0_1px_2px_rgb(0_0_0),0_0_4px_rgb(0_0_0)]"
          :style="{ left: `${m.u * 100}%`, top: `calc(${m.v * 100}% + ${m.labelDy}px)` }"
        >
          {{ m.name }}
        </span>
      </template>
      <span
        v-if="fullPlayer"
        class="cc-map-player absolute"
        :style="{ left: `${fullPlayer.u * 100}%`, top: `${fullPlayer.v * 100}%`, transform: `translate(-50%, -50%) rotate(${player.heading}deg)` }"
      />
    </div>
  </div>
</template>

<style scoped>
.cc-minimap {
  background-color: rgb(var(--cc-ink-950));
  background-repeat: no-repeat;
  box-shadow: 0 0 0 3px rgb(255 255 255 / 0.2), 0 4px 0 rgb(0 0 0 / 0.35);
}
.cc-map-pin {
  display: inline-flex;
  height: 18px;
  width: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: rgb(var(--cc-ink-950));
  box-shadow: 0 0 0 2px rgb(0 0 0 / 0.55);
}
.cc-map-pin.absolute {
  transform: translate(-50%, -50%);
}
/* a triangle pointing where the player looks */
.cc-map-player {
  display: inline-block;
  height: 16px;
  width: 13px;
  background: rgb(var(--cc-fog));
  clip-path: polygon(50% 0, 100% 100%, 50% 78%, 0 100%);
  filter: drop-shadow(0 0 2px rgb(0 0 0));
}
</style>
