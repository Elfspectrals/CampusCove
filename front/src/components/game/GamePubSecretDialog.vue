<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import UiIcon from '../ui/UiIcon.vue'

/** The bouncer in front of the staff door: say the right words and he lets you in. */
defineProps<{
  greeting: string
  /** His answer to the last phrase, once the server has judged it. */
  reply: string | null
  pending: boolean
}>()

const emit = defineEmits<{ whisper: [phrase: string]; close: [] }>()

const phrase = ref('')
const input = ref<HTMLInputElement | null>(null)

function submit(): void {
  const text = phrase.value.trim()
  if (!text) return
  emit('whisper', text)
  phrase.value = ''
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  input.value?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(400px,92vw)] animate-cc-pop overflow-hidden p-0" aria-label="Bouncer">
      <header class="flex items-center justify-between bg-grape px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">Bouncer</span>
        <button type="button" class="inline-flex items-center" aria-label="Walk away" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <div class="flex flex-col gap-3 px-4 py-4">
        <p class="m-0 font-display text-lg text-fog">“{{ reply ?? greeting }}”</p>
        <form class="flex gap-2" @submit.prevent="submit">
          <input
            ref="input"
            v-model="phrase"
            type="text"
            class="cc-input min-w-0 flex-1"
            placeholder="Say something…"
            maxlength="80"
            autocomplete="off"
            :disabled="pending"
          />
          <button type="submit" class="cc-btn cc-btn-sm cc-btn-grape" :disabled="pending || phrase.trim().length === 0">Say</button>
        </form>
      </div>
    </section>
  </div>
</template>
