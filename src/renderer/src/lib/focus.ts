/** Keyboard focus helpers for dialogs, menus and the command palette. */

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',')

function visible(el: HTMLElement): boolean {
  // checkVisibility() knows about display:none ancestors; where it is missing (tests), assume visible.
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : !el.closest('[hidden]')
}

/** The elements inside `root` that Tab reaches, in order. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert]') && !el.closest('[aria-hidden="true"]') && visible(el)
  )
}

/** Moves focus, without scrolling the page when the element is already in view. */
export function focusElement(el: HTMLElement | null | undefined): void {
  if (!el) return
  try {
    el.focus({ preventScroll: false })
  } catch {
    el.focus()
  }
}
