<script setup lang="ts">
const emit = defineEmits<{
  requestPointerLock: []
  logout: []
}>()
</script>

<template>
  <div
    class="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60"
  >
    <p class="m-0 text-base text-white/80">Click to lock pointer · ZQSD / WASD to move · Mouse to look</p>
    <button
      type="button"
      class="rounded-lg border-0 bg-campus-accent px-8 py-3 text-lg font-semibold text-white hover:opacity-90"
      @click="emit('requestPointerLock')"
    >
      Play
    </button>
    <button
      type="button"
      class="rounded-md border border-white/30 bg-transparent px-4 py-2 text-sm text-white/90 hover:border-campus-accent hover:text-campus-accent"
      @click="emit('logout')"
    >
      Logout
    </button>
  </div>
</template>
