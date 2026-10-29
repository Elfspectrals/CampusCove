<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import type { OfferableItem } from '../../api/trades'
import type { OfferDraft } from '../../game/trade'
import type { TradeStatePayload } from '../../types/gameRealtime'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

/**
 * Both offers side by side. The left column edits this player's offer (coins + tradable items); the right one is
 * the partner's, as the server holds it. Any change on either side clears both confirmations.
 */
const props = defineProps<{
  state: TradeStatePayload
  offerable: { coins: number; items: OfferableItem[] } | null
  offerableError: string | null
  draft: OfferDraft
  syncing: boolean
  error: string | null
}>()

const emit = defineEmits<{
  coins: [value: number]
  item: [code: string, quantity: number]
  confirm: []
  cancel: []
}>()

const executing = computed(() => props.state.status === 'executing')
const bothEmpty = computed(
  () => props.draft.coins === 0 && Object.keys(props.draft.items).length === 0 && props.state.partner.offer.coins === 0 && props.state.partner.offer.items.length === 0,
)
const canConfirm = computed(() => props.state.status === 'open' && !props.syncing && !props.state.me.confirmed && !bothEmpty.value)

function offered(code: string): number {
  return props.draft.items[code] ?? 0
}

function onCoinsInput(e: Event): void {
  emit('coins', Number((e.target as HTMLInputElement).value))
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || executing.value) return
  emit('cancel')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/50">
    <section class="cc-hud flex max-h-[90vh] w-[min(760px,94vw)] animate-cc-pop flex-col overflow-hidden p-0" aria-label="Trade">
      <header class="flex items-center justify-between bg-pool px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">Trade with {{ state.partner.pseudo }}</span>
        <button type="button" class="inline-flex items-center" aria-label="Cancel the trade" :disabled="executing" @click="emit('cancel')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2">
        <!-- my offer -->
        <div class="flex min-h-0 flex-col rounded-xl bg-ink-950/40 p-3" :class="state.me.confirmed ? 'ring-2 ring-mint' : ''">
          <p class="m-0 flex items-center justify-between pb-2 text-[11px] font-bold uppercase tracking-wider text-mist">
            Your offer
            <span v-if="state.me.confirmed" class="inline-flex items-center gap-1 text-mint"><UiIcon name="check" :size="14" /> Confirmed</span>
          </p>
          <label class="flex items-center gap-2 pb-3 text-sm font-bold text-fog">
            <UiCurrency currency="coins" :size="18" />
            <input
              type="number"
              min="0"
              :max="offerable?.coins ?? 0"
              step="1"
              class="w-28 rounded-lg border border-white/15 bg-ink-950/60 px-2 py-1 text-fog"
              :value="draft.coins"
              :disabled="executing || !offerable"
              aria-label="Coins you offer"
              @input="onCoinsInput"
            />
            <span class="text-xs text-mist">of {{ offerable?.coins ?? '…' }}</span>
          </label>
          <p v-if="offerableError" class="m-0 text-xs font-bold text-coral">{{ offerableError }}</p>
          <p v-else-if="!offerable" class="m-0 text-xs text-mist">Loading your inventory…</p>
          <p v-else-if="offerable.items.length === 0" class="m-0 text-xs text-mist">Nothing tradable in your inventory.</p>
          <ul v-else class="m-0 max-h-[40vh] list-none overflow-y-auto p-0">
            <li v-for="item in offerable.items" :key="item.code" class="flex items-center gap-2 rounded-lg px-1 py-1.5" :class="offered(item.code) > 0 ? 'bg-pool/15' : ''">
              <img :src="item.preview_image ?? ''" :alt="item.name" class="h-10 w-10 shrink-0 rounded-md bg-ink-950/40 object-contain" />
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-bold text-fog">{{ item.name }}</p>
                <p class="m-0 text-[11px] text-mist">You have {{ item.quantity }}</p>
              </div>
              <button
                type="button"
                class="cc-btn cc-btn-sm cc-btn-ghost"
                :aria-label="`Offer one less ${item.name}`"
                :disabled="executing || offered(item.code) === 0"
                @click="emit('item', item.code, offered(item.code) - 1)"
              >
                −
              </button>
              <span class="w-6 text-center text-sm font-extrabold text-fog">{{ offered(item.code) }}</span>
              <button
                type="button"
                class="cc-btn cc-btn-sm cc-btn-ghost"
                :aria-label="`Offer one more ${item.name}`"
                :disabled="executing || offered(item.code) >= item.quantity"
                @click="emit('item', item.code, offered(item.code) + 1)"
              >
                +
              </button>
            </li>
          </ul>
        </div>

        <!-- partner's offer -->
        <div class="flex min-h-0 flex-col rounded-xl bg-ink-950/40 p-3" :class="state.partner.confirmed ? 'ring-2 ring-mint' : ''">
          <p class="m-0 flex items-center justify-between pb-2 text-[11px] font-bold uppercase tracking-wider text-mist">
            {{ state.partner.pseudo }} offers
            <span v-if="state.partner.confirmed" class="inline-flex items-center gap-1 text-mint"><UiIcon name="check" :size="14" /> Confirmed</span>
          </p>
          <p class="m-0 flex items-center gap-2 pb-3 text-sm font-bold text-fog">
            <UiCurrency currency="coins" :amount="state.partner.offer.coins" :size="18" />
          </p>
          <p v-if="state.partner.offer.items.length === 0" class="m-0 text-xs text-mist">No items.</p>
          <ul v-else class="m-0 max-h-[40vh] list-none overflow-y-auto p-0">
            <li v-for="item in state.partner.offer.items" :key="item.code" class="flex items-center gap-2 rounded-lg px-1 py-1.5">
              <img :src="item.previewImage ?? ''" :alt="item.name" class="h-10 w-10 shrink-0 rounded-md bg-ink-950/40 object-contain" />
              <p class="m-0 min-w-0 flex-1 truncate text-sm font-bold text-fog">{{ item.name }}</p>
              <span class="text-sm font-extrabold text-fog">× {{ item.quantity }}</span>
            </li>
          </ul>
        </div>
      </div>

      <p v-if="error" class="m-0 bg-coral/20 px-4 py-2 text-xs font-bold text-coral">{{ error }}</p>
      <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
        <p class="m-0 mr-auto text-xs text-mist">
          <template v-if="executing">Trading…</template>
          <template v-else-if="state.me.confirmed && !state.partner.confirmed">Waiting for {{ state.partner.pseudo }} to confirm.</template>
          <template v-else>Any change clears both confirmations.</template>
        </p>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" :disabled="executing" @click="emit('cancel')">Cancel</button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-mint" :disabled="!canConfirm" @click="emit('confirm')">
          {{ state.me.confirmed ? 'Confirmed' : 'Confirm trade' }}
        </button>
      </footer>
    </section>
  </div>
</template>
