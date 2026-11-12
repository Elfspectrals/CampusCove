<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CHAT_LIFETIME_S } from '../../game/chatBubble'

const { t } = useI18n()

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ send: [text: string]; close: [] }>()

const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
const lastSent = ref<string | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    input.value?.focus()
  },
)

function showLastSent(text: string): void {
  lastSent.value = text
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (lastSent.value = null), CHAT_LIFETIME_S * 1000)
}

function submit(): void {
  const text = draft.value.replace(/\s+/g, ' ').trim()
  draft.value = ''
  if (text) {
    emit('send', text)
    showLastSent(text)
  }
  emit('close')
}

function cancel(): void {
  draft.value = ''
  emit('close')
}

onUnmounted(() => clearTimeout(hideTimer))
</script>

<template>
  <div class="pointer-events-none absolute bottom-32 left-4 z-[30] flex w-[min(360px,80vw)] flex-col gap-2">
    <p v-if="lastSent && !open" class="cc-hud m-0 animate-cc-pop break-words px-3 py-2 text-sm text-fog">
      <span class="text-fog/60">{{ t('gameChat.you') }}</span> {{ lastSent }}
    </p>
    <form v-if="open" class="pointer-events-auto" @submit.prevent="submit">
      <input
        ref="input"
        v-model="draft"
        type="text"
        class="cc-input w-full"
        :placeholder="t('gameChat.placeholder')"
        maxlength="120"
        autocomplete="off"
        :aria-label="t('gameChat.label')"
        @keydown.esc.prevent="cancel"
        @blur="cancel"
      />
    </form>
  </div>
</template>
