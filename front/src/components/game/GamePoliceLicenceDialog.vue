<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  price: number
  buying: boolean
  error: string | null
}>()

const emit = defineEmits<{ confirm: []; close: [] }>()
const { t } = useI18n()

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(400px,92vw)] animate-cc-pop overflow-hidden p-0" aria-labelledby="cc-police-licence-title">
      <header class="flex items-center justify-between bg-pool px-4 py-2 text-ink-950">
        <span id="cc-police-licence-title" class="font-display text-sm uppercase tracking-[0.18em]">{{ t('police.licenceTitle') }}</span>
        <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('police.cancel')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <div class="flex flex-col gap-3 px-4 py-4">
        <p class="m-0 text-sm text-fog">{{ t('police.licenceBody') }}</p>
        <p class="m-0 text-sm font-bold text-fog">
          {{ t('police.licencePrice') }} <span class="text-sun">{{ t('police.coins', { price }) }}</span>
        </p>
        <p class="m-0 text-xs text-mist">{{ t('police.licenceRules') }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="emit('close')">{{ t('police.cancel') }}</button>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-pool min-h-11" :disabled="buying" @click="emit('confirm')">
            {{ buying ? t('police.buying') : t('police.buy', { price }) }}
          </button>
        </div>
        <p v-if="error" class="m-0 text-xs font-bold text-coral" role="alert">{{ error }}</p>
      </div>
    </section>
  </div>
</template>
