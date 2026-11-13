<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { quizRows, quizText, secondsLeft, type QuizChoice } from '../../game/pub/quiz'
import type { Locale } from '../../seo/site'
import type { QuizScreen } from '../../composables/game/usePubQuiz'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  screen: QuizScreen
  mySessionId: string
}>()

const emit = defineEmits<{ answer: [choice: QuizChoice]; close: [] }>()

const { t, locale } = useI18n()
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 250)))
onUnmounted(() => timer && clearInterval(timer))

const lang = computed(() => locale.value as Locale)
const question = computed(() => (props.screen.kind === 'results' ? null : props.screen.question))
const myChoice = computed(() => (props.screen.kind === 'results' ? null : props.screen.myChoice))
const answer = computed(() => (props.screen.kind === 'reveal' ? props.screen.answer : null))
const ranking = computed(() => (props.screen.kind === 'question' ? [] : quizRows(props.screen.ranking, props.mySessionId)))
const seconds = computed(() => (props.screen.kind === 'question' ? secondsLeft(props.screen.question.closesAt, now.value) : 0))
const verdict = computed(() => {
  if (answer.value === null) return null
  if (myChoice.value === null) return { text: t('pubQuiz.noAnswer'), tone: 'text-mist' }
  return myChoice.value === answer.value ? { text: t('pubQuiz.right'), tone: 'text-mint' } : { text: t('pubQuiz.wrong'), tone: 'text-coral' }
})
const prize = computed(() => (props.screen.kind === 'results' ? props.screen.prize : null))

function choiceTone(i: number): string {
  if (answer.value !== null) {
    if (i === answer.value) return 'bg-mint/20 ring-2 ring-mint text-fog'
    if (i === myChoice.value) return 'bg-coral/15 ring-2 ring-coral/70 text-fog'
    return 'bg-ink-950/40 text-mist'
  }
  if (i === myChoice.value) return 'bg-sun/15 ring-2 ring-sun text-fog'
  return myChoice.value === null ? 'bg-ink-950/40 text-fog hover:bg-ink-950/70' : 'bg-ink-950/40 text-mist'
}
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40 select-none">
    <section class="cc-hud w-[min(640px,94vw)] animate-cc-pop overflow-hidden p-0" :aria-label="t('pubQuiz.title')">
      <header class="flex items-center justify-between bg-pool px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('pubQuiz.title') }}</span>
        <span v-if="question" class="font-display text-sm tabular-nums">{{ t('pubQuiz.progress', { n: question.index + 1, count: question.count }) }}</span>
        <button v-else type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('pubQuiz.close')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div v-if="question" class="flex flex-col gap-4 px-5 py-4">
        <div class="flex items-start gap-4">
          <p class="m-0 flex-1 text-lg font-bold text-fog">{{ quizText(question.prompt, lang) }}</p>
          <span
            class="font-display text-2xl tabular-nums"
            :class="screen.kind === 'question' && seconds <= 5 ? 'text-coral' : 'text-sun'"
            aria-live="polite"
          >{{ screen.kind === 'question' ? t('pubQuiz.seconds', { n: seconds }) : '' }}</span>
        </div>

        <ol class="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          <li v-for="(choice, i) in question.choices" :key="i">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition-colors"
              :class="choiceTone(i)"
              :disabled="screen.kind !== 'question' || myChoice !== null"
              @click="emit('answer', i as QuizChoice)"
            >
              <span class="font-display text-base text-sun">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1">{{ quizText(choice, lang) }}</span>
            </button>
          </li>
        </ol>

        <p v-if="verdict" class="m-0 font-display text-lg" :class="verdict.tone">{{ verdict.text }}</p>
        <p v-else class="m-0 text-[11px] text-mist">{{ myChoice === null ? t('pubQuiz.keys') : t('pubQuiz.answered') }}</p>
      </div>

      <div v-if="ranking.length" class="flex flex-col gap-2 border-t border-line/10 px-5 py-4">
        <p class="m-0 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ screen.kind === 'results' ? t('pubQuiz.final') : t('pubQuiz.ranking') }}</p>
        <ol class="m-0 flex list-none flex-col gap-1.5 p-0">
          <li
            v-for="row in ranking.slice(0, screen.kind === 'results' ? 10 : 5)"
            :key="row.sessionId"
            class="flex items-center gap-3 rounded-xl px-3 py-1.5"
            :class="screen.kind === 'results' && row.place === 1 ? 'bg-sun/15 ring-2 ring-sun/60' : 'bg-ink-950/40'"
          >
            <span class="w-6 text-center font-display text-base" :class="row.place === 1 ? 'text-sun' : 'text-mist'">
              <UiIcon v-if="screen.kind === 'results' && row.place === 1" name="crown" :size="16" />
              <template v-else>{{ row.place }}</template>
            </span>
            <p class="m-0 min-w-0 flex-1 truncate text-sm font-bold" :class="row.me ? 'text-sun' : 'text-fog'">
              {{ row.pseudo }}<span v-if="row.me" class="ml-1 text-mist">{{ t('pubQuiz.you') }}</span>
            </p>
            <span class="font-display text-base tabular-nums text-fog">{{ t('pubQuiz.points', { n: row.points }) }}</span>
          </li>
        </ol>
      </div>

      <footer v-if="screen.kind === 'results'" class="flex flex-wrap items-center justify-between gap-3 border-t border-line/10 px-4 py-3">
        <p v-if="prize" class="m-0 text-sm font-bold text-fog">
          <template v-if="prize.sessionId === mySessionId && prize.coins > 0">
            {{ t('pubQuiz.winner', { coins: prize.coins }) }}<template v-if="prize.pint"> {{ t('pubQuiz.winnerPint') }}</template>
          </template>
          <template v-else-if="prize.coins === 0 && !prize.pint">{{ t('pubQuiz.noPrize') }}</template>
          <template v-else>{{ t('pubQuiz.someoneWon', { name: prize.pseudo }) }}</template>
        </p>
        <span v-else />
        <button type="button" class="cc-btn cc-btn-sm cc-btn-coral" @click="emit('close')">{{ t('pubQuiz.close') }}</button>
      </footer>
    </section>
  </div>
</template>
