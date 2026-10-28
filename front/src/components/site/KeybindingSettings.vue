<script setup lang="ts">
/**
 * Rebind the game controls: click a key, press the new one (Esc cancels, Delete / Backspace removes it).
 * Used on the Settings page and in the game's pause screen. Bindings live in config/keybindings.ts.
 */
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  KEYS_PER_ACTION,
  RESERVED_KEYS,
  bindings,
  clearBinding,
  keyLabel,
  resetBindings,
  setBinding,
  type BindableAction,
} from '../../config/keybindings'
import UiIcon from '../ui/UiIcon.vue'

const { t } = useI18n()

const GROUPS: Array<{ id: 'move' | 'actions' | 'hotbar'; actions: BindableAction[] }> = [
  { id: 'move', actions: ['moveForward', 'moveBack', 'moveLeft', 'moveRight'] },
  { id: 'actions', actions: ['interact', 'inventory', 'survivalWatch', 'cook', 'houseKeys', 'buyHouse', 'rotate', 'putAway'] },
  { id: 'hotbar', actions: ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7', 'hotbar8', 'hotbar9'] },
]

const listening = ref<{ action: BindableAction; slot: number } | null>(null)
const notice = ref('')

function actionName(action: BindableAction): string {
  return action.startsWith('hotbar') ? t('settings.actions.hotbar', { n: action.slice(6) }) : t(`settings.actions.${action}`)
}

function slotsOf(action: BindableAction): number {
  // the empty slot after the last key lets the player add one, up to KEYS_PER_ACTION
  return Math.min(bindings[action].length + 1, KEYS_PER_ACTION)
}

function listen(action: BindableAction, slot: number) {
  notice.value = ''
  listening.value = { action, slot }
  window.addEventListener('keydown', onCapture, true)
}

function stop() {
  listening.value = null
  window.removeEventListener('keydown', onCapture, true)
}

// capture phase on window: runs before the game's own keydown handlers, which never see this key
function onCapture(e: KeyboardEvent) {
  const target = listening.value
  if (!target) return
  e.preventDefault()
  e.stopImmediatePropagation()
  if (e.code === 'Escape') return stop()
  if (e.code === 'Delete' || e.code === 'Backspace') {
    clearBinding(target.action, target.slot)
    return stop()
  }
  if (RESERVED_KEYS.includes(e.code)) {
    notice.value = t('settings.reserved')
    return
  }
  const movedFrom = setBinding(target.action, target.slot, e.code)
  notice.value = movedFrom ? t('settings.moved', { key: keyLabel(e.code), action: actionName(movedFrom) }) : ''
  stop()
}

function reset() {
  stop()
  resetBindings()
  notice.value = t('settings.resetDone')
}

onBeforeUnmount(stop)
</script>

<template>
  <div>
    <p class="m-0 text-sm font-semibold text-mist">{{ t('settings.controlsIntro') }}</p>

    <section v-for="group in GROUPS" :key="group.id" class="mt-5" :aria-labelledby="`keys-${group.id}`">
      <h3 :id="`keys-${group.id}`" class="m-0 mb-2 text-sm font-extrabold text-fog">{{ t(`settings.groups.${group.id}`) }}</h3>
      <ul class="m-0 grid list-none gap-1.5 p-0" :class="group.id === 'hotbar' ? 'sm:grid-cols-3' : ''">
        <li
          v-for="action in group.actions"
          :key="action"
          class="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5"
        >
          <span class="min-w-0 text-sm font-bold text-mist">{{ actionName(action) }}</span>
          <span class="flex shrink-0 gap-1.5">
            <button
              v-for="slot in slotsOf(action)"
              :key="slot"
              type="button"
              class="cc-keybind"
              :class="{
                'cc-keybind-listening': listening?.action === action && listening.slot === slot - 1,
                'cc-keybind-empty': !bindings[action][slot - 1],
              }"
              :aria-label="
                bindings[action][slot - 1]
                  ? t('settings.changeKey', { action: actionName(action), key: keyLabel(bindings[action][slot - 1]!) })
                  : t('settings.addKey', { action: actionName(action) })
              "
              @click="listen(action, slot - 1)"
            >
              <template v-if="listening?.action === action && listening.slot === slot - 1">{{ t('settings.press') }}</template>
              <template v-else-if="bindings[action][slot - 1]">{{ keyLabel(bindings[action][slot - 1]!) }}</template>
              <UiIcon v-else name="plus" :size="14" />
            </button>
          </span>
        </li>
      </ul>
    </section>

    <p class="m-0 mt-4 min-h-5 text-xs font-bold" :class="listening ? 'text-pool' : 'text-sun'" aria-live="polite">
      {{ listening ? t('settings.pressHint') : notice }}
    </p>

    <p class="m-0 mt-2 text-xs font-semibold text-mist">{{ t('settings.fixedControls') }}</p>

    <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm mt-4" @click="reset">
      <UiIcon name="refresh" :size="16" /> {{ t('settings.reset') }}
    </button>
  </div>
</template>
