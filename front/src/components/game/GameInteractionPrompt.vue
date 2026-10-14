<script setup lang="ts">
defineProps<{
  screenX: number
  screenY: number
  keyLabel: string
  actionLabel: string
  detailLabel?: string
}>()
</script>

<template>
  <div
    class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 select-none"
    :style="{ left: `${screenX}px`, top: `${screenY}px` }"
  >
    <div class="flex flex-col items-center">
      <div class="relative flex h-14 w-14 items-center justify-center">
        <div class="absolute inset-0 animate-ping rounded-2xl border-2 border-sun/70 opacity-60" />
        <div
          class="relative grid h-12 w-12 place-items-center rounded-2xl border-2 border-ink-950 bg-sun font-display text-xl leading-none text-ink-950"
          style="box-shadow: inset 0 2px 0 rgb(255 255 255 / 0.5), inset 0 -3px 0 rgb(var(--cc-sun-edge)), 0 4px 0 rgb(var(--cc-ink-950)), 0 0 18px rgb(var(--cc-sun) / 0.6)"
        >
          {{ keyLabel }}
        </div>
      </div>
      <div class="mt-1.5 flex flex-col items-center gap-0.5">
        <div class="cc-hud px-2.5 py-0.5 font-display text-xs uppercase tracking-wider">
          {{ actionLabel }}
        </div>
        <div v-if="detailLabel" class="max-w-[11rem] rounded-md bg-ink-950/70 px-2 py-0.5 text-center text-[10px] font-semibold text-mist">
          {{ detailLabel }}
        </div>
      </div>
    </div>
  </div>
</template>
