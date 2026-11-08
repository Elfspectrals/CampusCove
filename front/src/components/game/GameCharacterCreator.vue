<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as THREE from 'three'
import { saveCharacterAppearance } from '../../api/characterAppearance'
import { DEFAULT_SLOT_COLORS, fetchCharacterCosmetics, type CharacterCosmeticsState, type CosmeticColors } from '../../api/characterCosmetics'
import {
  BUILDS,
  FACE_COUNT,
  HAIR_COLORS,
  HAIRCUTS,
  SEXES,
  SKIN_TONES,
  hairUrl,
  randomChoice,
  type CreatorChoice,
} from '../../avatar/characterLook'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { updateAvatarAnimation } from '../../avatar/glbCharacter'
import { createModularCharacter } from '../../avatar/modularCharacter'
import { wearSignature, type WearModels } from '../../avatar/modularCharacterLogic'

/**
 * Character creator (first time in the game, before spawning) and editor (the character key). Free; Laravel checks
 * every field (docs/CHARACTER.md). The preview wears `outfit` with the chosen haircut: the newcomer outfit when
 * creating, what the player wears when editing.
 */
const props = defineProps<{
  mode: 'create' | 'edit'
  initial: CreatorChoice | null
  outfit: WearModels
  colors: CosmeticColors
  keyLabel: string
}>()

const emit = defineEmits<{
  saved: [state: CharacterCosmeticsState]
  close: []
}>()

const { t } = useI18n()

const choice = reactive<CreatorChoice>(
  props.initial
    ? { ...props.initial }
    : { sex: 'm', face: 1, build: 'normal', hair: 'basic', skinColor: SKIN_TONES[2], hairColor: HAIR_COLORS[1] },
)
const saving = ref(false)
/** Until the player picks a haircut, switching body picks the usual one for it (long for a woman). */
let hairPicked = props.initial !== null

function pickSex(sex: CreatorChoice['sex']): void {
  choice.sex = sex
  if (!hairPicked) choice.hair = sex === 'f' ? 'long' : 'basic'
}

function pickHair(hair: CreatorChoice['hair']): void {
  hairPicked = true
  choice.hair = hair
}
const error = ref<string | null>(null)
const faces = Array.from({ length: FACE_COUNT }, (_, i) => i + 1)

const previewModels = computed<WearModels>(() => ({ ...props.outfit, hair: hairUrl(choice.hair), head_accessory: null }))
const previewColors = computed<CosmeticColors>(() => ({ ...props.colors, body: choice.skinColor, hair: choice.hairColor }))
const previewLook = computed(() => ({ sex: choice.sex, face: choice.face, build: choice.build }))

function surprise(): void {
  Object.assign(choice, randomChoice())
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = null
  try {
    await saveCharacterAppearance({ ...choice })
    emit('saved', await fetchCharacterCosmetics())
  } catch {
    error.value = t('character.error')
  } finally {
    saving.value = false
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.code === 'Escape' && props.mode === 'edit') {
    e.preventDefault()
    emit('close')
  }
}

// ---------------------------------------------------------------- 3D preview (plain Three.js, kept out of reactivity)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let character: THREE.Group | null = null
let shown = ''
let frame = 0
let lastTime = 0
let yaw = 0.35
let dragX: number | null = null
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20)
camera.position.set(0, 1.1, 4.6)
camera.lookAt(0, 0.95, 0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2))
const sun = new THREE.DirectionalLight(0xffffff, 2.0)
sun.position.set(2, 3, 4)
scene.add(sun)

async function rebuild(): Promise<void> {
  const models = previewModels.value
  const colors = previewColors.value
  const look = previewLook.value
  const signature = wearSignature(models, colors, look)
  if (signature === shown) return
  shown = signature
  const next = await createModularCharacter(models, colors, DEFAULT_SLOT_COLORS, look)
  if (signature !== shown) {
    disposeObject3D(next)
    return
  }
  if (character) {
    scene.remove(character)
    disposeObject3D(character)
  }
  character = next
  scene.add(character)
}

function resize(): void {
  const canvas = canvasRef.value
  if (!canvas || !renderer) return
  const { clientWidth: w, clientHeight: h } = canvas
  if (w === 0 || h === 0) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function loop(time: number): void {
  frame = requestAnimationFrame(loop)
  const dt = lastTime ? Math.min(0.1, (time - lastTime) / 1000) : 0
  lastTime = time
  if (character) {
    character.rotation.y = yaw
    updateAvatarAnimation(character, dt, 0)
  }
  renderer?.render(scene, camera)
}

function onPointerDown(e: PointerEvent): void {
  dragX = e.clientX
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent): void {
  if (dragX === null) return
  yaw += (e.clientX - dragX) * 0.012
  dragX = e.clientX
}
function onPointerUp(): void {
  dragX = null
}

let stopWatch: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!canvasRef.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasRef.value)
  resize()
  frame = requestAnimationFrame(loop)
  // every choice rebuilds the preview; templates are cached, so only the first load of a file waits
  stopWatch = watch(
    () => wearSignature(previewModels.value, previewColors.value, previewLook.value),
    () => void rebuild().catch(() => {
      shown = ''
    }),
    { immediate: true },
  )
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
  stopWatch?.()
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  if (character) disposeObject3D(character)
  renderer?.dispose()
})
</script>

<template>
  <div class="absolute inset-0 z-[60] flex items-center justify-center bg-ink-950/80 p-3 sm:p-6">
    <section
      class="cc-hud grid h-full max-h-[760px] w-full max-w-[980px] animate-cc-pop grid-rows-[minmax(220px,42%)_1fr] overflow-hidden p-0 md:grid-cols-[1fr_380px] md:grid-rows-1"
      :aria-label="mode === 'create' ? t('character.createTitle') : t('character.editTitle')"
    >
      <div class="relative min-h-0 bg-gradient-to-b from-ink-800/60 to-ink-950/60">
        <canvas
          ref="canvasRef"
          class="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          :aria-label="t('character.preview')"
          role="img"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        />
      </div>

      <div class="flex min-h-0 flex-col">
        <header class="bg-sun px-4 py-2 text-ink-950">
          <h2 class="m-0 font-display text-sm uppercase tracking-[0.18em]">
            {{ mode === 'create' ? t('character.createTitle') : t('character.editTitle') }}
          </h2>
        </header>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <p v-if="mode === 'create'" class="m-0 text-sm text-mist">{{ t('character.createIntro', { key: keyLabel }) }}</p>

          <fieldset class="m-0 border-0 p-0">
            <legend class="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-fog">{{ t('character.sex') }}</legend>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="s in SEXES"
                :key="s"
                type="button"
                class="cc-btn cc-btn-sm min-h-11"
                :class="choice.sex === s ? 'cc-btn-sun' : 'cc-btn-ghost'"
                :aria-pressed="choice.sex === s"
                @click="pickSex(s)"
              >
                {{ t(`character.sexes.${s}`) }}
              </button>
            </div>
          </fieldset>

          <fieldset class="m-0 border-0 p-0">
            <legend class="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-fog">{{ t('character.face') }}</legend>
            <div class="grid grid-cols-6 gap-2">
              <button
                v-for="n in faces"
                :key="n"
                type="button"
                class="cc-btn cc-btn-sm min-h-11 px-0"
                :class="choice.face === n ? 'cc-btn-sun' : 'cc-btn-ghost'"
                :aria-pressed="choice.face === n"
                :aria-label="t('character.faceN', { n })"
                @click="choice.face = n"
              >
                {{ n }}
              </button>
            </div>
          </fieldset>

          <fieldset class="m-0 border-0 p-0">
            <legend class="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-fog">{{ t('character.build') }}</legend>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="b in BUILDS"
                :key="b"
                type="button"
                class="cc-btn cc-btn-sm min-h-11"
                :class="choice.build === b ? 'cc-btn-sun' : 'cc-btn-ghost'"
                :aria-pressed="choice.build === b"
                @click="choice.build = b"
              >
                {{ t(`character.builds.${b}`) }}
              </button>
            </div>
          </fieldset>

          <fieldset class="m-0 border-0 p-0">
            <legend class="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-fog">{{ t('character.skin') }}</legend>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="(hex, i) in SKIN_TONES"
                :key="hex"
                type="button"
                class="h-11 w-11 rounded-full border-2 transition-transform"
                :class="choice.skinColor === hex ? 'scale-110 border-sun' : 'border-ink-500/70'"
                :style="{ background: hex }"
                :aria-pressed="choice.skinColor === hex"
                :aria-label="t('character.colorN', { n: i + 1 })"
                @click="choice.skinColor = hex"
              />
            </div>
          </fieldset>

          <fieldset class="m-0 border-0 p-0">
            <legend class="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-fog">{{ t('character.hair') }}</legend>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                v-for="h in HAIRCUTS"
                :key="h"
                type="button"
                class="cc-btn cc-btn-sm min-h-11"
                :class="choice.hair === h ? 'cc-btn-sun' : 'cc-btn-ghost'"
                :aria-pressed="choice.hair === h"
                @click="pickHair(h)"
              >
                {{ t(`character.haircuts.${h}`) }}
              </button>
            </div>
          </fieldset>

          <div>
            <label for="cc-hair-color" class="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-fog">{{ t('character.hairColor') }}</label>
            <div class="flex items-center gap-3">
              <input
                id="cc-hair-color"
                v-model="choice.hairColor"
                type="color"
                class="h-11 w-16 cursor-pointer rounded-xl border-2 border-ink-500/70 bg-transparent p-1"
              />            </div>
          </div>

          <p v-if="mode === 'create'" class="m-0 text-xs text-mist">{{ t('character.newcomerNote') }}</p>
        </div>

        <footer class="space-y-2 border-t border-ink-500/40 px-4 py-3">
          <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert">{{ error }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm min-h-11" :disabled="saving" @click="surprise">
              {{ t('character.random') }}
            </button>
            <button v-if="mode === 'edit'" type="button" class="cc-btn cc-btn-ghost cc-btn-sm min-h-11" :disabled="saving" @click="emit('close')">
              {{ t('character.cancel') }}
            </button>
            <button type="button" class="cc-btn cc-btn-sun cc-btn-sm ml-auto min-h-11" :disabled="saving" @click="save">
              {{ saving ? t('character.saving') : mode === 'create' ? t('character.enter') : t('character.save') }}
            </button>
          </div>
        </footer>
      </div>
    </section>
  </div>
</template>
