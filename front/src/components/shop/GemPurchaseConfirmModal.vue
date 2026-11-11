<script setup lang="ts">
/**
 * Last step before Stripe Checkout (test mode only): pack, simulated price and the demo warning — no money is ever
 * charged, the payment is made with a Stripe test card.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GemPack } from '../../api/gems'
import { useDialogFocus } from '../../composables/useDialogFocus'
import { formatPrice } from '../../utils/gemCheckout'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  pack: GemPack
  submitting: boolean
  error: string | null
  /** `warn`: temporary state (payment page still being prepared), not a failure. */
  errorTone?: 'error' | 'warn'
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { t, locale } = useI18n()
const price = computed(() => formatPrice(props.pack.amount_cents, props.pack.currency, locale.value))

const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl, { onEscape: () => !props.submitting && emit('close') })
</script>

<template>
  <div
    ref="dialogEl"
    class="cc-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="gem-confirm-title"
    @click.self="!submitting && emit('close')"
  >
    <div class="cc-modal max-w-md">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="m-0 text-sm text-mist">{{ t('gems.confirmTitle') }}</p>
          <h2 id="gem-confirm-title" class="m-0 mt-1 flex items-center gap-2 font-display text-3xl leading-tight text-fog">
            <UiCurrency currency="premium" :size="30" />
            {{ t('gems.packGems', { n: pack.gems.toLocaleString(locale) }) }}
          </h2>
        </div>
        <button type="button" class="grid h-11 w-11 place-items-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-fog" :aria-label="t('gems.cancel')" :disabled="submitting" @click="emit('close')">
          <UiIcon name="x" :size="18" :stroke-width="1.75" />
        </button>
      </div>

      <dl class="mt-5 space-y-2 rounded-xl border border-white/10 p-4 text-sm">
        <div class="flex justify-between gap-4">
          <dt class="text-mist">{{ t('gems.pack') }}</dt>
          <dd class="m-0">{{ t('gems.packGems', { n: pack.gems.toLocaleString(locale) }) }}</dd>
        </div>
        <div class="flex items-baseline justify-between gap-4 border-t border-white/10 pt-2">
          <dt class="text-mist">{{ t('gems.total') }}</dt>
          <dd class="m-0 text-2xl font-semibold tabular-nums text-fog">{{ price }}</dd>
        </div>
        <p class="m-0 text-right text-xs text-mist">{{ t('gems.simulatedPrice') }}</p>
      </dl>

      <p v-if="error && errorTone === 'warn'" class="cc-alert cc-alert-warn m-0 mt-3" role="status"><UiIcon name="refresh" :size="18" /> {{ error }}</p>
      <p v-else-if="error" class="cc-alert cc-alert-error m-0 mt-3" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>

      <div class="mt-5 grid gap-3 sm:grid-cols-[auto_1fr]">
        <button type="button" class="cc-btn cc-btn-ghost" :disabled="submitting" @click="emit('close')">{{ t('gems.cancel') }}</button>
        <button type="button" class="cc-btn cc-btn-sun" :disabled="submitting" :aria-busy="submitting" @click="emit('confirm')">
          {{ submitting ? t('gems.redirecting') : t('gems.order') }}
        </button>
      </div>
      <p class="m-0 mt-3 flex items-start gap-2 text-xs text-mist">
        <UiIcon name="lock" :size="14" class="mt-0.5 shrink-0" /> {{ t('gems.secure') }}
      </p>
    </div>
  </div>
</template>
