<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  GAME_ACTION_LABELS,
  actionBindingLabel,
  chordFromKeyboardEvent,
  keyChordLabel,
  rebindAction,
  removeActionBinding,
  type BindingConflict,
} from '../../config/keybindings'
import {
  GAME_ACTIONS,
  applyGraphicsPreset,
  cloneGameSettings,
  createDefaultGameSettings,
  graphicsSettingsRequireReload,
  loadGameSettings,
  saveGameSettings,
  type GameAction,
  type GameSettings,
  type GameSettingsIssue,
  type KeyChord,
} from '../../game/gameSettings'

const props = defineProps<{
  open: boolean
  settings?: GameSettings
}>()

const emit = defineEmits<{
  close: []
  saved: [settings: GameSettings]
  applyReload: [settings: GameSettings]
}>()

interface CaptureTarget {
  action: GameAction
  bindingIndex: number
}

interface PendingConflict {
  target: CaptureTarget
  chord: KeyChord
  conflict: BindingConflict
}

const panelRef = ref<HTMLElement | null>(null)
const draft = ref<GameSettings>(createDefaultGameSettings())
const initialSettings = ref<GameSettings>(createDefaultGameSettings())
const issues = ref<GameSettingsIssue[]>([])
const captureTarget = ref<CaptureTarget | null>(null)
const pendingConflict = ref<PendingConflict | null>(null)
const captureMessage = ref('')
let previouslyFocused: HTMLElement | null = null

const reloadRequired = computed(() =>
  graphicsSettingsRequireReload(initialSettings.value.graphics, draft.value.graphics),
)

const hasStorageError = computed(() =>
  issues.value.some((issue) => issue.code === 'storage_error'),
)

function refreshDraft(): void {
  if (props.settings) {
    draft.value = cloneGameSettings(props.settings)
    issues.value = []
  } else {
    const result = loadGameSettings()
    draft.value = cloneGameSettings(result.settings)
    issues.value = result.issues
  }
  initialSettings.value = cloneGameSettings(draft.value)
  captureTarget.value = null
  pendingConflict.value = null
  captureMessage.value = ''
}

async function focusPanel(): Promise<void> {
  await nextTick()
  panelRef.value?.focus()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (document.pointerLockElement) {
        document.exitPointerLock()
      }
      refreshDraft()
      void focusPanel()
      return
    }
    captureTarget.value = null
    pendingConflict.value = null
    captureMessage.value = ''
    previouslyFocused?.focus()
    previouslyFocused = null
  },
)

function close(): void {
  emit('close')
}

function startCapture(action: GameAction, bindingIndex: number): void {
  pendingConflict.value = null
  captureMessage.value = 'Press a key. Escape cancels.'
  captureTarget.value = { action, bindingIndex }
}

function cancelCapture(): void {
  captureTarget.value = null
  pendingConflict.value = null
  captureMessage.value = ''
}

function applyCapturedChord(target: CaptureTarget, chord: KeyChord): void {
  const result = rebindAction(
    draft.value.controls,
    target.action,
    target.bindingIndex,
    chord,
    'reject',
  )
  if (!result.applied && result.conflict) {
    pendingConflict.value = { target, chord, conflict: result.conflict }
    captureMessage.value = `${keyChordLabel(chord)} is already assigned to ${GAME_ACTION_LABELS[result.conflict.action]}.`
    captureTarget.value = null
    return
  }
  draft.value = { ...draft.value, controls: result.controls }
  captureTarget.value = null
  captureMessage.value = `${GAME_ACTION_LABELS[target.action]} set to ${keyChordLabel(chord)}.`
}

function swapPendingConflict(): void {
  const pending = pendingConflict.value
  if (!pending) return
  const result = rebindAction(
    draft.value.controls,
    pending.target.action,
    pending.target.bindingIndex,
    pending.chord,
    'swap',
  )
  if (result.applied) {
    draft.value = { ...draft.value, controls: result.controls }
    captureMessage.value = `Bindings swapped with ${GAME_ACTION_LABELS[pending.conflict.action]}.`
  } else {
    captureMessage.value = 'Those bindings could not be swapped.'
  }
  pendingConflict.value = null
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (captureTarget.value) {
    event.preventDefault()
    event.stopPropagation()
    if (event.code === 'Escape') {
      cancelCapture()
      return
    }
    const chord = chordFromKeyboardEvent(event)
    if (!chord) {
      captureMessage.value = 'That key is reserved. Choose a non-modifier key.'
      return
    }
    applyCapturedChord(captureTarget.value, chord)
    return
  }
  if (event.code === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
}

function trapFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || !panelRef.value) return
  const focusable = Array.from(
    panelRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
  if (focusable.length === 0) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function removeBinding(action: GameAction, bindingIndex: number): void {
  draft.value = {
    ...draft.value,
    controls: removeActionBinding(draft.value.controls, action, bindingIndex),
  }
}

function onPresetChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value !== 'low' && value !== 'medium' && value !== 'high') return
  draft.value = {
    ...draft.value,
    graphics: applyGraphicsPreset(draft.value.graphics, value),
  }
}

function resetDefaults(): void {
  draft.value = createDefaultGameSettings()
  pendingConflict.value = null
  captureTarget.value = null
  captureMessage.value = 'Defaults restored in this form. Save to keep them.'
}

function persistDraft(): GameSettings | null {
  const result = saveGameSettings(draft.value)
  issues.value = result.issues
  draft.value = cloneGameSettings(result.settings)
  if (result.issues.some((issue) => issue.code === 'storage_error')) return null
  initialSettings.value = cloneGameSettings(result.settings)
  return result.settings
}

function save(): void {
  const settings = persistDraft()
  if (!settings) return
  emit('saved', cloneGameSettings(settings))
  close()
}

function applyAndReload(): void {
  const settings = persistDraft()
  if (!settings) return
  emit('applyReload', cloneGameSettings(settings))
  window.location.reload()
}

function isCapturing(action: GameAction, bindingIndex: number): boolean {
  return (
    captureTarget.value?.action === action &&
    captureTarget.value.bindingIndex === bindingIndex
  )
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown, true)
  if (props.open) {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    refreshDraft()
    void focusPanel()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeydown, true)
  previouslyFocused?.focus()
  previouslyFocused = null
})
</script>

<template>
  <div
    v-if="open"
    class="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
    @mousedown.self="close"
  >
    <section
      ref="panelRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-settings-title"
      aria-describedby="game-settings-description"
      tabindex="-1"
      class="max-h-[min(92vh,60rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 text-white shadow-2xl outline-none"
      @keydown.stop="trapFocus"
      @mousedown.stop
    >
      <header class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-900/95 px-4 py-4 backdrop-blur sm:px-6">
        <div>
          <p class="m-0 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Game options</p>
          <h2 id="game-settings-title" class="m-0 mt-1 text-2xl font-black">Settings</h2>
          <p id="game-settings-description" class="m-0 mt-1 text-sm text-white/60">
            Controls and camera settings save immediately; renderer initialization changes can reload the game.
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/80 hover:border-white/40 hover:text-white"
          aria-label="Close game settings"
          @click="close"
        >
          Close
        </button>
      </header>

      <div class="space-y-8 px-4 py-5 sm:px-6">
        <div
          v-if="issues.length > 0"
          class="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100"
          role="status"
        >
          <p class="m-0 font-bold">Some stored settings needed recovery.</p>
          <ul class="mb-0 mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
            <li v-for="issue in issues" :key="`${issue.path}-${issue.code}`">
              {{ issue.path }}: {{ issue.message }}
            </li>
          </ul>
        </div>

        <section aria-labelledby="controls-heading">
          <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="controls-heading" class="m-0 text-lg font-bold">Controls</h3>
              <p class="m-0 mt-1 text-sm text-white/55">Select a binding, then press its replacement key.</p>
            </div>
            <p class="m-0 text-xs text-white/45">
              {{ actionBindingLabel('moveForward', draft.controls) }} forward
            </p>
          </div>

          <div class="divide-y divide-white/10 rounded-xl border border-white/10">
            <div
              v-for="action in GAME_ACTIONS"
              :key="action"
              class="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:items-center"
            >
              <span class="text-sm font-semibold text-white/85">{{ GAME_ACTION_LABELS[action] }}</span>
              <div class="flex flex-wrap items-center gap-2">
                <div
                  v-for="(binding, index) in draft.controls.bindings[action]"
                  :key="`${action}-${index}-${binding.code}-${String(binding.shift)}`"
                  class="inline-flex items-center"
                >
                  <button
                    type="button"
                    class="rounded-l-lg border border-cyan-300/25 bg-white/5 px-3 py-2 font-mono text-xs text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-300/10"
                    :class="{ 'animate-pulse border-cyan-300 bg-cyan-300/15': isCapturing(action, index) }"
                    :aria-label="`Remap ${GAME_ACTION_LABELS[action]} from ${keyChordLabel(binding)}`"
                    @click="startCapture(action, index)"
                  >
                    {{ isCapturing(action, index) ? 'Press key…' : keyChordLabel(binding) }}
                  </button>
                  <button
                    v-if="draft.controls.bindings[action].length > 1"
                    type="button"
                    class="rounded-r-lg border border-l-0 border-white/15 px-2 py-2 text-xs text-white/50 hover:bg-rose-500/15 hover:text-rose-200"
                    :aria-label="`Remove ${keyChordLabel(binding)} from ${GAME_ACTION_LABELS[action]}`"
                    @click="removeBinding(action, index)"
                  >
                    ×
                  </button>
                </div>
                <button
                  v-if="draft.controls.bindings[action].length < 2"
                  type="button"
                  class="rounded-lg border border-dashed border-white/20 px-3 py-2 text-xs text-white/55 hover:border-white/40 hover:text-white"
                  :aria-label="`Add another binding for ${GAME_ACTION_LABELS[action]}`"
                  @click="startCapture(action, draft.controls.bindings[action].length)"
                >
                  + Add key
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="captureMessage"
            class="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/75"
            aria-live="polite"
          >
            <p class="m-0">{{ captureMessage }}</p>
            <div v-if="pendingConflict" class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                @click="swapPendingConflict"
              >
                Swap bindings
              </button>
              <button
                type="button"
                class="rounded-lg border border-white/20 px-3 py-2 text-xs text-white/75 hover:bg-white/10"
                @click="cancelCapture"
              >
                Keep current bindings
              </button>
            </div>
          </div>
        </section>

        <section class="grid gap-5 md:grid-cols-2" aria-labelledby="camera-heading">
          <div>
            <h3 id="camera-heading" class="m-0 text-lg font-bold">Camera</h3>
            <label for="mouse-sensitivity" class="mt-4 flex items-center justify-between gap-3 text-sm">
              <span>Mouse sensitivity</span>
              <output class="font-mono text-cyan-200">{{ draft.controls.mouseSensitivity.toFixed(1) }}×</output>
            </label>
            <input
              id="mouse-sensitivity"
              v-model.number="draft.controls.mouseSensitivity"
              class="mt-2 w-full accent-cyan-400"
              type="range"
              min="0.1"
              max="3"
              step="0.1"
            />
            <label class="mt-4 flex items-center gap-3 text-sm">
              <input v-model="draft.controls.invertY" class="h-4 w-4 accent-cyan-400" type="checkbox" />
              Invert vertical look
            </label>
          </div>
          <div class="md:pt-9">
            <label for="camera-fov" class="flex items-center justify-between gap-3 text-sm">
              <span>Field of view</span>
              <output class="font-mono text-cyan-200">{{ draft.controls.fov }}°</output>
            </label>
            <input
              id="camera-fov"
              v-model.number="draft.controls.fov"
              class="mt-2 w-full accent-cyan-400"
              type="range"
              min="60"
              max="100"
              step="1"
            />
          </div>
        </section>

        <section aria-labelledby="graphics-heading">
          <h3 id="graphics-heading" class="m-0 text-lg font-bold">Graphics</h3>
          <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label class="text-sm">
              <span class="mb-1.5 block text-white/65">Preset</span>
              <select
                :value="draft.graphics.preset"
                class="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2.5 text-white"
                @change="onPresetChange"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label class="text-sm">
              <span class="mb-1.5 block text-white/65">Shadows</span>
              <select v-model="draft.graphics.shadows" class="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2.5 text-white">
                <option value="off">Off</option>
                <option value="hard">Hard</option>
                <option value="soft">Soft</option>
              </select>
            </label>
            <label class="text-sm">
              <span class="mb-1.5 block text-white/65">Frame-rate cap</span>
              <select v-model.number="draft.graphics.fpsCap" class="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2.5 text-white">
                <option :value="30">30 FPS</option>
                <option :value="60">60 FPS</option>
                <option :value="120">120 FPS</option>
                <option :value="0">Unlimited</option>
              </select>
            </label>
            <label class="text-sm">
              <span class="mb-1.5 block text-white/65">Particles</span>
              <select v-model="draft.graphics.particles" class="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2.5 text-white">
                <option value="off">Off</option>
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </label>
            <label class="text-sm">
              <span class="mb-1.5 block text-white/65">Postprocessing</span>
              <select v-model="draft.graphics.postprocessing" class="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2.5 text-white">
                <option value="off">Off</option>
                <option value="bloom">Bloom</option>
              </select>
            </label>
            <label class="flex items-center gap-3 self-end rounded-lg border border-white/10 px-3 py-2.5 text-sm">
              <input v-model="draft.graphics.antialias" class="h-4 w-4 accent-cyan-400" type="checkbox" />
              Antialiasing
            </label>
          </div>

          <div class="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label for="resolution-scale" class="flex items-center justify-between gap-3 text-sm">
                <span>Resolution scale</span>
                <output class="font-mono text-cyan-200">{{ Math.round(draft.graphics.resolutionScale * 100) }}%</output>
              </label>
              <input
                id="resolution-scale"
                v-model.number="draft.graphics.resolutionScale"
                class="mt-2 w-full accent-cyan-400"
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
              />
            </div>
            <label class="text-sm">
              <span class="mb-1.5 block text-white/65">Maximum device pixel ratio</span>
              <select v-model.number="draft.graphics.maxDevicePixelRatio" class="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2.5 text-white">
                <option :value="1">1×</option>
                <option :value="1.25">1.25×</option>
                <option :value="1.5">1.5×</option>
                <option :value="2">2×</option>
              </select>
            </label>
          </div>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label class="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-sm">
              <input v-model="draft.graphics.environmentMap" class="h-4 w-4 accent-cyan-400" type="checkbox" />
              HDR environment lighting
            </label>
            <label class="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-sm">
              <input v-model="draft.graphics.showFps" class="h-4 w-4 accent-cyan-400" type="checkbox" />
              Show FPS
            </label>
          </div>
        </section>
      </div>

      <footer class="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-slate-900/95 px-4 py-4 backdrop-blur sm:px-6">
        <button
          type="button"
          class="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/65 hover:border-white/30 hover:text-white"
          @click="resetDefaults"
        >
          Reset defaults
        </button>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <span v-if="reloadRequired" class="text-xs text-amber-200">Renderer reload required</span>
          <button
            type="button"
            class="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            :disabled="hasStorageError"
            @click="save"
          >
            Save
          </button>
          <button
            type="button"
            class="rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="hasStorageError"
            @click="applyAndReload"
          >
            Apply &amp; reload
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
