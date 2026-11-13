<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TUTORIAL_STEPS, type TutorialStep } from '../../api/tutorial'

const props = defineProps<{ step: TutorialStep }>()
const emit = defineEmits<{ skip: [] }>()
const { t } = useI18n()
const confirming = ref(false)
const stepNumber = computed(() => TUTORIAL_STEPS.indexOf(props.step) + 1)

function confirmSkip(): void {
  confirming.value = false
  emit('skip')
}
</script>

<template>
  <section
    class="cc-hud pointer-events-auto absolute right-3 top-[17rem] z-10 flex w-[min(18rem,calc(100vw-1.5rem))] flex-col gap-1.5 px-3 py-2"
    aria-labelledby="tutorial-quest-title"
  >
    <h2 id="tutorial-quest-title" class="m-0 text-[11px] font-extrabold text-sun">
      {{ t('tutorial.title', { n: stepNumber, total: TUTORIAL_STEPS.length }) }}
    </h2>
    <template v-if="confirming">
      <p class="m-0 text-sm font-bold text-fog">{{ t('tutorial.skipConfirm') }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm min-h-11" @click="confirming = false">{{ t('tutorial.keepGoing') }}</button>
        <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="confirmSkip">{{ t('tutorial.skip') }}</button>
      </div>
    </template>
    <template v-else>
      <p class="m-0 text-sm font-bold text-fog" role="status">{{ t(`tutorial.steps.${step}`) }}</p>
      <div class="flex justify-end">
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm min-h-11" @click="confirming = true">{{ t('tutorial.skip') }}</button>
      </div>
    </template>
  </section>
</template>
