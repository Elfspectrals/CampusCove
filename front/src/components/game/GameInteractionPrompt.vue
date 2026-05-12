<script setup lang="ts">
defineProps<{
  screenX: number
  screenY: number
  keyLabel: string
  actionLabel: string
}>()
</script>

<template>
  <div
    class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 select-none"
    :style="{ left: `${screenX}px`, top: `${screenY}px` }"
  >
    <div class="flex flex-col items-center">
      <div class="relative flex h-14 w-14 items-center justify-center">
        <div
          class="absolute inset-0 animate-ping rounded-full border-2 border-campus-accent/70 opacity-60"
        />
        <div
          class="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-campus-accent bg-black/65 shadow-[0_0_14px_rgba(233,69,96,0.55)] backdrop-blur-sm"
        >
          <span class="text-base font-bold leading-none text-white">{{ keyLabel }}</span>
        </div>
      </div>
      <div
        class="mt-1.5 rounded bg-black/65 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/95"
      >
        {{ actionLabel }}
      </div>
    </div>
  </div>
</template>
