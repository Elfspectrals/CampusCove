<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  fetchAdminHousing,
  kickAdminHousingKeyHolder,
  kickAdminHousingOwner,
  updateAdminHousingPricing,
  type AdminHousingAction,
  type AdminHousingOverview,
  type AdminHousingPerson,
  type AdminHousingUnit,
} from '../../api/adminHousing'
import UiCurrency from '../../components/ui/UiCurrency.vue'
import { findHouse } from '../../game/assets/catalog'

const units = ref<AdminHousingUnit[]>([])
const recentActions = ref<AdminHousingAction[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const message = ref<string | null>(null)
/** Price / tax being edited, per house; an empty tax field means "default". */
const drafts = reactive<Record<string, { price: number | null, tax: number | '' | null }>>({})

function apply(overview: AdminHousingOverview): void {
  units.value = overview.units
  recentActions.value = overview.recent_actions
  for (const unit of overview.units) {
    drafts[unit.public_id] = { price: unit.price_coins, tax: unit.tax_is_custom ? unit.tax_coins : '' }
  }
}

async function run(action: () => Promise<AdminHousingOverview>, done: string): Promise<void> {
  busy.value = true
  error.value = null
  message.value = null
  try {
    apply(await action())
    message.value = done
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Request failed'
  } finally {
    busy.value = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    apply(await fetchAdminHousing())
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not load housing'
  } finally {
    loading.value = false
  }
}

function houseName(unit: AdminHousingUnit): string {
  return findHouse(unit.model_key)?.name ?? unit.model_key ?? `Unit #${unit.unit_id}`
}

function who(person: AdminHousingPerson | null): string {
  if (!person) return 'unknown'
  return person.username ?? `#${person.account_id}`
}

function pricingChanged(unit: AdminHousingUnit): boolean {
  const draft = drafts[unit.public_id]
  if (!draft) return false
  const tax = draft.tax === '' || draft.tax === null ? null : draft.tax
  return draft.price !== unit.price_coins || tax !== (unit.tax_is_custom ? unit.tax_coins : null)
}

function savePricing(unit: AdminHousingUnit): void {
  const draft = drafts[unit.public_id]
  if (!draft || draft.price === null || draft.price < 1) return
  const tax = draft.tax === '' || draft.tax === null ? null : draft.tax
  void run(
    () => updateAdminHousingPricing(unit.public_id, { price_coins: draft.price ?? unit.price_coins, tax_coins: tax }),
    `${houseName(unit)}: pricing saved. It applies to the next purchase and the next tax charge.`,
  )
}

function kickOwner(unit: AdminHousingUnit): void {
  const prompt = `Evict ${who(unit.owner)} from ${houseName(unit)}?\n\n`
    + 'Like a seizure for unpaid tax: the owner and every key holder lose their keys, and the furniture inside is deleted. '
    + 'No refund.'
  if (!window.confirm(prompt)) return
  void run(() => kickAdminHousingOwner(unit.public_id), `${who(unit.owner)} was evicted from ${houseName(unit)}.`)
}

function kickKeyHolder(unit: AdminHousingUnit, holder: AdminHousingPerson): void {
  if (!window.confirm(`Take ${houseName(unit)}'s keys back from ${who(holder)}?`)) return
  void run(
    () => kickAdminHousingKeyHolder(unit.public_id, holder.account_id),
    `${who(holder)} no longer has keys to ${houseName(unit)}.`,
  )
}

function describe(action: AdminHousingAction): string {
  const t = action.target
  const house = findHouse(typeof t.model_key === 'string' ? t.model_key : null)?.name ?? `unit #${String(t.unit_id)}`
  if (action.action === 'kick_owner') return `evicted account #${String(t.account_id)} from ${house}`
  if (action.action === 'kick_key_holder') return `took ${house}'s keys from account #${String(t.account_id)}`
  if (action.action === 'pricing' && isPricing(t.before) && isPricing(t.after)) {
    const tax = (v: number | null) => (v === null ? 'default' : String(v))
    return `${house}: price ${t.before.price_coins} → ${t.after.price_coins}, tax ${tax(t.before.tax_coins)} → ${tax(t.after.tax_coins)}`
  }
  return `${action.action} on ${house}`
}

function isPricing(value: unknown): value is { price_coins: number, tax_coins: number | null } {
  return typeof value === 'object' && value !== null && 'price_coins' in value && 'tax_coins' in value
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="cc-display m-0 text-3xl text-fog">Admin housing</h1>
        <p class="mt-1 text-sm text-mist">
          Set each house's price and daily tax (the rent owners pay), see owners and who they gave keys to, and remove either.
        </p>
      </div>
      <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" :disabled="loading || busy" @click="load">Refresh</button>
    </div>

    <p v-if="message" class="cc-alert cc-alert-success">{{ message }}</p>
    <p v-if="error" class="cc-alert cc-alert-error">{{ error }}</p>

    <div v-if="loading" class="cc-panel-flat px-3 py-10 text-center text-sm font-bold text-mist">Loading houses...</div>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <section v-for="unit in units" :key="unit.public_id" class="cc-panel flex flex-col gap-3 p-4" :data-house="unit.model_key">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="m-0 font-display text-lg text-fog">{{ houseName(unit) }}</p>
            <p class="m-0 text-xs text-mist">{{ unit.model_key }} · #{{ unit.unit_id }}</p>
          </div>
          <div class="flex gap-1">
            <span class="cc-chip" :class="unit.status === 'occupied' ? 'cc-chip-sun' : 'cc-chip-mint'">{{ unit.status }}</span>
            <span v-if="unit.door_locked" class="cc-chip cc-chip-coral">locked</span>
          </div>
        </div>

        <div v-if="drafts[unit.public_id]" class="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label class="flex flex-col gap-1">
            <span class="cc-label m-0">Price</span>
            <input v-model.number="drafts[unit.public_id]!.price" type="number" min="1" class="cc-input cc-input-sm w-full" name="price" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="cc-label m-0">Daily tax <span class="text-mist">(empty = 5% of price)</span></span>
            <input
              v-model.number="drafts[unit.public_id]!.tax"
              type="number"
              min="0"
              class="cc-input cc-input-sm w-full"
              name="tax"
              :placeholder="String(unit.tax_coins)"
            />
          </label>
          <button
            type="button"
            class="cc-btn cc-btn-sm cc-btn-sun"
            :disabled="busy || !pricingChanged(unit)"
            @click="savePricing(unit)"
          >
            Save
          </button>
        </div>
        <p class="m-0 flex flex-wrap items-center gap-2 text-xs text-mist">
          Now: <UiCurrency currency="coins" :amount="unit.price_coins" :size="14" /> to buy,
          <UiCurrency currency="coins" :amount="unit.tax_coins" :size="14" /> per day
          {{ unit.tax_is_custom ? '(custom)' : '(default)' }}
          <template v-if="unit.tax_due_at">· next tax {{ formatDate(unit.tax_due_at) }}</template>
        </p>

        <div class="cc-panel-flat p-3">
          <p class="m-0 mb-2 text-xs font-bold uppercase tracking-wide text-mist">Owner</p>
          <div v-if="unit.owner" class="flex items-center justify-between gap-2">
            <span class="font-semibold text-fog" data-role="owner">{{ who(unit.owner) }}</span>
            <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost text-coral" :disabled="busy" @click="kickOwner(unit)">
              Evict
            </button>
          </div>
          <p v-else class="m-0 text-sm text-mist">For sale</p>

          <p class="m-0 mb-2 mt-3 text-xs font-bold uppercase tracking-wide text-mist">Keys shared</p>
          <ul v-if="unit.key_holders.length > 0" class="m-0 list-none space-y-1 p-0">
            <li v-for="holder in unit.key_holders" :key="holder.account_id" class="flex items-center justify-between gap-2" data-role="key-holder">
              <span class="text-sm text-fog">
                {{ who(holder.shared_by) }} → <span class="font-semibold">{{ who(holder) }}</span>
                <span class="text-xs text-mist"> since {{ formatDate(holder.since) }}</span>
              </span>
              <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost text-coral" :disabled="busy" @click="kickKeyHolder(unit, holder)">
                Remove keys
              </button>
            </li>
          </ul>
          <p v-else class="m-0 text-sm text-mist">Nobody else has keys.</p>
        </div>
      </section>
    </div>

    <section v-if="recentActions.length > 0" class="cc-panel p-4">
      <h2 class="cc-display m-0 mb-2 text-xl text-fog">Recent admin actions</h2>
      <ul class="m-0 list-none space-y-1 p-0 text-sm">
        <li v-for="(action, index) in recentActions" :key="index" class="text-fog/90">
          <span class="text-mist">{{ formatDate(action.created_at) }}</span>
          · <span class="font-semibold">{{ who(action.staff) }}</span> {{ describe(action) }}
        </li>
      </ul>
    </section>
  </div>
</template>
