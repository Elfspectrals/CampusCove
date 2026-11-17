<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '../ui/UiIcon.vue'
import UiLogo from '../ui/UiLogo.vue'
import GameOptions from './GameOptions.vue'

defineProps<{ inSport: boolean; reducedEffects: boolean }>()

const emit = defineEmits<{
  requestPointerLock: []
  logout: []
  leaveSport: []
  toggleReducedEffects: []
}>()

const { t } = useI18n()
const optionsOpen = ref(false)

function back(): boolean {
  if (!optionsOpen.value) return false
  optionsOpen.value = false
  return true
}

defineExpose({ back })
</script>

<template>
  <div class="pointer-events-auto absolute inset-0 z-20 flex bg-ink-950/80 backdrop-blur-md max-md:flex-col" role="dialog" aria-modal="true" :aria-label="t('pause.title')">
    <nav class="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto p-6 sm:p-8 max-md:w-full" :class="optionsOpen ? 'max-md:hidden' : ''">
      <UiLogo size="md" />
      <h2 class="cc-display m-0 mt-6 mb-4 text-4xl">{{ t('pause.title') }}</h2>
      <button type="button" class="cc-btn cc-btn-sun cc-btn-xl cc-btn-shine w-full" @click="emit('requestPointerLock')">
        <UiIcon name="play" :size="22" fill /> {{ t('pause.resume') }}
      </button>
      <button type="button" class="cc-btn min-h-11 w-full" :class="optionsOpen ? 'cc-btn-sun' : 'cc-btn-ghost'" :aria-expanded="optionsOpen" @click="optionsOpen = !optionsOpen">
        <UiIcon name="settings" :size="16" /> {{ t('pause.options') }}
      </button>
      <button v-if="inSport" type="button" class="cc-btn cc-btn-coral min-h-11 w-full" @click="emit('leaveSport')">
        {{ t('sports.leave') }}
      </button>
      <RouterLink :to="{ name: 'home' }" class="cc-btn cc-btn-ghost min-h-11 w-full">
        <UiIcon name="home" :size="16" /> {{ t('pause.lobby') }}
      </RouterLink>
      <button type="button" class="cc-btn cc-btn-ghost min-h-11 w-full" @click="emit('logout')">
        <UiIcon name="logout" :size="16" /> {{ t('pause.logout') }}
      </button>
    </nav>
    <div v-if="optionsOpen" class="flex min-h-0 min-w-0 flex-1 flex-col">
      <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm m-4 mb-0 self-start md:hidden" @click="optionsOpen = false">{{ t('pause.back') }}</button>
      <GameOptions class="min-h-0 flex-1" :reduced-effects="reducedEffects" @toggle-reduced-effects="emit('toggleReducedEffects')" />
    </div>
  </div>
</template>
