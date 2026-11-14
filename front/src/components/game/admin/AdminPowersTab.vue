<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useAdminWatch } from '../../../composables/game/useAdminWatch'
import { useHoldAction } from '../../../composables/game/useHoldAction'
import { ADMIN_BOOSTS, POWER_ICON, TOGGLE_GROUPS, wholeIn } from '../../../game/admin/adminPanel'
import type { AdminPlayerPayload, AdminToggle } from '../../../types/gameRealtime'
import UiIcon from '../../ui/UiIcon.vue'
import AdminHoldButton from './AdminHoldButton.vue'

/** Lasting powers by group, one-shot boosts, and moderation (stars, jail, send somewhere, kick). */
const props = defineProps<{
  admin: ReturnType<typeof useAdminWatch>
  target: string
  targetIsHere: boolean
  isMe: boolean
  sheet: AdminPlayerPayload | null
}>()

const { t } = useI18n()
const hold = useHoldAction()

const MAX_JAIL_MINUTES = 60
const stars = ref(1)
const jailMinutesInput = ref('5')
const placeKey = ref('')
const jailMinutes = computed(() => wholeIn(jailMinutesInput.value, 1, MAX_JAIL_MINUTES))
const places = computed(() => props.admin.menu.value?.destinations ?? [])

function hasPower(toggle: AdminToggle): boolean {
  return props.sheet?.powers.includes(toggle) ?? false
}
</script>

<template>
  <p v-if="!targetIsHere" class="m-0 text-xs text-coral">{{ t('adminPanel.targetGone') }}</p>

  <section v-for="group in TOGGLE_GROUPS" :key="group.group" class="flex flex-col gap-1.5" :aria-label="t(`adminPanel.toggleGroups.${group.group}`)">
    <h3 class="m-0 text-xs font-bold text-fog">{{ t(`adminPanel.toggleGroups.${group.group}`) }}</h3>
    <button
      v-for="toggle in group.toggles"
      :key="toggle"
      type="button"
      role="switch"
      :aria-checked="hasPower(toggle)"
      :disabled="!sheet"
      class="flex min-h-11 items-center gap-2.5 rounded-lg bg-ink-900 px-2.5 py-2 text-left hover:bg-ink-700 disabled:opacity-50"
      @click="admin.power(target, toggle, !hasPower(toggle))"
    >
      <span :class="['grid size-8 shrink-0 place-items-center rounded-lg', hasPower(toggle) ? 'bg-mint text-ink-950' : 'bg-ink-800 text-mist']">
        <UiIcon :name="POWER_ICON[toggle]" :size="16" />
      </span>
      <span class="min-w-0 flex-1">
        <b class="block text-sm text-fog">{{ t(`adminPanel.powers.${toggle}`) }}</b>
        <small class="block text-[11px] text-mist">{{ t(`adminPanel.powerHints.${toggle}`) }}</small>
      </span>
      <span :class="['relative h-6 w-10 shrink-0 rounded-full transition-colors', hasPower(toggle) ? 'bg-mint' : 'bg-ink-700']" aria-hidden="true">
        <span :class="['absolute top-0.5 size-5 rounded-full bg-fog transition-[left]', hasPower(toggle) ? 'left-[18px]' : 'left-0.5']" />
      </span>
    </button>
  </section>
  <p class="m-0 text-[11px] text-mist">{{ t('adminPanel.lastingHint') }}</p>

  <section class="flex flex-col gap-1.5" :aria-label="t('adminPanel.instant')">
    <h3 class="m-0 text-xs font-bold text-fog">{{ t('adminPanel.instant') }}</h3>
    <div class="grid grid-cols-2 gap-1.5">
      <button
        v-for="boost in ADMIN_BOOSTS"
        :key="boost"
        type="button"
        :disabled="!targetIsHere"
        class="flex min-h-11 items-center gap-2 rounded-lg bg-ink-900 px-2.5 py-2 text-left text-xs font-bold text-fog hover:bg-ink-700 disabled:opacity-50"
        @click="admin.power(target, boost)"
      >
        <UiIcon :name="POWER_ICON[boost]" :size="16" class="text-sun" />
        {{ t(`adminPanel.powers.${boost}`) }}
      </button>
    </div>
  </section>

  <section class="flex flex-col gap-2 rounded-lg bg-ink-900 p-2.5" :aria-label="t('adminPanel.moderation')">
    <h3 class="m-0 flex items-center gap-1.5 text-xs font-bold text-fog"><UiIcon name="shield" :size="14" class="text-coral" />{{ t('adminPanel.moderation') }}</h3>

    <div class="flex items-center gap-1.5">
      <span class="w-20 shrink-0 text-xs text-mist">{{ t('adminPanel.stars') }}</span>
      <div class="flex flex-1 gap-0.5" role="radiogroup" :aria-label="t('adminPanel.stars')">
        <button
          v-for="n in 6"
          :key="n"
          type="button"
          role="radio"
          :aria-checked="stars === n - 1"
          :class="['min-h-10 flex-1 rounded-md text-xs font-bold', stars === n - 1 ? 'bg-coral text-ink-950' : 'bg-ink-800 text-mist']"
          @click="stars = n - 1"
        >
          {{ n - 1 === 0 ? '0' : `${n - 1}★` }}
        </button>
      </div>
      <button type="button" class="cc-btn cc-btn-sm min-h-10" :disabled="!targetIsHere" @click="admin.moderate(target, 'stars', { stars })">{{ t('adminPanel.set') }}</button>
    </div>

    <div class="flex items-center gap-1.5">
      <span class="w-20 shrink-0 text-xs text-mist">{{ t('adminPanel.jail') }}</span>
      <input v-model="jailMinutesInput" type="number" min="1" :max="MAX_JAIL_MINUTES" class="cc-input min-h-10 w-16 text-center" :aria-label="t('adminPanel.jailMinutes')" />
      <span class="text-xs text-mist">min</span>
      <button type="button" class="cc-btn cc-btn-sm min-h-10 flex-1" :disabled="!targetIsHere || jailMinutes === null" @click="jailMinutes !== null && admin.moderate(target, 'jail', { minutes: jailMinutes })">
        {{ t('adminPanel.jailNow') }}
      </button>
      <button type="button" class="cc-btn cc-btn-sm min-h-10 flex-1" :disabled="!targetIsHere" @click="admin.moderate(target, 'release')">{{ t('adminPanel.release') }}</button>
    </div>

    <div class="flex items-center gap-1.5">
      <span class="w-20 shrink-0 text-xs text-mist">{{ t('adminPanel.sendTo') }}</span>
      <select v-model="placeKey" class="cc-input min-h-10 min-w-0 flex-1" :aria-label="t('adminPanel.sendTo')">
        <option value="" disabled>{{ t('adminPanel.choosePlace') }}</option>
        <option v-for="place in places" :key="place.key" :value="place.key">{{ place.name }}</option>
      </select>
      <button type="button" class="cc-btn cc-btn-sm min-h-10" :disabled="!targetIsHere || placeKey === ''" @click="admin.moderate(target, 'send', { key: placeKey })">{{ t('adminPanel.send') }}</button>
    </div>

    <AdminHoldButton
      v-if="!isMe"
      danger
      :holding="hold.holding.value === 'kick'"
      :label="t('adminPanel.holdTo', { action: t('adminPanel.kick') })"
      :disabled="!targetIsHere"
      @start="hold.start('kick', () => admin.moderate(target, 'kick'))"
      @cancel="hold.cancel"
    />
  </section>
</template>
