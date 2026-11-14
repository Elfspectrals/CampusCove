<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { actionKeyLabels } from '../../config/keybindings'
import type { TownBusHud } from '../../composables/game/useTownBus'

const props = defineProps<{ hud: TownBusHud; stops: Array<{ id: string; name: string }> }>()
const emit = defineEmits<{ alight: [stop: string] }>()
const { t } = useI18n()
const key = computed(() => actionKeyLabels('interact')[0] ?? '')
</script>

<template>
  <section
    class="cc-hud pointer-events-auto absolute left-1/2 top-3 z-10 flex w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-1 px-3 py-2"
    aria-labelledby="town-bus-title"
  >
    <h2 id="town-bus-title" class="m-0 text-[11px] font-extrabold text-sun">{{ t('bus.title') }}</h2>
    <p class="m-0 text-sm font-bold text-fog" role="status">
      {{ props.hud.dockedAt ? t('bus.atStop', { stop: props.hud.dockedAt, s: props.hud.departsInS }) : t('bus.nextStop', { stop: props.hud.nextStop }) }}
    </p>
    <p v-if="props.hud.gettingOffAt" class="m-0 text-xs font-bold text-mint">{{ t('bus.gettingOff', { stop: props.hud.gettingOffAt }) }}</p>
    <p v-else class="m-0 text-xs text-mist">{{ props.hud.dockedAt ? t('bus.getOffHere', { key }) : t('bus.getOffNext', { key }) }}</p>
    <div class="flex flex-wrap items-center gap-1 pt-1">
      <span class="text-[11px] text-mist">{{ t('bus.chooseStop') }}</span>
      <button
        v-for="stop in props.stops"
        :key="stop.id"
        type="button"
        class="cc-btn cc-btn-ghost cc-btn-sm min-h-11 px-2 text-[11px]"
        @click="emit('alight', stop.id)"
      >
        {{ stop.name }}
      </button>
    </div>
  </section>
</template>
