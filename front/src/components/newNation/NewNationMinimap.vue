<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { MinimapState } from '../../game/newNation/showroomLayout'

/**
 * Top-down map of New Nation: plaza, the four model apartments and the player.
 * Clicking an apartment visits it; clicking the plaza goes back to the plaza entrance.
 */
const props = defineProps<{
  getState: () => MinimapState | null
}>()

const emit = defineEmits<{
  visit: [id: string]
  plaza: []
}>()

const SIZE = 176
/** World metres shown from the centre to the canvas edge. */
const WORLD_HALF = 52
const canvasRef = ref<HTMLCanvasElement | null>(null)
const hoveredId = ref<string | null>(null)
let timer: number | undefined
let lastState: MinimapState | null = null

function toCanvas(x: number, z: number): [number, number] {
  const k = SIZE / 2 / WORLD_HALF
  return [SIZE / 2 + x * k, SIZE / 2 + z * k]
}

function draw() {
  const canvas = canvasRef.value
  const state = props.getState()
  if (!canvas || !state) return
  lastState = state
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  if (canvas.width !== SIZE * dpr) {
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, SIZE, SIZE)
  const k = SIZE / 2 / WORLD_HALF
  const [cx, cy] = toCanvas(0, 0)

  // park + plaza
  ctx.fillStyle = '#3f7a3a'
  ctx.beginPath()
  ctx.arc(cx, cy, (state.parkRadius + 14) * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(214,206,190,0.9)'
  ctx.lineWidth = 1.8 * k
  ctx.beginPath()
  ctx.arc(cx, cy, (state.parkRadius - 1.4) * k, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#c9c4bb'
  ctx.beginPath()
  ctx.arc(cx, cy, state.plazaRadius * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5fb7d9'
  ctx.beginPath()
  ctx.arc(cx, cy, 3.4 * k, 0, Math.PI * 2)
  ctx.fill()

  // apartments
  for (const apt of state.apartments) {
    const current = apt.id === state.currentApartmentId
    const hovered = apt.id === hoveredId.value
    ctx.beginPath()
    apt.corners.forEach(([x, z], i) => {
      const [px, py] = toCanvas(x, z)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.fillStyle = current ? '#ffca3a' : hovered ? '#40d6f5' : '#e8e4dc'
    ctx.fill()
    ctx.strokeStyle = '#080a20'
    ctx.lineWidth = 1
    ctx.stroke()
    // walkway from plaza edge to the door
    const [dx, dy] = toCanvas(apt.door[0], apt.door[1])
    ctx.strokeStyle = 'rgba(214,206,190,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx + ((dx - cx) * 20) / 30.5, cy + ((dy - cy) * 20) / 30.5)
    ctx.lineTo(dx, dy)
    ctx.stroke()
  }

  // player arrow
  const [px, py] = toCanvas(state.player.x, state.player.z)
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(-state.player.yaw)
  ctx.fillStyle = '#ff5c7a'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, -7)
  ctx.lineTo(5, 5)
  ctx.lineTo(0, 2.5)
  ctx.lineTo(-5, 5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function hitTest(e: MouseEvent): { kind: 'apartment'; id: string } | { kind: 'plaza' } | null {
  const canvas = canvasRef.value
  if (!canvas || !lastState) return null
  const rect = canvas.getBoundingClientRect()
  const k = SIZE / 2 / WORLD_HALF
  const wx = ((e.clientX - rect.left) * (SIZE / rect.width) - SIZE / 2) / k
  const wz = ((e.clientY - rect.top) * (SIZE / rect.height) - SIZE / 2) / k
  for (const apt of lastState.apartments) {
    const xs = apt.corners.map((c) => c[0])
    const zs = apt.corners.map((c) => c[1])
    // Footprints are axis-aligned (N/E/S/W), with a little slack for small screens.
    if (wx >= Math.min(...xs) - 3 && wx <= Math.max(...xs) + 3 && wz >= Math.min(...zs) - 3 && wz <= Math.max(...zs) + 3) {
      return { kind: 'apartment', id: apt.id }
    }
  }
  if (Math.hypot(wx, wz) <= lastState.plazaRadius) return { kind: 'plaza' }
  return null
}

function onClick(e: MouseEvent) {
  const hit = hitTest(e)
  if (!hit) return
  if (hit.kind === 'apartment') emit('visit', hit.id)
  else emit('plaza')
}

function onMove(e: MouseEvent) {
  const hit = hitTest(e)
  hoveredId.value = hit?.kind === 'apartment' ? hit.id : null
  if (canvasRef.value) canvasRef.value.style.cursor = hit ? 'pointer' : 'default'
}

onMounted(() => {
  draw()
  // A timer (not rAF) keeps the map fresh even while the 3D view is paused.
  timer = window.setInterval(draw, 80)
})

onUnmounted(() => {
  window.clearInterval(timer)
})

const hoveredName = () => lastState?.apartments.find((a) => a.id === hoveredId.value)?.name ?? null
</script>

<template>
  <div class="cc-hud p-2">
    <div class="mb-1 flex items-center justify-between px-1">
      <span class="cc-eyebrow text-[10px] text-pool">Map</span>
      <span class="text-[10px] font-bold text-mist">{{ hoveredName() ?? 'Click a home to visit' }}</span>
    </div>
    <canvas
      ref="canvasRef"
      :style="{ width: `${SIZE}px`, height: `${SIZE}px` }"
      class="block rounded-lg border-2 border-ink-950"
      role="img"
      aria-label="Map of New Nation with the model apartments"
      @click="onClick"
      @mousemove="onMove"
      @mouseleave="hoveredId = null"
    />
  </div>
</template>
