/**
 * Keyboard behaviour of a modal dialog: while `active`, focus moves into `el`, Tab / Shift+Tab stay inside it and
 * Escape calls `onEscape`; when it closes, focus goes back to the element that had it before (WAI-ARIA dialog pattern).
 */
import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogFocus(el: Ref<HTMLElement | null>, options: { active?: () => boolean; onEscape?: () => void } = {}) {
  let previous: HTMLElement | null = null
  let bound: HTMLElement | null = null

  function focusables(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((f) => f.offsetParent !== null || f === document.activeElement)
  }

  function onKeydown(e: KeyboardEvent) {
    if (!bound) return
    if (e.key === 'Escape' && options.onEscape) {
      e.stopPropagation()
      options.onEscape()
      return
    }
    if (e.key !== 'Tab') return
    const items = focusables(bound)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]!
    const last = items[items.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function open(root: HTMLElement) {
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    bound = root
    root.addEventListener('keydown', onKeydown)
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
    // first form field if any, else the dialog itself (its title is then read out)
    const field = root.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
    ;(field ?? root).focus()
  }

  function close() {
    bound?.removeEventListener('keydown', onKeydown)
    bound = null
    if (previous?.isConnected) previous.focus()
    previous = null
  }

  watch(
    () => (options.active ? options.active() : true) && el.value,
    async (root) => {
      if (bound) close()
      if (root) {
        await nextTick()
        open(root)
      }
    },
    { immediate: true, flush: 'post' },
  )
  onBeforeUnmount(close)
}
