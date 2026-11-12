import { useLayoutEffect, useRef } from 'react'

const dialogs: HTMLElement[] = []

/** Neutralise les branches derrière le dialogue, y compris les raccourcis globaux. */
export function useModal(selector: string, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    const dialog = document.querySelector<HTMLElement>(selector)
    if (!dialog) return
    dialogs.push(dialog)
    const isTop = () => dialogs.at(-1) === dialog
    const previous = document.activeElement as HTMLElement | null
    dialog.setAttribute('aria-modal', 'true')
    dialog.tabIndex = -1
    const disabled: [HTMLElement, boolean][] = []
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          disabled.push([sibling, sibling.inert])
          sibling.inert = true
        }
      }
      branch = branch.parentElement
    }
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]'))
      .filter((el) => !el.matches(':disabled') && el.getClientRects().length > 0)
    ;(items()[0] ?? dialog).focus()
    const key = (e: KeyboardEvent) => {
      if (!isTop()) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close.current(); return }
      if (e.key !== 'Tab') return
      e.stopImmediatePropagation()
      const list = items()
      const index = list.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      ;(list[(index + (e.shiftKey ? -1 : 1) + list.length) % list.length] ?? dialog).focus()
    }
    const focus = (e: FocusEvent) => {
      if (isTop() && !dialog.contains(e.target as Node)) (items()[0] ?? dialog).focus()
    }
    const containKey = (e: KeyboardEvent) => e.stopPropagation()
    document.addEventListener('keydown', containKey)
    window.addEventListener('keydown', key, true)
    document.addEventListener('focusin', focus)
    return () => {
      document.removeEventListener('keydown', containKey)
      window.removeEventListener('keydown', key, true)
      document.removeEventListener('focusin', focus)
      dialogs.splice(dialogs.indexOf(dialog), 1)
      disabled.forEach(([el, inert]) => { el.inert = inert })
      if (previous?.isConnected) previous.focus()
    }
  }, [selector])
}
