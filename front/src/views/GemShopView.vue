<script setup lang="ts">
/**
 * /gems: gem shop demo through Stripe Checkout in test mode (docs/STRIPE.md): Stripe test cards, no money charged,
 * the premium wallet really credited. Packs and prices come from the API; the order is created server side and the
 * browser leaves for the Stripe page. Gems are credited by the backend once Stripe confirms the (test) payment,
 * never here.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  GemCheckoutPreparingError,
  StaleSessionError,
  fetchGemOrders,
  fetchGemPacks,
  startGemCheckout,
  type GemOrder,
  type GemPack,
  type GemPackCatalog,
} from '../api/gems'
import { ApiError } from '../api/http'
import { fetchCurrentUser } from '../api/auth'
import { useWalletBalances } from '../composables/useWalletBalances'
import { formatPrice } from '../utils/gemCheckout'
import GemOrderHistory from '../components/shop/GemOrderHistory.vue'
import GemPurchaseConfirmModal from '../components/shop/GemPurchaseConfirmModal.vue'
import UiCurrency from '../components/ui/UiCurrency.vue'
import UiIcon from '../components/ui/UiIcon.vue'

const { t, te, locale } = useI18n()
const balances = useWalletBalances()

const catalog = ref<GemPackCatalog | null>(null)
const catalogLoading = ref(true)
const catalogError = ref<string | null>(null)
const orders = ref<GemOrder[]>([])
const ordersLoading = ref(true)
const ordersError = ref<string | null>(null)

const selectedPack = ref<GemPack | null>(null)
const submitting = ref(false)
const orderError = ref<string | null>(null)
/** `warn`: temporary (payment page still being prepared), not a failure. */
const orderErrorTone = ref<'error' | 'warn'>('error')

const inDebt = computed(() => (balances.value.premium ?? 0) < 0)

async function loadCatalog() {
  catalogLoading.value = true
  catalogError.value = null
  try {
    catalog.value = await fetchGemPacks()
  } catch {
    catalogError.value = t('gems.loadError')
  } finally {
    catalogLoading.value = false
  }
}

async function loadOrders() {
  ordersLoading.value = true
  ordersError.value = null
  try {
    orders.value = await fetchGemOrders()
  } catch {
    ordersError.value = t('gems.historyError')
  } finally {
    ordersLoading.value = false
  }
}

/** Back button from the Stripe page: the browser may restore this page as it was, still "submitting". */
function onPageShow(e: PageTransitionEvent) {
  if (!e.persisted) return
  submitting.value = false
  void loadOrders()
}

onMounted(() => {
  void loadCatalog()
  void loadOrders()
  // fresh balances from the API (a refund may have changed them since the last page)
  void fetchCurrentUser()
  window.addEventListener('pageshow', onPageShow)
})
onUnmounted(() => window.removeEventListener('pageshow', onPageShow))

function choose(pack: GemPack) {
  orderError.value = null
  selectedPack.value = pack
}

async function confirmOrder() {
  const pack = selectedPack.value
  if (!pack || submitting.value) return
  submitting.value = true
  orderError.value = null
  try {
    // waits (bounded) while another tab or click of this player is preparing the same payment page
    const checkoutUrl = await startGemCheckout(pack.code, locale.value === 'fr' ? 'fr' : 'en')
    // stays "submitting" while the browser leaves: no second click on the way to Stripe
    window.location.assign(checkoutUrl)
  } catch (e) {
    submitting.value = false
    // logged out or another account meanwhile: nothing to show to this session
    if (e instanceof StaleSessionError) return
    orderErrorTone.value = e instanceof GemCheckoutPreparingError ? 'warn' : 'error'
    const key =
      e instanceof GemCheckoutPreparingError ? 'gems.errors.checkout_preparing' : e instanceof ApiError ? `gems.errors.${e.code ?? (e.status === 429 ? 'throttled' : '')}` : ''
    orderError.value = key && te(key) ? t(key) : e instanceof Error ? e.message : t('gems.return.error')
  }
}

function closeModal() {
  if (!submitting.value) selectedPack.value = null
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl">
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="cc-eyebrow">{{ t('gems.eyebrow') }}</p>
        <h1 class="cc-title">{{ t('gems.title') }}</h1>
        <p class="m-0 mt-1 max-w-2xl text-sm font-semibold text-mist">{{ t('gems.lead') }}</p>
      </div>
      <div class="cc-panel-flat flex items-center gap-3 px-4 py-2.5">
        <span class="text-sm font-bold text-mist">{{ t('gems.balance') }}</span>
        <UiCurrency currency="premium" :amount="balances.premium" pill />
      </div>
    </div>

    <p v-if="inDebt" class="cc-alert cc-alert-warn mb-4" role="status">
      <UiIcon name="alert" :size="18" /> {{ t('gems.debt') }}
    </p>
  
    <div v-if="catalogLoading" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div v-for="n in 4" :key="n" class="h-56 animate-pulse rounded-chunk border-2 border-ink-700 bg-ink-800/60" />
    </div>

    <div v-else-if="catalogError" class="cc-alert cc-alert-error" role="alert">
      <UiIcon name="alert" :size="18" />
      <p class="m-0 flex-1 font-extrabold">{{ catalogError }}</p>
      <button type="button" class="cc-btn cc-btn-coral cc-btn-sm" @click="loadCatalog">{{ t('gems.retry') }}</button>
    </div>

    <template v-else-if="catalog">
    <!-- packs stay on show when ordering is off; only the buy buttons are disabled -->
    <p v-if="!catalog.available" class="cc-alert cc-alert-warn mb-4" role="status">
      <UiIcon name="info" :size="18" />
      <span v-if="catalog.unavailableReason === 'admin_only'"><strong class="block font-extrabold">{{ t('gems.adminOnlyTitle') }}</strong>{{ t('gems.adminOnlyBody') }}</span>
      <span v-else><strong class="block font-extrabold">{{ t('gems.unavailableTitle') }}</strong>{{ t('gems.unavailableBody') }}</span>
    </p>

    <ul class="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[420px]:grid-cols-2 lg:grid-cols-4">
      <li v-for="(pack, i) in catalog.packs" :key="pack.code" class="cc-card flex flex-col">
        <div class="relative grid h-32 place-items-center bg-gradient-to-b from-grape/30 to-ink-900/40">
          <UiCurrency currency="premium" :size="48 + i * 10" />
        </div>
        <div class="flex flex-1 flex-col gap-1 border-t-2 border-ink-950/60 bg-ink-950/60 px-4 py-3">
          <p class="cc-display m-0 text-2xl leading-tight text-grape">{{ t('gems.packGems', { n: pack.gems.toLocaleString(locale) }) }}</p>
          <p class="m-0 font-display text-xl text-fog">{{ formatPrice(pack.amount_cents, pack.currency, locale) }}</p>
          <p class="m-0 text-xs font-semibold text-mist">{{ t('gems.simulatedPrice') }}</p>
          <button
            type="button"
            class="cc-btn cc-btn-grape mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!catalog.available"
            :aria-label="`${t('gems.buy')} — ${t('gems.packGems', { n: pack.gems })} — ${formatPrice(pack.amount_cents, pack.currency, locale)}`"
            @click="choose(pack)"
          >
            {{ t('gems.buy') }}
          </button>
        </div>
      </li>
    </ul>
    </template>

    <div class="mt-6">
      <GemOrderHistory :orders="orders" :loading="ordersLoading" :error="ordersError" />
    </div>

    <GemPurchaseConfirmModal
      v-if="selectedPack"
      :pack="selectedPack"
      :submitting="submitting"
      :error="orderError"
      :error-tone="orderErrorTone"
      @close="closeModal"
      @confirm="confirmOrder"
    />
  </div>
</template>
