/** Small hooks the shell and the design system share. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Whether a media query matches, kept up to date. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

export interface HotkeyOptions {
  /** Ctrl on Windows and Linux, ⌘ on macOS. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /** Run even while typing in a field. Defaults to true when `mod` is set. */
  inFields?: boolean
  enabled?: boolean
}

function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Calls `handler` for a key ('k', 'Escape', 'ArrowLeft'), with modifiers. */
export function useHotkey(key: string, handler: (event: KeyboardEvent) => void, options: HotkeyOptions = {}): void {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  const { mod = false, shift = false, alt = false, enabled = true } = options
  const inFields = options.inFields ?? mod
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      const modPressed = event.ctrlKey || event.metaKey
      if (modPressed !== mod || event.shiftKey !== shift || event.altKey !== alt) return
      if (!inFields && typingIn(event.target)) return
      latest.current(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, mod, shift, alt, inFields, enabled])
}

/** A value that follows `value` after it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
