<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BootFiles, BootStage, StageState } from '../../game/loading/bootProgress'
import UiLogo from '../ui/UiLogo.vue'

const props = defineProps<{
  percent: number
  stages: ReadonlyArray<{ stage: BootStage; state: StageState }>
  files: BootFiles
}>()

const { t, tm, rt } = useI18n()

const TIP_EVERY_MS = 5000
const tips = computed(() => (tm('gameLoading.tips') as unknown[]).map((tip) => rt(tip as Parameters<typeof rt>[0])))
const tipIndex = ref(Math.floor(Math.random() * 1000))
let tipTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  tipTimer = setInterval(() => tipIndex.value++, TIP_EVERY_MS)
})
onUnmounted(() => clearInterval(tipTimer))
const tip = computed(() => tips.value[tipIndex.value % tips.value.length] ?? '')
</script>

<template>
  <div
    class="cc-world pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8 sm:gap-8"
    role="progressbar"
    :aria-valuenow="props.percent"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="t('gameLoading.title')"
  >
    <UiLogo size="md" class="scale-110 sm:scale-125" />

    <div class="cc-panel w-full max-w-[480px] animate-cc-pop overflow-hidden">
      <div class="h-1 bg-sun" />
      <div class="flex flex-col gap-[18px] px-5 pb-6 pt-6 sm:px-7">
        <div class="flex items-baseline justify-between gap-3">
          <p class="cc-eyebrow m-0">{{ t('gameLoading.title') }}</p>
          <span class="font-mono text-[22px] font-bold leading-none text-sun">{{ props.percent }}%</span>
        </div>

        <div class="relative h-[18px] overflow-hidden rounded-full border-2 border-ink-600/60 bg-ink-950">
          <div
            class="relative h-full rounded-full bg-sun transition-[width] duration-300 ease-out"
            :style="{ width: `${props.percent}%` }"
          >
            <span class="absolute inset-x-1 top-[3px] h-1 rounded-sm bg-white/35" />
          </div>
        </div>

        <ul class="m-0 flex list-none flex-col gap-2.5 p-0">
          <li v-for="row in props.stages" :key="row.stage" class="flex items-center gap-2.5 text-[15px] font-bold" :class="row.state === 'pending' ? 'text-mist/70' : 'text-fog'">
            <svg v-if="row.state === 'done'" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" class="shrink-0">
              <circle cx="10" cy="10" r="10" fill="rgb(var(--cc-mint))" />
              <path d="m6 10.5 2.6 2.6L14 7.6" stroke="rgb(var(--cc-ink-950))" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg v-else width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" class="shrink-0" :class="row.state === 'active' && 'animate-spin motion-reduce:animate-none'">
              <circle cx="10" cy="10" r="8" stroke="rgb(var(--cc-ink-600))" stroke-width="3" fill="none" />
              <path v-if="row.state === 'active'" d="M10 2a8 8 0 0 1 8 8" stroke="rgb(var(--cc-sun))" stroke-width="3" fill="none" stroke-linecap="round" />
            </svg>
            {{ t(`gameLoading.stages.${row.stage}`) }}
          </li>
        </ul>

        <p v-if="props.files.total > 0" class="m-0 font-mono text-xs font-bold text-mist/80">
          {{ t('gameLoading.files', { loaded: props.files.loaded, total: props.files.total }) }}
        </p>
      </div>
    </div>

    <p v-if="tip" class="m-0 flex w-full max-w-[480px] items-center gap-2 rounded-2xl border border-line/10 bg-ink-950/50 px-4 py-2.5 text-sm font-semibold text-fog sm:w-auto sm:rounded-full">
      <span class="shrink-0 rounded-md bg-pool px-1.5 py-0.5 text-[11px] font-extrabold text-ink-950">{{ t('gameLoading.tip') }}</span>
      {{ tip }}
    </p>
  </div>
</template>
