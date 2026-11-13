<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContactRow } from '../../../game/watch/contacts'
import WatchRow from './WatchRow.vue'

const props = defineProps<{ rows: ContactRow[] | null; followedSessionId: string | null; selected: number }>()

const emit = defineEmits<{
  accept: [accountId: string, name: string]
  follow: [sessionId: string, name: string]
  ask: [pseudo: string]
}>()

const { t } = useI18n()

const GROUP_OF = { request: 'requests', friendHere: 'here', stranger: 'nearby', friendAway: 'away' } as const
const DOT_OF = { request: 'sun', friendHere: 'mint', stranger: 'pool', friendAway: 'mist' } as const

const list = computed(() => props.rows ?? [])

function startsGroup(index: number): boolean {
  const row = list.value[index]
  return row !== undefined && (index === 0 || list.value[index - 1]?.kind !== row.kind)
}

function nameOf(row: ContactRow): string {
  return row.kind === 'stranger' ? row.pseudo : row.name
}

function metaOf(row: ContactRow): string {
  if (row.kind === 'request') return t('watch.contacts.accept')
  if (row.kind === 'friendAway') return t('watch.contacts.notHere')
  const distance = t('watch.meters', { d: Math.round(row.distance) })
  if (row.kind === 'friendHere') return row.sessionId === props.followedSessionId ? `${distance} · ${t('watch.gps.following')}` : distance
  return `${distance} · ${row.asked ? t('watch.contacts.asked') : t('watch.contacts.add')}`
}

function activate(index: number): void {
  const row = list.value[index]
  if (!row) throw new Error(`[WatchContactsApp] no row ${index}`)
  if (row.kind === 'request') emit('accept', row.accountId, row.name)
  else if (row.kind === 'friendHere') emit('follow', row.sessionId, row.name)
  else if (row.kind === 'stranger' && !row.asked) emit('ask', row.pseudo)
}

function keyOf(row: ContactRow): string {
  return `${row.kind}-${row.kind === 'stranger' ? row.sessionId : row.accountId}`
}

defineExpose({ rowKeys: computed(() => list.value.map(keyOf)), activate })
</script>

<template>
  <div>
    <p v-if="!rows" class="m-0 px-2 py-3 text-center text-xs text-mist">{{ t('watch.contacts.loading') }}</p>
    <p v-else-if="rows.length === 0" class="m-0 px-2 py-3 text-center text-xs text-mist">{{ t('watch.contacts.empty') }}</p>
    <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
      <template v-for="(row, index) in list" :key="keyOf(row)">
        <li v-if="startsGroup(index)" class="px-2 pb-0.5 pt-1.5 text-[11px] font-bold text-mist">{{ t(`watch.contacts.groups.${GROUP_OF[row.kind]}`) }}</li>
        <WatchRow :selected="index === selected" :dot="DOT_OF[row.kind]" :name="nameOf(row)" :meta="metaOf(row)" />
      </template>
    </ul>
  </div>
</template>
