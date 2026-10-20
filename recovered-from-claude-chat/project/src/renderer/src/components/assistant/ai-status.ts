/**
 * Whether the assistant can run on this computer, as the screens show it.
 * Plain functions and one hook; the words are tested on their own
 * (tests/renderer/oracle.test.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiPullProgress, AiStatus } from '@shared/types'

/** The state in one sentence. */
export function aiStateText(s: AiStatus): string {
  switch (s.state) {
    case 'ready':
      return `Ready. The model “${s.model}” runs on this computer, and nothing you ask leaves it.`
    case 'no_model':
      return `Ollama is running, but the model “${s.model}” isn’t on this computer yet.`
    case 'not_running':
      return 'Ollama is installed on this computer, but it isn’t running.'
    case 'not_installed':
      return 'The assistant runs on Ollama, which isn’t installed on this computer yet.'
  }
}

/** 4_900_000_000 → "4.9 GB", 52_000_000 → "52 MB". */
export function bytesText(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n < 0) return ''
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${Math.max(1, Math.round(n / 1e3))} KB`
}

/** How a download is going, in words: "Downloading: 1.2 GB of 4.9 GB (24%)". */
export function pullText(p: AiPullProgress): string {
  if (p.done) return p.error ? p.error : p.status === 'Cancelled' ? 'Download cancelled.' : `“${p.model}” is downloaded.`
  if (p.total && p.completed !== null) {
    const pct = Math.min(100, Math.floor((p.completed / p.total) * 100))
    return `Downloading “${p.model}”: ${bytesText(p.completed)} of ${bytesText(p.total)} (${pct}%)`
  }
  return `Downloading “${p.model}”: ${p.status.toLowerCase()}…`
}

/** The fraction downloaded (0 to 1), or null before the size is known. */
export const pullFraction = (p: AiPullProgress): number | null => (p.total && p.completed !== null ? Math.min(1, p.completed / p.total) : null)

/**
 * The assistant's status: checked on open, again on request, every
 * `pollMs` while it isn't ready (so starting Ollama shows without a click),
 * and as a download moves along.
 */
export function useAiStatus(pollMs = 0): {
  status: AiStatus | null
  error: string | null
  checking: boolean
  /** The last download to finish (or fail, or be cancelled) while the screen was open. */
  finished: AiPullProgress | null
  refresh: () => Promise<void>
} {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [finished, setFinished] = useState<AiPullProgress | null>(null)
  const latest = useRef(0)

  const refresh = useCallback(async () => {
    const ticket = ++latest.current
    setChecking(true)
    try {
      const r = await window.api.ai.status()
      if (ticket !== latest.current) return
      if (r.ok) {
        setStatus(r.data)
        setError(null)
      } else setError(r.error)
    } catch (err) {
      if (ticket === latest.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (ticket === latest.current) setChecking(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const off = window.api.ai.onPullProgress((p) => {
      setStatus((s) => (s ? { ...s, pulling: p.done ? null : p } : s))
      setFinished(p.done ? p : null)
      if (p.done) void refresh()
    })
    return off
  }, [refresh])

  const ready = status?.state === 'ready'
  useEffect(() => {
    if (!pollMs || ready) return
    const every = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(every)
  }, [pollMs, ready, refresh])

  return { status, error, checking, finished, refresh }
}
