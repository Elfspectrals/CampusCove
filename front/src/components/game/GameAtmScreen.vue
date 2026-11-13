<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BankScreen } from '../../api/bank'
import { useBankOperationLabel } from '../../composables/game/useBankOperationLabel'
import type { AtmOperation } from '../../composables/game/useAtm'
import { parseAmount, parseRecipient } from '../../game/bank'
import UiCurrency from '../ui/UiCurrency.vue'

const props = defineProps<{
  screen: BankScreen | null
  pending: boolean
  feedback: { kind: 'success' | 'error'; text: string } | null
}>()
const emit = defineEmits<{ run: [operation: AtmOperation]; clearFeedback: []; close: [] }>()

const { t, locale } = useI18n()
const operationLabel = useBankOperationLabel()

type View = 'menu' | 'withdraw' | 'deposit' | 'transfer' | 'balance' | 'history'
const view = ref<View>('menu')
const amountText = ref('')
const recipientText = ref('')
const QUICK_AMOUNTS = [20, 50, 100, 200, 500]

interface MenuEntry {
  view: View | 'close'
  label: string
}
const menuRows = computed<Array<[MenuEntry | null, MenuEntry | null]>>(() => [
  [{ view: 'withdraw', label: t('atm.withdraw') }, { view: 'transfer', label: t('atm.transfer') }],
  [{ view: 'deposit', label: t('atm.deposit') }, { view: 'balance', label: t('atm.balance') }],
  [null, { view: 'history', label: t('atm.history') }],
  [null, { view: 'close', label: t('atm.exit') }],
])

const amount = computed(() => parseAmount(amountText.value))
const recipient = computed(() => parseRecipient(recipientText.value))
const available = computed(() => (view.value === 'deposit' ? props.screen?.cash : props.screen?.bank) ?? null)
const canSubmit = computed(() => !props.pending && amount.value !== null && (view.value !== 'transfer' || recipient.value !== null))
const feedbackText = computed(() => {
  const f = props.feedback
  if (!f) return null
  return f.kind === 'success' ? t(`atm.done.${f.text}`) : f.text
})

function choose(entry: MenuEntry | null): void {
  if (!entry) return
  if (entry.view === 'close') {
    emit('close')
    return
  }
  amountText.value = ''
  recipientText.value = ''
  emit('clearFeedback')
  view.value = entry.view
}

function submit(): void {
  if (!canSubmit.value || amount.value === null) return
  if (view.value === 'transfer' && recipient.value) {
    emit('run', { action: 'transfer', amount: amount.value, ...recipient.value })
  } else if (view.value === 'withdraw' || view.value === 'deposit') {
    emit('run', { action: view.value, amount: amount.value })
  }
  amountText.value = ''
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  if (view.value === 'menu') emit('close')
  else view.value = 'menu'
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/50 p-4" @mousedown.self="emit('close')">
    <section
      class="w-[min(640px,100%)] animate-cc-pop rounded-[28px] border-4 border-[#c9cfda] bg-gradient-to-b from-[#eef1f6] to-[#cfd5df] p-3 shadow-2xl sm:p-4"
      :aria-label="t('atm.title')"
    >
      <header class="mb-3 flex items-center justify-between px-2">
        <span class="flex items-center gap-2 font-display text-lg text-[#1d3f8f]">
          <span class="grid h-8 w-8 place-items-center rounded-full bg-[#1d3f8f] text-sm text-white">C</span>
          Cove Bank
        </span>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-coral" @click="emit('close')">{{ t('atm.exit') }}</button>
      </header>

      <div class="flex items-stretch gap-2">
        <div v-if="view === 'menu'" class="hidden flex-col justify-around gap-2 sm:flex">
          <button
            v-for="(row, i) in menuRows"
            :key="`l${i}`"
            type="button"
            class="atm-key"
            :disabled="!row[0]"
            :aria-label="row[0]?.label"
            @click="choose(row[0])"
          >
            ▶
          </button>
        </div>

        <div class="min-h-[320px] flex-1 rounded-2xl border-4 border-[#9aa6b8] bg-gradient-to-b from-[#2f7fe0] via-[#1d5fc4] to-[#123f96] p-4 text-white shadow-inner">
          <p v-if="!screen" class="m-0 text-center font-display text-lg">{{ t('atm.loading') }}</p>

          <template v-else-if="view === 'menu'">
            <h2 class="m-0 mb-4 text-center font-display text-xl uppercase tracking-wide">{{ t('atm.choose') }}</h2>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <template v-for="(row, i) in menuRows" :key="i">
                <button v-if="row[0]" type="button" class="atm-option sm:text-left" @click="choose(row[0])">{{ row[0].label }}</button>
                <span v-else class="hidden sm:block" />
                <button v-if="row[1]" type="button" class="atm-option sm:text-right" @click="choose(row[1])">{{ row[1].label }}</button>
              </template>
            </div>
          </template>

          <template v-else-if="view === 'withdraw' || view === 'deposit' || view === 'transfer'">
            <h2 class="m-0 mb-1 text-center font-display text-xl uppercase tracking-wide">{{ t(`atm.${view}`) }}</h2>
            <p class="m-0 mb-4 flex items-center justify-center gap-2 text-sm text-white/80">
              {{ view === 'deposit' ? t('atm.cashAvailable') : t('atm.bankAvailable') }}
              <UiCurrency currency="coins" :amount="available" :size="14" />
            </p>
            <form class="flex flex-col gap-3" @submit.prevent="submit">
              <label v-if="view === 'transfer'" class="flex flex-col gap-1 text-sm">
                {{ t('atm.recipient') }}
                <input v-model="recipientText" type="text" class="cc-input" placeholder="pseudo#0000" autocomplete="off" />
              </label>
              <div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
                <button v-for="quick in QUICK_AMOUNTS" :key="quick" type="button" class="atm-option py-2 text-center" @click="amountText = String(quick)">
                  {{ quick }}
                </button>
              </div>
              <label class="flex flex-col gap-1 text-sm">
                {{ t('atm.amount') }}
                <input v-model="amountText" type="text" inputmode="numeric" class="cc-input" autocomplete="off" />
              </label>
              <div class="flex justify-between gap-2">
                <button type="button" class="atm-option px-4" @click="view = 'menu'">{{ t('atm.back') }}</button>
                <button type="submit" class="atm-option px-6 font-bold" :disabled="!canSubmit">{{ pending ? t('atm.wait') : t('atm.confirm') }}</button>
              </div>
            </form>
          </template>

          <template v-else-if="view === 'balance'">
            <h2 class="m-0 mb-6 text-center font-display text-xl uppercase tracking-wide">{{ t('atm.balance') }}</h2>
            <dl class="m-0 grid grid-cols-2 gap-4 text-center">
              <div>
                <dt class="text-sm text-white/80">{{ t('gameMoney.cash') }}</dt>
                <dd class="m-0 mt-1"><UiCurrency currency="coins" :amount="screen.cash" :size="22" pill /></dd>
              </div>
              <div>
                <dt class="text-sm text-white/80">{{ t('gameMoney.bank') }}</dt>
                <dd class="m-0 mt-1"><UiCurrency currency="coins" :amount="screen.bank" :size="22" pill /></dd>
              </div>
            </dl>
            <button type="button" class="atm-option mt-8 w-full" @click="view = 'menu'">{{ t('atm.back') }}</button>
          </template>

          <template v-else>
            <h2 class="m-0 mb-3 text-center font-display text-xl uppercase tracking-wide">{{ t('atm.history') }}</h2>
            <p v-if="screen.history.length === 0" class="m-0 text-center text-white/80">{{ t('atm.noHistory') }}</p>
            <ul v-else class="m-0 max-h-[220px] list-none overflow-y-auto p-0 text-sm">
              <li v-for="(op, i) in screen.history" :key="i" class="flex items-center justify-between gap-3 border-b border-white/15 py-1.5">
                <span class="min-w-0">
                  <span class="block truncate">{{ operationLabel(op) }}</span>
                  <span class="block text-xs text-white/60">{{ formatDate(op.at) }}</span>
                </span>
                <span :class="['font-display', op.delta < 0 ? 'text-[#ffc7c7]' : 'text-[#c9ffd6]']">{{ op.delta > 0 ? '+' : '' }}{{ op.delta.toLocaleString() }}</span>
              </li>
            </ul>
            <button type="button" class="atm-option mt-4 w-full" @click="view = 'menu'">{{ t('atm.back') }}</button>
          </template>

          <p
            v-if="feedbackText"
            role="status"
            :class="['m-0 mt-4 rounded-xl px-3 py-2 text-center text-sm font-bold', feedback?.kind === 'error' ? 'bg-[#ffdede] text-[#8a1c1c]' : 'bg-[#dcffe6] text-[#145c2c]']"
          >
            {{ feedbackText }}
          </p>
        </div>

        <div v-if="view === 'menu'" class="hidden flex-col justify-around gap-2 sm:flex">
          <button
            v-for="(row, i) in menuRows"
            :key="`r${i}`"
            type="button"
            class="atm-key"
            :disabled="!row[1]"
            :aria-label="row[1]?.label"
            @click="choose(row[1])"
          >
            ◀
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.atm-key {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 2px solid #9aa6b8;
  background: linear-gradient(#ffffff, #d6dce6);
  color: #4a5568;
  font-size: 14px;
}
.atm-key:disabled {
  opacity: 0.35;
}
.atm-option {
  min-height: 44px;
  border-radius: 12px;
  border: 2px solid #9fd2ff;
  background: linear-gradient(#8fd0ff, #3d9bf0);
  padding: 8px 14px;
  color: #062a5e;
  font-family: inherit;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.6);
}
.atm-option:disabled {
  opacity: 0.5;
}
.atm-option:not(:disabled):hover {
  background: linear-gradient(#a8dcff, #55aaf5);
}
</style>
