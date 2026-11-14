<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useAdminWatch } from '../../../composables/game/useAdminWatch'
import { useHoldAction } from '../../../composables/game/useHoldAction'
import { housePins, type HousePin } from '../../../game/admin/adminPanel'
import type { WorldMapImage } from '../../../game/world/minimap'
import type { AdminPlayerPayload } from '../../../types/gameRealtime'
import UiIcon from '../../ui/UiIcon.vue'
import AdminThumb from '../AdminThumb.vue'
import AdminHoldButton from './AdminHoldButton.vue'

/** The town seen from above with every house pinned: a free one can be given, the chosen player's taken back. */
const props = defineProps<{
  admin: ReturnType<typeof useAdminWatch>
  mapImage: WorldMapImage | null
  target: string
  targetName: string
  targetIsHere: boolean
  sheet: AdminPlayerPayload | null
}>()

const { t } = useI18n()
const hold = useHoldAction()

const ZOOMS = [1, 2, 3] as const
const zoom = ref<(typeof ZOOMS)[number]>(2)
const selectedUnit = ref<string | null>(null)
const mapRef = ref<HTMLElement | null>(null)

const pins = computed(() => (props.mapImage ? housePins(props.admin.houses.value, props.mapImage.area, props.sheet?.accountId ?? null) : []))
const selected = computed(() => pins.value.find((p) => p.unit === selectedUnit.value) ?? null)
const theirs = computed(() => pins.value.find((p) => p.state === 'theirs') ?? null)
const aspect = computed(() => {
  const area = props.mapImage?.area
  return area ? (area.maxX - area.minX) / (area.maxZ - area.minZ) : 1
})

const PIN_CLASS: Record<HousePin['state'], string> = {
  vacant: 'bg-mint text-ink-950',
  theirs: 'bg-sun text-ink-950',
  taken: 'bg-ink-700 text-mist',
}

function choose(pin: HousePin): void {
  selectedUnit.value = pin.unit
}

/** Brings the house of the chosen player into view. */
function showTheirs(): void {
  const pin = theirs.value
  const map = mapRef.value
  if (!pin || !map) return
  selectedUnit.value = pin.unit
  map.scrollTo({ left: pin.u * map.scrollWidth - map.clientWidth / 2, top: pin.v * map.scrollHeight - map.clientHeight / 2, behavior: 'smooth' })
}
</script>

<template>
  <p class="m-0 text-[11px] text-mist">{{ t('adminPanel.houseHint', { name: targetName }) }}</p>

  <div class="flex flex-wrap items-center gap-2 text-[11px] text-mist">
    <span class="inline-flex items-center gap-1"><span class="size-2.5 rounded-full bg-mint" />{{ t('adminPanel.houseStates.vacant') }}</span>
    <span class="inline-flex items-center gap-1"><span class="size-2.5 rounded-full bg-sun" />{{ t('adminPanel.houseStates.theirs', { name: targetName }) }}</span>
    <span class="inline-flex items-center gap-1"><span class="size-2.5 rounded-full bg-ink-700 ring-1 ring-line/20" />{{ t('adminPanel.houseStates.taken') }}</span>
    <span class="ml-auto flex gap-0.5" role="radiogroup" :aria-label="t('adminPanel.zoom')">
      <button
        v-for="z in ZOOMS"
        :key="z"
        type="button"
        role="radio"
        :aria-checked="zoom === z"
        :class="['min-h-8 min-w-8 rounded-md px-1.5 font-bold', zoom === z ? 'bg-sun text-ink-950' : 'bg-ink-900 text-mist']"
        @click="zoom = z"
      >
        ×{{ z }}
      </button>
    </span>
  </div>

  <p v-if="!mapImage" class="m-0 text-xs text-mist">{{ t('adminPanel.loading') }}</p>
  <div v-else ref="mapRef" class="relative max-h-[260px] min-h-[160px] shrink-0 overflow-auto rounded-lg bg-ink-950 ring-1 ring-line/10">
    <div class="relative" :style="{ width: `${zoom * 100}%`, aspectRatio: String(aspect) }">
      <img :src="mapImage.url" alt="" class="absolute inset-0 size-full select-none" draggable="false" />
      <button
        v-for="pin in pins"
        :key="pin.unit"
        type="button"
        :class="[
          'absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow ring-2',
          PIN_CLASS[pin.state],
          selectedUnit === pin.unit ? 'z-10 scale-125 ring-fog' : 'ring-ink-950/60',
        ]"
        :style="{ left: `${pin.u * 100}%`, top: `${pin.v * 100}%` }"
        :aria-label="`${pin.name} · ${t(`adminPanel.houseStates.${pin.state}`, { name: targetName })}`"
        :title="pin.name"
        @click="choose(pin)"
      >
        <UiIcon name="home" :size="11" />
      </button>
    </div>
  </div>

  <button v-if="theirs" type="button" class="inline-flex min-h-9 items-center gap-1.5 self-start rounded-full bg-sun/20 px-3 text-xs font-bold text-sun" @click="showTheirs">
    <UiIcon name="home" :size="13" />{{ t('adminPanel.showTheirs', { name: targetName }) }}
  </button>

  <div v-if="selected" class="flex items-center gap-2.5 rounded-lg bg-ink-900 p-2">
    <AdminThumb :src="selected.preview" icon="home" :size="56" />
    <div class="min-w-0 flex-1">
      <b class="block truncate text-sm text-fog">{{ selected.name }}</b>
      <small class="block text-[11px] text-mist">{{ t('adminPanel.houseWorth', { price: selected.price.toLocaleString() }) }}</small>
      <small v-if="selected.owner" class="block truncate text-[11px] text-mist">{{ t('adminPanel.ownedBy', { name: selected.owner }) }}</small>
    </div>
    <AdminHoldButton
      v-if="selected.state === 'vacant'"
      :holding="hold.holding.value === `give:${selected.unit}`"
      :label="t('adminPanel.give')"
      :disabled="!targetIsHere"
      @start="hold.start(`give:${selected.unit}`, () => admin.giveHouse(target, selected!.unit))"
      @cancel="hold.cancel"
    />
    <AdminHoldButton
      v-else-if="selected.state === 'theirs'"
      danger
      :holding="hold.holding.value === `take:${selected.unit}`"
      :label="t('adminPanel.modes.take')"
      :disabled="!targetIsHere"
      @start="hold.start(`take:${selected.unit}`, () => admin.takeHouse(target))"
      @cancel="hold.cancel"
    />
  </div>
  <p v-else class="m-0 text-[11px] text-mist">{{ t('adminPanel.pickHouse') }}</p>
</template>
