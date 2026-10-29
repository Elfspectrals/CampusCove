<script setup lang="ts">
import { computed } from 'vue'
import { actionKeyLabels, bindings, keyLabel } from '../../config/keybindings'
import UiIcon from '../ui/UiIcon.vue'
import UiLogo from '../ui/UiLogo.vue'

const emit = defineEmits<{
  requestPointerLock: []
  openSettings: []
  logout: []
}>()

/** The player's own keys (Settings), first key of each action. */
const controls = computed<Array<{ keys: string[]; label: string }>>(() => {
  const first = (a: Parameters<typeof actionKeyLabels>[0]) => actionKeyLabels(a).slice(0, 1)
  const hotbar = [bindings.hotbar1[0], bindings.hotbar9[0]].filter((k): k is string => !!k).map(keyLabel)
  return [
    { keys: [...first('moveForward'), ...first('moveLeft'), ...first('moveBack'), ...first('moveRight')], label: 'Move' },
    { keys: ['Mouse'], label: 'Look around' },
    { keys: first('jump'), label: 'Jump (stamina)' },
    { keys: ['Shift'], label: 'Hold to sprint (stamina)' },
    { keys: first('interact'), label: 'Use: doors, shops, cafe, clinic, eat / drink' },
    { keys: first('punch'), label: 'Punch' },
    { keys: first('survivalWatch'), label: 'Hold to look at your watch (hunger, thirst)' },
    { keys: first('inventory'), label: 'Inventory' },
    { keys: [...(hotbar.length === 2 ? [`${hotbar[0]}–${hotbar[1]}`] : hotbar), 'Wheel'], label: 'Hotbar slot' },
    { keys: ['Esc'], label: 'Pause / free mouse' },
  ]
})
</script>

<template>
  <div class="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-ink-950/65 p-4 backdrop-blur-sm">
    <div class="cc-panel m-auto w-full max-w-md animate-cc-pop overflow-hidden">
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

        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <!-- the game hides the site header, so this is the way back out -->
          <RouterLink :to="{ name: 'home' }" class="cc-btn cc-btn-ghost cc-btn-sm">
            <UiIcon name="home" :size="16" /> Lobby
          </RouterLink>
          <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="emit('openSettings')">
            <UiIcon name="settings" :size="16" /> Settings
          </button>
          <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="emit('logout')">
            <UiIcon name="logout" :size="16" /> Log out
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
