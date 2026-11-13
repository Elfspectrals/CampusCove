<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GpsPlace, GpsPlaceAt } from '../../../game/watch/gps'
import WatchRow from './WatchRow.vue'

const props = defineProps<{ places: GpsPlaceAt[]; targetId: string | null; selected: number }>()

const emit = defineEmits<{ toggle: [place: GpsPlace] }>()

const { t } = useI18n()

const DOTS = { atm: 'mint', store: 'coral', work: 'pool', home: 'sun' } as const

function meta(place: GpsPlaceAt): string {
  const distance = t('watch.meters', { d: Math.round(place.distance) })
  return place.id === props.targetId ? `${distance} · ${t('watch.gps.following')}` : distance
}

function activate(index: number): void {
  const place = props.places[index]
  if (!place) throw new Error(`[WatchGpsApp] no row ${index}`)
  emit('toggle', place)
}

defineExpose({ rowCount: computed(() => props.places.length), activate })
</script>

<template>
  <div>
    <p v-if="places.length === 0" class="m-0 px-2 py-3 text-center text-xs text-mist">{{ t('watch.gps.loading') }}</p>
    <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
      <WatchRow
        v-for="(place, index) in places"
        :key="place.id"
        :selected="index === selected"
        :dot="DOTS[place.kind]"
        :name="place.name"
        :meta="meta(place)"
        :meta-class="place.id === targetId ? 'font-bold text-sun' : undefined"
      />
    </ul>
  </div>
</template>
