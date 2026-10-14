<script setup lang="ts">
import UiIcon from '../ui/UiIcon.vue'
import UiLogo from '../ui/UiLogo.vue'

const emit = defineEmits<{
  requestPointerLock: []
  logout: []
}>()

const controls: Array<{ keys: string[]; label: string }> = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move (ZQSD on AZERTY)' },
  { keys: ['Mouse'], label: 'Look around' },
  { keys: ['Left click'], label: 'Use a door (enter, rent, buy)' },
  { keys: ['E'], label: 'Inventory' },
  { keys: ['1–9'], label: 'Hotbar slot' },
  { keys: ['Esc'], label: 'Pause / free mouse' },
]
</script>

<template>
  <div class="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-ink-950/65 p-4 backdrop-blur-sm">
    <div class="cc-panel w-full max-w-md animate-cc-pop overflow-hidden">
      <div class="h-2 bg-[linear-gradient(90deg,rgb(var(--cc-sun)),rgb(var(--cc-coral)),rgb(var(--cc-grape)),rgb(var(--cc-pool)))]" />
      <div class="flex flex-col items-center p-7 text-center">
        <UiLogo size="md" />
        <p class="cc-eyebrow mt-3">Click play to lock the pointer</p>
        <button type="button" class="cc-btn cc-btn-sun cc-btn-xl cc-btn-shine mt-5 w-full" @click="emit('requestPointerLock')">
          <UiIcon name="play" :size="26" fill /> Play
        </button>

        <ul class="m-0 mt-6 w-full list-none space-y-2 p-0 text-left">
          <li v-for="c in controls" :key="c.label" class="flex items-center justify-between gap-3 rounded-xl bg-ink-950/50 px-3 py-2 text-sm font-bold">
            <span class="text-mist">{{ c.label }}</span>
            <span class="flex gap-1">
              <span v-for="k in c.keys" :key="k" class="cc-keycap">{{ k }}</span>
            </span>
          </li>
        </ul>

        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm mt-5" @click="emit('logout')">
          <UiIcon name="logout" :size="16" /> Log out
        </button>
      </div>
    </div>
  </div>
</template>
