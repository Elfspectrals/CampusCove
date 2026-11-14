<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useAdminWatch } from '../../../composables/game/useAdminWatch'
import { SECTION_ICON, groupedItems, itemSection, quickQuantities, sectionsWithItems, type ItemSection } from '../../../game/admin/adminItems'
import { ADMIN_MAX_MONEY, ADMIN_MAX_QUANTITY, wholeIn } from '../../../game/admin/adminPanel'
import { QUICK_AMOUNTS } from '../../../game/admin/adminConsole'
import type { AdminHeldItem, AdminItem, AdminPlayerPayload, AdminWallet } from '../../../types/gameRealtime'
import UiIcon from '../../ui/UiIcon.vue'
import AdminThumb from '../AdminThumb.vue'

/** Give money or items to the chosen player, or take back what they hold (the "Take" side). */
const props = defineProps<{
  admin: ReturnType<typeof useAdminWatch>
  target: string
  targetName: string
  targetIsHere: boolean
  sheet: AdminPlayerPayload | null
}>()

const { t } = useI18n()

const WALLETS: AdminWallet[] = ['cash', 'bank']
type Mode = 'give' | 'take'
const mode = ref<Mode>('give')
const amountInput = ref('500')
const wallet = ref<AdminWallet>('cash')
const query = ref('')
const section = ref<ItemSection>('food')
/** The picked item: one to give (catalog) or one the player holds (take). */
const picked = ref<AdminItem | AdminHeldItem | null>(null)
const quantityInput = ref('1')

const amount = computed(() => wholeIn(amountInput.value, 1, ADMIN_MAX_MONEY))
const walletBalance = computed(() => (props.sheet ? props.sheet[wallet.value] : null))
const held = computed(() => (props.admin.inventory.value?.sessionId === props.target ? props.admin.inventory.value.items : null))
const maxQuantity = computed(() => (mode.value === 'take' && picked.value && 'quantity' in picked.value ? picked.value.quantity : ADMIN_MAX_QUANTITY))
const quantity = computed(() => wholeIn(quantityInput.value, 1, maxQuantity.value))
const catalog = computed(() => props.admin.items.value ?? [])
const sections = computed(() => sectionsWithItems(catalog.value))
const groups = computed(() => groupedItems(catalog.value, section.value, query.value))
const searching = computed(() => query.value.trim() !== '')
const showGroupTitles = computed(() => searching.value || groups.value.length > 1)
const quick = computed(() => {
  if (!picked.value) return []
  const steps = quickQuantities(itemSection(picked.value))
  return mode.value === 'take' ? steps.filter((q) => q < maxQuantity.value).concat(maxQuantity.value) : steps
})

watch(sections, (list) => {
  if (list.length > 0 && !list.some((s) => s.section === section.value)) section.value = list[0]!.section
})
watch([mode, () => props.target], () => {
  picked.value = null
  if (mode.value === 'take' && props.targetIsHere) props.admin.loadInventory(props.target)
})
// a take that went through leaves the picked stack smaller or gone
watch(held, (items) => {
  if (mode.value !== 'take' || !picked.value) return
  picked.value = items?.find((i) => i.code === picked.value?.code) ?? null
  if (picked.value && (quantity.value ?? 1) > picked.value.quantity) quantityInput.value = String(picked.value.quantity)
})

function pick(item: AdminItem | AdminHeldItem): void {
  picked.value = item
  quantityInput.value = '1'
}

function stepQuantity(delta: number): void {
  quantityInput.value = String(Math.min(Math.max((quantity.value ?? 1) + delta, 1), maxQuantity.value))
}

function submitMoney(): void {
  if (amount.value === null || !props.targetIsHere) return
  if (mode.value === 'give') props.admin.giveMoney(props.target, wallet.value, amount.value)
  else props.admin.takeMoney(props.target, wallet.value, amount.value)
}

function submitItem(): void {
  if (!picked.value || quantity.value === null || !props.targetIsHere) return
  if (mode.value === 'give') props.admin.giveItem(props.target, picked.value.code, quantity.value)
  else props.admin.takeItem(props.target, picked.value.code, quantity.value)
}
</script>

<template>
  <div class="flex gap-1 rounded-lg bg-ink-900 p-1" role="radiogroup" :aria-label="t('adminPanel.mode')">
    <button
      v-for="m in ['give', 'take'] as const"
      :key="m"
      type="button"
      role="radio"
      :aria-checked="mode === m"
      :class="['flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-bold', mode === m ? (m === 'give' ? 'bg-mint text-ink-950' : 'bg-coral text-ink-950') : 'text-mist hover:text-fog']"
      @click="mode = m"
    >
      <UiIcon :name="m === 'give' ? 'plus' : 'rotate-left'" :size="14" />
      {{ t(`adminPanel.modes.${m}`) }}
    </button>
  </div>

  <form class="flex flex-col gap-2 rounded-lg bg-ink-900 p-2.5" @submit.prevent="submitMoney">
    <h3 class="m-0 flex items-center gap-1.5 text-xs font-bold text-fog">
      <UiIcon name="bank" :size="14" class="text-sun" />{{ t('adminPanel.money') }}
      <span v-if="mode === 'take' && walletBalance !== null" class="ml-auto font-semibold text-mist">{{ t('adminPanel.holds', { amount: walletBalance.toLocaleString() }) }}</span>
    </h3>
    <div class="flex gap-1" role="radiogroup" :aria-label="t('adminPanel.wallet')">
      <button
        v-for="w in WALLETS"
        :key="w"
        type="button"
        role="radio"
        :aria-checked="wallet === w"
        :class="['min-h-11 flex-1 rounded-lg text-xs font-bold', wallet === w ? 'bg-sun text-ink-950' : 'bg-ink-800 text-mist hover:text-fog']"
        @click="wallet = w"
      >
        {{ t(`adminPanel.wallets.${w}`) }}
      </button>
    </div>
    <div class="grid grid-cols-[1fr_auto] gap-1">
      <input v-model="amountInput" type="number" min="1" :max="ADMIN_MAX_MONEY" class="cc-input min-h-11" :aria-label="t('adminPanel.amount', { max: ADMIN_MAX_MONEY })" />
      <button type="submit" :class="['cc-btn min-h-11', mode === 'take' ? 'bg-coral text-ink-950' : '']" :disabled="amount === null || !targetIsHere">
        {{ t(`adminPanel.modes.${mode}`) }}
      </button>
    </div>
    <div class="flex gap-1">
      <button
        v-for="q in QUICK_AMOUNTS"
        :key="q"
        type="button"
        :class="['min-h-11 flex-1 rounded-full text-xs font-bold', amount === q ? 'bg-sun text-ink-950' : 'bg-ink-800 text-fog']"
        @click="amountInput = String(q)"
      >
        {{ q.toLocaleString() }}
      </button>
      <button
        v-if="mode === 'take' && walletBalance"
        type="button"
        :class="['min-h-11 flex-1 rounded-full text-xs font-bold', amount === walletBalance ? 'bg-coral text-ink-950' : 'bg-ink-800 text-fog']"
        @click="amountInput = String(Math.min(walletBalance, ADMIN_MAX_MONEY))"
      >
        {{ t('adminPanel.all') }}
      </button>
    </div>
  </form>

  <section class="flex flex-col gap-2" :aria-label="t('adminPanel.items')">
    <h3 class="m-0 flex items-center gap-1.5 text-xs font-bold text-fog">
      <UiIcon name="backpack" :size="14" class="text-mint" />{{ mode === 'give' ? t('adminPanel.items') : t('adminPanel.heldItems', { name: targetName }) }}
    </h3>

    <template v-if="mode === 'give'">
      <input v-model="query" type="search" class="cc-input min-h-11" :placeholder="t('adminPanel.search')" :aria-label="t('adminPanel.search')" />
      <div v-if="!searching" class="flex flex-wrap gap-1" role="tablist" :aria-label="t('adminPanel.items')">
        <button
          v-for="s in sections"
          :key="s.section"
          type="button"
          role="tab"
          :aria-selected="section === s.section"
          :class="['inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-bold', section === s.section ? 'bg-mint text-ink-950' : 'bg-ink-900 text-mist hover:text-fog']"
          @click="section = s.section"
        >
          <UiIcon :name="SECTION_ICON[s.section]" :size="13" />
          {{ t(`adminPanel.sections.${s.section}`) }}
          <span class="opacity-70">{{ s.count }}</span>
        </button>
      </div>
      <p v-if="admin.items.value === null" class="m-0 text-xs text-mist">{{ t('adminPanel.loading') }}</p>
      <p v-else-if="groups.length === 0" class="m-0 text-xs text-mist">{{ t('adminPanel.noItem') }}</p>
      <div v-for="group in groups" v-else :key="group.group" class="flex flex-col gap-1">
        <h4 v-if="showGroupTitles" class="m-0 text-[11px] font-bold text-mist">{{ t(searching ? `adminPanel.sections.${group.group}` : `adminPanel.groups.${group.group}`) }}</h4>
        <ul class="m-0 grid list-none grid-cols-3 gap-1.5 p-0" role="listbox" :aria-label="group.group">
          <li v-for="item in group.items" :key="item.code" role="option" :aria-selected="picked?.code === item.code">
            <button
              type="button"
              :class="['flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-center', picked?.code === item.code ? 'bg-sun/20 ring-2 ring-sun' : 'bg-ink-900 hover:bg-ink-700']"
              :title="item.code"
              @click="pick(item)"
            >
              <AdminThumb :src="item.preview" :icon="SECTION_ICON[itemSection(item)]" :size="52" />
              <span class="line-clamp-2 min-h-[2lh] text-[11px] font-bold leading-tight text-fog">{{ item.name }}</span>
            </button>
          </li>
        </ul>
      </div>
    </template>

    <template v-else>
      <p v-if="held === null" class="m-0 text-xs text-mist">{{ t('adminPanel.loading') }}</p>
      <p v-else-if="held.length === 0" class="m-0 text-xs text-mist">{{ t('adminPanel.nothingHeld', { name: targetName }) }}</p>
      <ul v-else class="m-0 grid list-none grid-cols-3 gap-1.5 p-0" role="listbox" :aria-label="t('adminPanel.heldItems', { name: targetName })">
        <li v-for="item in held" :key="item.code" role="option" :aria-selected="picked?.code === item.code">
          <button
            type="button"
            :class="['relative flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-center', picked?.code === item.code ? 'bg-coral/20 ring-2 ring-coral' : 'bg-ink-900 hover:bg-ink-700']"
            :title="item.code"
            @click="pick(item)"
          >
            <span class="absolute right-1 top-1 rounded-full bg-ink-950 px-1.5 text-[10px] font-bold text-fog">×{{ item.quantity }}</span>
            <AdminThumb :src="item.preview" :icon="SECTION_ICON[itemSection(item)]" :size="52" />
            <span class="line-clamp-2 min-h-[2lh] text-[11px] font-bold leading-tight text-fog">{{ item.name }}</span>
          </button>
        </li>
      </ul>
    </template>
  </section>

  <form v-if="picked" class="sticky -bottom-3 -mx-3 -mb-3 mt-auto flex flex-col gap-2 border-t border-line/10 bg-ink-900 p-2.5 shadow-[0_-8px_16px_rgb(0_0_0/0.25)]" @submit.prevent="submitItem">
    <div class="flex items-center gap-2">
      <AdminThumb :src="picked.preview" :icon="SECTION_ICON[itemSection(picked)]" :size="44" />
      <div class="min-w-0 flex-1">
        <b class="block truncate text-sm text-fog">{{ picked.name }}</b>
        <span v-if="'portion' in picked && picked.portion" class="flex gap-2 text-[11px] text-mist">
          <span v-if="picked.portion.hunger" class="inline-flex items-center gap-0.5"><UiIcon name="apple" :size="11" />+{{ picked.portion.hunger }}</span>
          <span v-if="picked.portion.thirst" class="inline-flex items-center gap-0.5"><UiIcon name="droplet" :size="11" />+{{ picked.portion.thirst }}</span>
          <span v-if="picked.portion.health" class="inline-flex items-center gap-0.5"><UiIcon name="heart" :size="11" />+{{ picked.portion.health }}</span>
        </span>
        <span v-else class="text-[11px] text-mist">{{ 'quantity' in picked ? t('adminPanel.holdsItems', { n: picked.quantity }) : t(`adminPanel.sections.${itemSection(picked)}`) }}</span>
      </div>
      <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center text-mist hover:text-fog" :aria-label="t('adminPanel.unpick')" @click="picked = null">
        <UiIcon name="x" :size="16" />
      </button>
    </div>
    <div class="flex items-center gap-1">
      <button type="button" class="min-h-11 min-w-11 rounded-lg bg-ink-800 text-lg font-bold text-fog" :aria-label="t('adminPanel.less')" @click="stepQuantity(-1)">−</button>
      <input v-model="quantityInput" type="number" min="1" :max="maxQuantity" class="cc-input min-h-11 w-16 text-center" :aria-label="t('adminPanel.quantity', { max: maxQuantity })" />
      <button type="button" class="min-h-11 min-w-11 rounded-lg bg-ink-800 text-lg font-bold text-fog" :aria-label="t('adminPanel.more')" @click="stepQuantity(1)">+</button>
      <button
        v-for="q in quick"
        :key="q"
        type="button"
        :class="['min-h-11 flex-1 rounded-full text-xs font-bold', quantity === q ? 'bg-mint text-ink-950' : 'bg-ink-800 text-fog']"
        @click="quantityInput = String(q)"
      >
        ×{{ q }}
      </button>
    </div>
    <button type="submit" :class="['cc-btn min-h-11', mode === 'take' ? 'bg-coral text-ink-950' : '']" :disabled="quantity === null || !targetIsHere">
      {{ t(mode === 'give' ? 'adminPanel.giveItem' : 'adminPanel.takeItem', { quantity: quantity ?? '?', item: picked.name, name: targetName }) }}
    </button>
  </form>
</template>
