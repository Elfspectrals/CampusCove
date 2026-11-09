<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { recentColors, rememberColor } from './recentColors'
import UiIcon from '../../ui/UiIcon.vue'

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const PANEL_WIDTH = 248
const PANEL_HEIGHT = 300
const HEX = /^#[0-9a-f]{6}$/i

interface Hsv {
  h: number
  s: number
  v: number
}

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const position = ref({ top: 0, left: 0 })
const hsv = ref<Hsv>({ h: 0, s: 0, v: 1 })
const hexText = ref(props.modelValue)
const original = ref(props.modelValue)
const recent = recentColors
const canPick = typeof window !== 'undefined' && 'EyeDropper' in window

const current = computed(() => hsvToHex(hsv.value))
const hueColor = computed(() => hsvToHex({ h: hsv.value.h, s: 1, v: 1 }))

function hexToHsv(hex: string): Hsv {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: max === 0 ? 0 : d / max, v: max }
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
  }
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function commit(hex: string, fromDrag = false): void {
  const value = hex.toLowerCase()
  if (!HEX.test(value)) {
    hexText.value = current.value
    return
  }
  if (!fromDrag) hsv.value = hexToHsv(value)
  hexText.value = value
  if (value === props.modelValue.toLowerCase()) return
  emit('update:modelValue', value)
  rememberColor(value)
}

function drag(event: PointerEvent, apply: (x: number, y: number) => void): void {
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  const rect = target.getBoundingClientRect()
  const update = (e: PointerEvent) => {
    apply(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)))
    hexText.value = current.value
  }
  const stop = () => {
    target.removeEventListener('pointermove', update)
    target.removeEventListener('pointerup', stop)
    target.removeEventListener('pointercancel', stop)
    target.removeEventListener('lostpointercapture', stop)
    commit(current.value, true)
  }
  panel.value?.focus()
  update(event)
  target.addEventListener('pointermove', update)
  target.addEventListener('pointerup', stop)
  target.addEventListener('pointercancel', stop)
  target.addEventListener('lostpointercapture', stop, { once: true })
}

function onSquare(event: PointerEvent): void {
  drag(event, (x, y) => (hsv.value = { ...hsv.value, s: x, v: 1 - y }))
}

function onHue(event: PointerEvent): void {
  drag(event, (x) => (hsv.value = { ...hsv.value, h: x * 359.9 }))
}

async function pickFromScreen(): Promise<void> {
  const picker = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper()
  try {
    commit((await picker.open()).sRGBHex)
  } catch (error) {
    if ((error as DOMException).name !== 'AbortError') console.warn('[mall editor] eyedropper failed', error)
  }
}

function place(): void {
  const rect = root.value!.getBoundingClientRect()
  const up = window.innerHeight - rect.bottom < PANEL_HEIGHT + 12 && rect.top > PANEL_HEIGHT + 12
  position.value = {
    top: up ? rect.top - PANEL_HEIGHT - 4 : rect.bottom + 4,
    left: Math.min(Math.max(8, rect.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - 8),
  }
}

function onOutside(event: PointerEvent): void {
  const target = event.target as Node
  if (!root.value?.contains(target) && !panel.value?.contains(target)) open.value = false
}

function onScroll(event: Event): void {
  if (!panel.value?.contains(event.target as Node)) open.value = false
}

function close(): void {
  open.value = false
}

watch(open, async (isOpen) => {
  if (!isOpen) {
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', close)
    return
  }
  original.value = props.modelValue
  hsv.value = hexToHsv(props.modelValue)
  hexText.value = props.modelValue
  place()
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', close)
  await nextTick()
  panel.value?.focus()
})

watch(
  () => props.modelValue,
  (value) => {
    if (!open.value) hexText.value = value
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <div ref="root" class="relative" @keydown.stop>
    <button
      type="button"
      class="flex h-7 w-full items-center gap-1.5 rounded-md border border-ink-600 bg-ink-950/80 px-1.5 text-xs font-bold text-fog hover:border-ink-500 disabled:opacity-40"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-label="`Colour ${modelValue}`"
      @click="open = !open"
    >
      <span class="h-4 w-6 shrink-0 rounded-sm border border-white/25" :style="{ background: modelValue }" />
      <span class="font-mono uppercase">{{ modelValue }}</span>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        tabindex="-1"
        role="dialog"
        aria-label="Colour picker"
        class="fixed z-[300] flex flex-col gap-2 rounded-lg border border-ink-500 bg-ink-900 p-2.5 shadow-2xl outline-none"
        :style="{ top: `${position.top}px`, left: `${position.left}px`, width: `${PANEL_WIDTH}px` }"
        @keydown.stop
        @keydown.esc="open = false"
      >
        <div
          class="relative h-36 cursor-crosshair touch-none rounded"
          :style="{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }"
          @pointerdown="onSquare"
        >
          <span
            class="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }"
          />
        </div>
        <div
          class="relative h-3 cursor-ew-resize touch-none rounded"
          style="background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
          @pointerdown="onHue"
        >
          <span class="pointer-events-none absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-black/30" :style="{ left: `${(hsv.h / 360) * 100}%` }" />
        </div>
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-14 overflow-hidden rounded border border-white/20" title="Old / new">
            <button type="button" class="flex-1" :style="{ background: original }" title="Back to the old colour" @click="commit(original)" />
            <span class="flex-1" :style="{ background: current }" />
          </div>
          <input
            v-model="hexText"
            class="h-7 min-w-0 flex-1 rounded border border-ink-600 bg-ink-950 px-1.5 font-mono text-xs font-bold uppercase text-fog outline-none focus:border-pool"
            maxlength="7"
            aria-label="Hex colour"
            @keydown.enter="commit(hexText)"
            @blur="commit(hexText)"
          />
          <button v-if="canPick" type="button" class="flex h-7 w-7 items-center justify-center rounded border border-ink-600 text-mist hover:text-fog" title="Pick a colour on screen" @click="pickFromScreen">
            <UiIcon name="search" :size="13" />
          </button>
        </div>
        <div v-if="recent.length" class="flex flex-wrap gap-1">
          <button
            v-for="color in recent"
            :key="color"
            type="button"
            class="h-5 w-5 rounded-sm border border-white/20"
            :style="{ background: color }"
            :title="color"
            @click="commit(color)"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>
