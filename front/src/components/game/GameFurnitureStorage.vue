<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OfferableItem } from '../../api/trades'
import type { StorageScreenPayload } from '../../types/gameRealtime'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  screen: StorageScreenPayload | null
  storable: OfferableItem[]
  pending: boolean
  error: string | null
}>()
const emit = defineEmits<{ deposit: [code: string, quantity: number]; take: [code: string, quantity: number]; close: [] }>()

const { t, te } = useI18n()

const title = computed(() => {
  const key = `storage.names.${props.screen?.code ?? ''}`
  return te(key) ? t(key) : t('storage.title')
})
const used = computed(() => props.screen?.items.length ?? 0)

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40 select-none" @mousedown.self="emit('close')">
    <section class="cc-hud flex max-h-[90vh] w-[min(720px,94vw)] animate-cc-pop flex-col overflow-hidden p-0" :aria-label="title">
      <header class="flex items-center justify-between bg-grape px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ title }}</span>
        <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('storage.close')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <p v-if="!screen" class="m-0 px-5 py-6 text-center text-sm text-mist">{{ t('storage.loading') }}</p>

      <div v-else class="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        <div class="flex flex-col gap-2">
          <h3 class="m-0 flex items-baseline justify-between text-sm font-bold text-fog">
            <span>{{ t('storage.inside') }}</span>
            <span class="text-xs tabular-nums text-mist">{{ t('storage.slots', { used, slots: screen.slots }) }}</span>
          </h3>
          <p v-if="screen.items.length === 0" class="m-0 text-xs text-mist">{{ t('storage.empty') }}</p>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <li v-for="item in screen.items" :key="item.code" class="flex items-center gap-2 rounded-md bg-line/10 px-2 py-1">
              <img v-if="item.preview_image" :src="item.preview_image" alt="" class="h-9 w-9 shrink-0 object-contain" />
              <span class="min-w-0 flex-1 truncate text-sm text-fog">{{ item.name }} <span class="text-mist">×{{ item.quantity }}</span></span>
              <button type="button" class="cc-btn cc-btn-sm min-h-11" :disabled="pending" @click="emit('take', item.code, 1)">{{ t('storage.takeOne') }}</button>
              <button v-if="item.quantity > 1" type="button" class="cc-btn cc-btn-sm min-h-11" :disabled="pending" @click="emit('take', item.code, item.quantity)">{{ t('storage.all') }}</button>
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="m-0 text-sm font-bold text-fog">{{ t('storage.bag') }}</h3>
          <p v-if="!screen.can_deposit" class="m-0 text-xs text-mist">{{ t('storage.notYours') }}</p>
          <template v-else>
            <p v-if="screen.food_only" class="m-0 text-xs text-mist">{{ t('storage.foodOnly') }}</p>
            <p v-if="storable.length === 0" class="m-0 text-xs text-mist">{{ t('storage.nothingToStore') }}</p>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              <li v-for="item in storable" :key="item.code" class="flex items-center gap-2 rounded-md bg-line/10 px-2 py-1">
                <img v-if="item.preview_image" :src="item.preview_image" alt="" class="h-9 w-9 shrink-0 object-contain" />
                <span class="min-w-0 flex-1 truncate text-sm text-fog">{{ item.name }} <span class="text-mist">×{{ item.quantity }}</span></span>
                <button type="button" class="cc-btn cc-btn-sm min-h-11" :disabled="pending" @click="emit('deposit', item.code, 1)">{{ t('storage.putOne') }}</button>
                <button v-if="item.quantity > 1" type="button" class="cc-btn cc-btn-sm min-h-11" :disabled="pending" @click="emit('deposit', item.code, item.quantity)">{{ t('storage.all') }}</button>
              </li>
            </ul>
          </template>
        </div>
      </div>

      <p v-if="error" class="m-0 border-t border-line/10 px-5 py-2 text-center text-sm text-coral" role="alert">{{ error }}</p>
    </section>
  </div>
</template>
