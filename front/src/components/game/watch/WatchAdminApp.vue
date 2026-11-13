<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AdminMenuPayload } from '../../../types/gameRealtime'
import WatchRow from './WatchRow.vue'

const props = defineProps<{ menu: AdminMenuPayload | null; selected: number }>()

const emit = defineEmits<{ teleport: [key: string]; summon: [sessionId: string] }>()

const { t } = useI18n()

const destinations = computed(() => props.menu?.destinations ?? [])
const players = computed(() => props.menu?.players ?? [])

function activate(index: number): void {
  const destination = destinations.value[index]
  if (destination) return emit('teleport', destination.key)
  const player = players.value[index - destinations.value.length]
  if (!player) throw new Error(`[WatchAdminApp] no row ${index}`)
  emit('summon', player.sessionId)
}

defineExpose({ rowCount: computed(() => destinations.value.length + players.value.length), activate })
</script>

<template>
  <div>
    <p v-if="!menu" class="m-0 px-2 py-3 text-center text-xs text-mist">{{ t('watch.admin.loading') }}</p>
    <template v-else>
      <p class="m-0 px-2 pb-1 pt-1 text-[11px] font-bold text-mist">{{ t('watch.admin.teleport') }}</p>
      <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
        <WatchRow
          v-for="(place, index) in destinations"
          :key="place.key"
          :selected="index === selected"
          dot="pool"
          :name="place.name"
          meta=""
        />
      </ul>
      <p class="m-0 px-2 pb-1 pt-2 text-[11px] font-bold text-mist">{{ t('watch.admin.bring') }}</p>
      <p v-if="players.length === 0" class="m-0 px-2 py-2 text-center text-xs text-mist">{{ t('watch.admin.nobody') }}</p>
      <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
        <WatchRow
          v-for="(player, index) in players"
          :key="player.sessionId"
          :selected="destinations.length + index === selected"
          dot="mint"
          :name="player.pseudo"
          :meta="t('watch.meters', { d: player.distance.toFixed(0) })"
        />
      </ul>
    </template>
  </div>
</template>
