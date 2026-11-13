<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BankScreen } from '../../../api/bank'
import { useBankOperationLabel } from '../../../composables/game/useBankOperationLabel'
import UiCurrency from '../../ui/UiCurrency.vue'
import WatchRow from './WatchRow.vue'

const props = defineProps<{ screen: BankScreen | null; atmDistance: number | null; selected: number }>()

const emit = defineEmits<{ routeAtm: [] }>()

const { t } = useI18n()
const operationLabel = useBankOperationLabel()

const history = computed(() => props.screen?.history ?? [])

function signed(delta: number): string {
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`
}

function activate(index: number): void {
  if (index === 0) emit('routeAtm')
}

defineExpose({ rowKeys: computed(() => (props.screen ? ['atm', ...history.value.map((op, index) => `${op.at}-${index}`)] : [])), activate })
</script>

<template>
  <div>
    <p v-if="!screen" class="m-0 px-2 py-3 text-center text-xs text-mist">{{ t('watch.bank.loading') }}</p>
    <template v-else>
      <div class="grid grid-cols-2 gap-1.5 px-1 pb-1.5">
        <div class="rounded-xl bg-ink-800 px-2.5 py-2">
          <span class="block text-[11px] font-semibold text-mist">{{ t('gameMoney.cash') }}</span>
          <UiCurrency currency="coins" :amount="screen.cash" :size="16" class="font-display text-lg font-extrabold" />
        </div>
        <div class="rounded-xl bg-ink-800 px-2.5 py-2">
          <span class="block text-[11px] font-semibold text-mist">{{ t('gameMoney.bank') }}</span>
          <UiCurrency currency="coins" :amount="screen.bank" :size="16" class="font-display text-lg font-extrabold" />
        </div>
      </div>
      <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
        <WatchRow
          :selected="selected === 0"
          dot="sun"
          :name="t('watch.bank.atmOnly')"
          :meta="atmDistance === null ? '' : t('watch.meters', { d: Math.round(atmDistance) })"
        />
        <WatchRow
          v-for="(op, index) in history"
          :key="`${op.at}-${index}`"
          :selected="index + 1 === selected"
          :dot="op.delta < 0 ? 'coral' : 'mint'"
          :name="operationLabel(op)"
          :meta="signed(op.delta)"
          :meta-class="op.delta < 0 ? 'font-bold text-coral' : 'font-bold text-mint'"
        />
      </ul>
      <p v-if="history.length === 0" class="m-0 px-2 py-2 text-center text-xs text-mist">{{ t('watch.bank.empty') }}</p>
    </template>
  </div>
</template>
