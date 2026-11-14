import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import * as THREE from 'three'
import { fetchClimbingBoard, type ClimbingBoard } from '../../api/climbingBoard'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import { boardRows, type ClimbingSpec } from '../../game/sports/climbing'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const ZONE_FILE = '/assets/zones/sports_climbing.json'
const ATTENDANT_ID = 'climbing_shoe_attendant'
const REACH = 3
const PROMPT_HEIGHT = 2.2

type Vec3 = [number, number, number]

export interface ClimbingBoardDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  spec: ShallowRef<ClimbingSpec | null>
  promptsHidden: () => boolean
  prompt: () => { action: string; detail?: string }
}

async function attendantPosition(): Promise<Vec3> {
  const response = await fetch(ZONE_FILE)
  if (!response.ok) throw new Error(`${ZONE_FILE}: HTTP ${response.status}`)
  const zone = (await response.json()) as { props?: { id?: string; position?: unknown }[] }
  const position = zone.props?.find((p) => p.id === ATTENDANT_ID)?.position
  if (!Array.isArray(position) || position.length !== 3 || !position.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error(`${ZONE_FILE}: no ${ATTENDANT_ID} position`)
  }
  return position as Vec3
}

export function useClimbingBoard(deps: ClimbingBoardDeps) {
  const open = ref(false)
  const board = shallowRef<ClimbingBoard | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let attendant: Vec3 | null = null
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  const rows = computed(() => (board.value && deps.spec.value ? boardRows(deps.spec.value, board.value) : []))

  function onTownLoaded(): void {
    if (attendant) return
    attendantPosition().then(
      (position) => {
        attendant = position
      },
      (err: unknown) => console.error('[climbing] board attendant not found', err),
    )
  }

  function aimed(): boolean {
    const camera = deps.getCamera()
    if (!camera || !attendant) return false
    camera.getWorldDirection(forward)
    return isAimingAtNpc(deps.myPosition, forward, attendant, REACH)
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || open.value || !aimed() || !attendant) return null
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(attendant[0], attendant[1] + PROMPT_HEIGHT, attendant[2]).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, ...deps.prompt() }
  }

  function interact(): boolean {
    if (open.value || !aimed()) return false
    if (document.pointerLockElement) document.exitPointerLock()
    open.value = true
    loading.value = true
    error.value = null
    fetchClimbingBoard().then(
      (loaded) => {
        board.value = loaded
        loading.value = false
      },
      (err: unknown) => {
        error.value = err instanceof Error ? err.message : String(err)
        loading.value = false
      },
    )
    return true
  }

  function close(): void {
    open.value = false
  }

  return {
    open,
    week: computed(() => board.value?.week ?? null),
    rows,
    loading,
    error,
    onTownLoaded,
    close,
    source: { prompt, interact } as InteractionSource,
  }
}
