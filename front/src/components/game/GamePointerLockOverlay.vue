<script setup lang="ts">
import UiIcon from '../ui/UiIcon.vue'
import UiLogo from '../ui/UiLogo.vue'

const emit = defineEmits<{
  requestPointerLock: []
  openSettings: []
  logout: []
}>()
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
