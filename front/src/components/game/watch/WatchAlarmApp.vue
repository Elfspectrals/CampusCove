<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AlarmAlert } from '../../../game/watch/alarms'
import WatchRow from './WatchRow.vue'

const props = defineProps<{ alerts: readonly AlarmAlert[]; selected: number }>()

const { t } = useI18n()

function time(at: string): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

defineExpose({ rowKeys: computed(() => props.alerts.map((alert) => alert.id)), activate: () => undefined })
</script>

<template>
  <div>
    <p v-if="alerts.length === 0" class="m-0 px-2 py-3 text-center text-xs text-mist">{{ t('watch.alarm.empty') }}</p>
    <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
      <WatchRow
        v-for="(alert, index) in alerts"
        :key="alert.id"
        :selected="index === selected"
        dot="coral"
        :name="alert.kind === 'live' ? t('watch.alarm.live') : t('watch.alarm.away', { count: alert.count })"
        :meta="time(alert.at)"
      />
    </ul>
  </div>
</template>
