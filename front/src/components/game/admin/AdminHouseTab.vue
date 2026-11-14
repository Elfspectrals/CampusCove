<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useAdminWatch } from '../../../composables/game/useAdminWatch'
import { useHoldAction } from '../../../composables/game/useHoldAction'
import { housePins, houseRegions, regionCrop, type HousePin } from '../../../game/admin/adminPanel'
import type { WorldMapImage } from '../../../game/world/minimap'
import type { WorldZone } from '../../../game/world/worldManifest'
import type { AdminPlayerPayload } from '../../../types/gameRealtime'
import UiIcon from '../../ui/UiIcon.vue'
import AdminThumb from '../AdminThumb.vue'
import AdminHoldButton from './AdminHoldButton.vue'

/**
 * One part of the town at a time, seen from above, every house pinned on it; the arrows go to the next part.
 * A free house can be given, the chosen player's own house taken back.
 */
const props = defineProps<{
  admin: ReturnType<typeof useAdminWatch>
  mapImage: WorldMapImage | null
  zones: readonly WorldZone[]
  target: string
  targetName: string
  targetIsHere: boolean
  sheet: AdminPlayerPayload | null
}>()

const { t, te } = useI18n()
const hold = useHoldAction()

const regions = computed(() => houseRegions(props.zones, props.admin.houses.value))
const regionIndex = ref(0)
const region = computed(() => regions.value[regionIndex.value] ?? null)
const selectedUnit = ref<string | null>(null)

const targetAccount = computed(() => props.sheet?.accountId ?? null)
const pins = computed(() => (region.value ? housePins(region.value.units, region.value.area, targetAccount.value) : []))
const selected = computed(() => pins.value.find((p) => p.unit === selectedUnit.value) ?? null)
const crop = computed(() => (props.mapImage && region.value ? regionCrop(props.mapImage.area, region.value.area) : null))
const aspect = computed(() => {
  const area = region.value?.area
  return area ? (area.maxX - area.minX) / (area.maxZ - area.minZ) : 1
})
/** The region that holds the chosen player's house, if they own one. */
const theirsRegion = computed(() =>
  regions.value.findIndex((r) => targetAccount.value !== null && r.units.some((u) => u.occupant_account_id === targetAccount.value)),
)

function regionName(key: string): string {
  const name = `adminPanel.regions.${key}`
  return te(name) ? t(name) : key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function step(direction: -1 | 1): void {
  const count = regions.value.length
  if (count === 0) return
  regionIndex.value = (regionIndex.value + direction + count) % count
  selectedUnit.value = null
}

function showTheirs(): void {
  if (theirsRegion.value < 0) return
  regionIndex.value = theirsRegion.value
  selectedUnit.value = pins.value.find((p) => p.state === 'theirs')?.unit ?? null
}

// once the chosen player's sheet is in, show the part of town where their house stands
watch(
  targetAccount,
  () => {
    if (theirsRegion.value >= 0) regionIndex.value = theirsRegion.value
    selectedUnit.value = null
  },
  { immediate: true },
)

const PIN_CLASS: Record<HousePin['state'], string> = {
  vacant: 'bg-mint text-ink-950',
  theirs: 'bg-sun text-ink-950',
  taken: 'bg-ink-700 text-mist',
}
</script>

<template>
  <p class="m-0 text-[11px] text-mist">{{ t('adminPanel.houseHint', { name: targetName }) }}</p>

  <p v-if="!mapImage || regions.length === 0" class="m-0 text-xs text-mist">{{ t('adminPanel.loading') }}</p>
  <template v-else-if="region && crop">
    <div class="flex items-center gap-1" role="group" :aria-label="t('adminPanel.region')">
      <button type="button" class="grid min-h-11 min-w-11 place-items-center rounded-lg bg-ink-900 text-fog hover:bg-ink-700" :aria-label="t('adminPanel.previousRegion')" @click="step(-1)">
        <UiIcon name="chevron-left" :size="18" />
      </button>
      <div class="min-w-0 flex-1 text-center">
        <b class="block truncate font-display text-base text-fog">{{ regionName(region.key) }}</b>
        <small class="text-[11px] text-mist">{{ regionIndex + 1 }} / {{ regions.length }} · {{ t('adminPanel.housesHere', { n: pins.length }) }}</small>
      </div>
      <button type="button" class="grid min-h-11 min-w-11 place-items-center rounded-lg bg-ink-900 text-fog hover:bg-ink-700" :aria-label="t('adminPanel.nextRegion')" @click="step(1)">
        <UiIcon name="chevron-right" :size="18" />
      </button>
    </div>

    <div class="relative w-full shrink-0 overflow-hidden rounded-lg bg-ink-950 ring-1 ring-line/10" :style="{ aspectRatio: String(aspect) }">
      <img
        :src="mapImage.url"
        alt=""
        draggable="false"
        class="pointer-events-none absolute max-w-none select-none"
        :style="{ width: `${crop.width}%`, left: `${crop.left}%`, top: `${crop.top}%` }"
      />
      <button
        v-for="pin in pins"
        :key="pin.unit"
        type="button"
        :class="[
          'absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow ring-2',
          PIN_CLASS[pin.state],
          selectedUnit === pin.unit ? 'z-10 scale-125 ring-fog' : 'ring-ink-950/60',
        ]"
        :style="{ left: `${pin.u * 100}%`, top: `${pin.v * 100}%` }"
        :aria-label="`${pin.name} · ${t(`adminPanel.houseStates.${pin.state}`, { name: targetName })}`"
        :title="pin.name"
        @click="selectedUnit = pin.unit"
      >
        <UiIcon name="home" :size="14" />
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-[11px] text-mist">
      <span class="inline-flex items-center gap-1"><span class="size-2.5 rounded-full bg-mint" />{{ t('adminPanel.houseStates.vacant') }}</span>
      <span class="inline-flex items-center gap-1"><span class="size-2.5 rounded-full bg-sun" />{{ t('adminPanel.houseStates.theirs', { name: targetName }) }}</span>
      <span class="inline-flex items-center gap-1"><span class="size-2.5 rounded-full bg-ink-700 ring-1 ring-line/20" />{{ t('adminPanel.houseStates.taken') }}</span>
      <button v-if="theirsRegion >= 0" type="button" class="ml-auto inline-flex min-h-8 items-center gap-1 rounded-full bg-sun/20 px-2.5 font-bold text-sun" @click="showTheirs">
        <UiIcon name="home" :size="12" />{{ t('adminPanel.showTheirs', { name: targetName }) }}
      </button>
    </div>

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
</template>
