<script setup lang="ts">
/**
 * Full-screen "title screen" backdrop: night sky, sunset horizon, floating isometric
 * blocks and a tiled plaza floor — the frame for landing + auth pages.
 */
const blocks = [
  { x: '8%', y: '18%', s: 64, c: 'sun', d: '0s' },
  { x: '84%', y: '14%', s: 88, c: 'grape', d: '-1.5s' },
  { x: '72%', y: '62%', s: 52, c: 'pool', d: '-3s' },
  { x: '14%', y: '68%', s: 76, c: 'coral', d: '-2.2s' },
  { x: '48%', y: '8%', s: 40, c: 'mint', d: '-4s' },
] as const

const top: Record<string, string> = {
  sun: 'rgb(255 202 58)',
  grape: 'rgb(168 110 255)',
  pool: 'rgb(64 214 245)',
  coral: 'rgb(255 92 122)',
  mint: 'rgb(76 227 160)',
}
</script>

<template>
  <div class="relative isolate flex min-h-screen w-full flex-col overflow-hidden">
    <!-- sky -->
    <div
      class="pointer-events-none absolute inset-0 -z-20"
      style="
        background:
          radial-gradient(1200px 520px at 50% 100%, rgb(255 92 122 / 0.45), transparent 60%),
          radial-gradient(900px 400px at 50% 92%, rgb(255 202 58 / 0.35), transparent 60%),
          linear-gradient(180deg, rgb(8 10 32) 0%, rgb(22 22 74) 55%, rgb(70 34 110) 100%);
      "
    />
    <!-- stars -->
    <div
      class="pointer-events-none absolute inset-0 -z-20 opacity-60"
      style="
        background-image:
          radial-gradient(1.5px 1.5px at 20% 30%, white, transparent),
          radial-gradient(1px 1px at 70% 20%, white, transparent),
          radial-gradient(1.5px 1.5px at 40% 12%, white, transparent),
          radial-gradient(1px 1px at 85% 40%, white, transparent),
          radial-gradient(1px 1px at 10% 50%, white, transparent),
          radial-gradient(1.5px 1.5px at 60% 45%, white, transparent);
        background-size: 420px 320px;
      "
    />
    <!-- perspective plaza floor -->
    <div class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[42%] overflow-hidden [perspective:600px]">
      <div
        class="absolute inset-x-[-50%] bottom-[-30%] h-[160%] origin-bottom [transform:rotateX(62deg)]"
        style="
          background-image:
            linear-gradient(rgb(255 202 58 / 0.35) 2px, transparent 2px),
            linear-gradient(90deg, rgb(255 202 58 / 0.35) 2px, transparent 2px);
          background-size: 70px 70px;
          mask-image: linear-gradient(to top, black 20%, transparent 85%);
        "
      />
    </div>
    <!-- floating isometric blocks -->
    <div
      v-for="(b, i) in blocks"
      :key="i"
      class="pointer-events-none absolute -z-10 hidden animate-cc-float sm:block"
      :style="{ left: b.x, top: b.y, width: `${b.s}px`, height: `${b.s}px`, animationDelay: b.d }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" class="h-full w-full drop-shadow-[0_12px_18px_rgba(0,0,0,0.45)]">
        <path d="M24 4 42 14 24 24 6 14z" :fill="top[b.c]" />
        <path d="M6 14 24 24v20L6 34z" :fill="top[b.c]" opacity=".7" />
        <path d="M42 14 24 24v20l18-10z" :fill="top[b.c]" opacity=".45" />
        <path d="M24 7 36 13.5" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".55" />
      </svg>
    </div>

    <slot />
  </div>
</template>
