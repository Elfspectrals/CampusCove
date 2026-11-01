<script setup lang="ts">
/**
 * /gems/return?order=<id>&result=success|cancel: where Stripe Checkout sends the player back. The URL proves
 * nothing: the page asks the API for the real order state, waits a bounded time for the webhook, and refreshes the
 * wallet cache from the API answers (api/gems.ts fetchGemOrder).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchGemOrder, type GemOrder } from '../api/gems'
import { ApiError } from '../api/http'
import { localizedName } from '../i18n/routes'
import type { Locale } from '../seo/site'
import { POLL_DELAYS_MS, formatPrice, returnPhase } from '../utils/gemCheckout'
import UiCurrency from '../components/ui/UiCurrency.vue'
import UiIcon from '../components/ui/UiIcon.vue'

const route = useRoute()
const { t, locale } = useI18n()

const publicId = computed(() => (typeof route.query.order === 'string' ? route.query.order : ''))
const result = computed(() => (typeof route.query.result === 'string' ? route.query.result : null))

const order = ref<GemOrder | null>(null)
const attempts = ref(0)
const failure = ref<'notFound' | 'network' | null>(null)
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false

const phase = computed(() => returnPhase(order.value, result.value, attempts.value))

async function check(): Promise<void> {
  if (!publicId.value) {
    failure.value = 'notFound'
    return
  }
  busy.value = true
  try {
    order.value = await fetchGemOrder(publicId.value)
    failure.value = null
  } catch (e) {
    failure.value = e instanceof ApiError && e.status === 404 ? 'notFound' : 'network'
  } finally {
    busy.value = false
  }
  if (stopped || failure.value === 'notFound' || (failure.value === null && phase.value !== 'checking')) return
  if (attempts.value >= POLL_DELAYS_MS.length) return
  timer = setTimeout(() => {
    attempts.value++
    void check()
  }, POLL_DELAYS_MS[attempts.value])
}

function checkAgain() {
  clearTimeout(timer)
  attempts.value = 0
  void check()
}

onMounted(() => {
  void check()
})
onUnmounted(() => {
  stopped = true
  clearTimeout(timer)
})

const view = computed(() => {
  if (failure.value === 'notFound') return { icon: 'alert' as const, tone: 'text-coral', title: t('gems.return.notFound'), body: '' }
  if (failure.value === 'network' && order.value === null) return { icon: 'alert' as const, tone: 'text-coral', title: t('gems.return.error'), body: '' }
  const n = order.value?.gems.toLocaleString(locale.value) ?? ''
  switch (phase.value) {
    case 'success':
      return { icon: 'check' as const, tone: 'text-mint', title: t('gems.return.successTitle', { n }), body: t('gems.return.successBody') }
    case 'cancelled':
      return { icon: 'x' as const, tone: 'text-mist', title: t('gems.return.cancelledTitle'), body: t('gems.return.cancelledBody') }
    case 'processing':
      return { icon: 'refresh' as const, tone: 'text-sun', title: t('gems.return.processingTitle'), body: t('gems.return.processingBody') }
    case 'failed':
      return { icon: 'alert' as const, tone: 'text-coral', title: t('gems.return.failedTitle'), body: t('gems.return.failedBody') }
    case 'expired':
      return { icon: 'alert' as const, tone: 'text-mist', title: t('gems.return.expiredTitle'), body: t('gems.return.expiredBody') }
    case 'timeout':
      return { icon: 'refresh' as const, tone: 'text-sun', title: t('gems.return.timeoutTitle'), body: t('gems.return.timeoutBody') }
    default:
      return { icon: 'refresh' as const, tone: 'text-grape', title: t('gems.return.checkingTitle'), body: t('gems.return.checkingBody') }
  }
})

const canCheckAgain = computed(() => failure.value === 'network' || phase.value === 'timeout' || phase.value === 'processing')
</script>

<template>
  <div class="mx-auto w-full max-w-lg">
    <section class="cc-panel p-6 text-center sm:p-8" aria-labelledby="gem-return-title">
      <p class="cc-alert cc-alert-warn m-0 mb-5 justify-center text-left" role="note"><UiIcon name="info" :size="18" /> <strong class="font-extrabold">{{ t('gems.demoBanner') }}</strong></p>
      <div role="status" aria-live="polite">
        <div class="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-ink-950/60" :class="view.tone">
          <UiCurrency v-if="phase === 'success' && !failure" currency="premium" :size="40" />
          <UiIcon v-else :name="view.icon" :size="34" :class="phase === 'checking' && !failure ? 'animate-spin motion-reduce:animate-none' : ''" />
        </div>
        <h1 id="gem-return-title" class="cc-display m-0 mt-4 text-3xl leading-tight">{{ view.title }}</h1>
        <p v-if="view.body" class="m-0 mt-2 text-sm font-semibold text-mist">{{ view.body }}</p>
      </div>

      <dl v-if="order && !failure" class="mx-auto mt-5 max-w-xs space-y-1 rounded-xl bg-ink-950/50 p-3 text-left text-sm font-bold">
        <div class="flex justify-between gap-4">
          <dt class="text-mist">{{ t('gems.pack') }}</dt>
          <dd class="m-0"><UiCurrency currency="premium" :amount="order.gems" :size="16" class="text-grape" /></dd>
        </div>
        <div class="flex justify-between gap-4">
          <dt class="text-mist">{{ t('gems.total') }}</dt>
          <dd class="m-0">{{ formatPrice(order.amount_cents, order.currency, locale) }}</dd>
        </div>

      </dl>

      <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button v-if="canCheckAgain" type="button" class="cc-btn cc-btn-grape" :disabled="busy" @click="checkAgain">
          <UiIcon name="refresh" :size="16" /> {{ t('gems.return.checkAgain') }}
        </button>
        <RouterLink :to="{ name: 'gems' }" class="cc-btn cc-btn-ghost">{{ t('gems.return.backToShop') }}</RouterLink>
        <template v-if="phase === 'success' && !failure">
          <RouterLink :to="{ name: localizedName('shop-skin', locale as Locale) }" class="cc-btn cc-btn-sun">{{ t('gems.return.toSkins') }}</RouterLink>
          <RouterLink :to="{ name: 'game' }" class="cc-btn cc-btn-ghost"><UiIcon name="play" :size="16" fill /> {{ t('gems.return.play') }}</RouterLink>
        </template>
      </div>
    </section>
  </div>
</template>
