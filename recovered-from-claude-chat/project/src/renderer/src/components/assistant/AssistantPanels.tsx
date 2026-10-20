/**
 * The assistant's two panels:
 *
 *   AssistantSetup     when it can't run yet: what is missing, the steps for
 *                      this computer, Check again, and — for partners and
 *                      managers — downloading the model from inside the app
 *   AssistantBriefing  a short briefing on the forecast or one client, with
 *                      exactly what the assistant was given beside it
 */
import { useState } from 'react'
import { Download, RefreshCw, Sparkles } from 'lucide-react'
import type { AiStatus, AiSummary, AiSummaryRequest } from '@shared/types'
import { useAuthStore } from '@renderer/stores/crm/auth'
import { useUiStore } from '@renderer/stores/ui'
import { aiStateText, pullFraction, pullText, useAiStatus } from './ai-status'

const button =
  'inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.06] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
const primary =
  'inline-flex items-center gap-1.5 rounded-lg bg-aether/90 px-3 py-1.5 text-xs font-medium text-black hover:bg-aether disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

/** The download, as a bar that fills and a sentence; Cancel beside it. */
function PullProgress({ status, canManage }: { status: AiStatus; canManage: boolean }): JSX.Element | null {
  const p = status.pulling
  const [error, setError] = useState<string | null>(null)
  if (!p) return null
  const fraction = pullFraction(p)
  const cancel = async (): Promise<void> => {
    const r = await window.api.ai.cancelPull()
    if (!r.ok) setError(r.error)
  }
  return (
    <div className="space-y-2" data-testid="ai-pull-progress">
      <p className="text-sm text-white/75" role="status">{pullText(p)}</p>
      <div
        className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-aether/15"
        role="progressbar"
        aria-label="Download"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fraction === null ? undefined : Math.floor(fraction * 100)}
      >
        <div className={`h-full rounded-full bg-aether/80 ${fraction === null ? 'w-1/4 animate-pulse' : ''}`} style={fraction === null ? undefined : { width: `${Math.max(2, fraction * 100)}%` }} />
      </div>
      {canManage && (
        <button type="button" className={button} onClick={() => void cancel()}>
          Cancel the download
        </button>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}

/** What is missing, and the steps to put it right on this computer. */
export function AssistantSetup({ status, checking, finished, onCheck }: { status: AiStatus; checking: boolean; finished: ReturnType<typeof useAiStatus>['finished']; onCheck: () => void }): JSX.Element {
  const role = useAuthStore((s) => s.user?.role)
  const navigateTo = useUiStore((s) => s.navigateTo)
  const canManage = role === 'partner' || role === 'manager'
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async (): Promise<void> => {
    setStarting(true)
    setError(null)
    const r = await window.api.ai.pullModel()
    setStarting(false)
    if (!r.ok) setError(r.error)
    else onCheck()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-white/10 bg-white/[0.02] p-6" data-testid="ai-setup">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-divine/80" aria-hidden />
        <div>
          <h2 className="text-base font-medium text-white/90">The assistant isn’t ready on this computer yet</h2>
          <p className="mt-1 text-sm text-white/60" data-testid="ai-state">{aiStateText(status)}</p>
        </div>
      </div>

      {status.pulling ? (
        <PullProgress status={status} canManage={canManage} />
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-white/75" data-testid="ai-steps">
          {status.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      {finished && !status.pulling && (
        <p className={`text-sm ${finished.error ? 'text-rose-300' : 'text-white/70'}`} role="status">{pullText(finished)}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status.state === 'no_model' && !status.pulling && canManage && (
          <button type="button" className={primary} onClick={() => void download()} disabled={starting} data-testid="ai-download">
            <Download size={13} aria-hidden />
            {starting ? 'Starting…' : `Download the model here (${status.model})`}
          </button>
        )}
        <button type="button" className={button} onClick={onCheck} disabled={checking} data-testid="ai-check">
          <RefreshCw size={12} className={checking ? 'animate-spin' : ''} aria-hidden />
          Check again
        </button>
        {status.state === 'no_model' && status.models.length > 0 && (
          <button type="button" className={button} onClick={() => navigateTo('settings')}>
            Choose another model in Settings
          </button>
        )}
      </div>

      {status.state === 'no_model' && canManage && !status.pulling && (
        <p className="text-xs text-white/45">The model is several gigabytes. It downloads once, then works without the internet. Keep the app open until it finishes.</p>
      )}
      {status.models.length > 0 && status.state === 'no_model' && (
        <p className="text-xs text-white/45">Models already on this computer: {status.models.join(', ')}.</p>
      )}
      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
    </div>
  )
}

/**
 * Asks the assistant for a short briefing. The answer comes with the model's
 * name and exactly what it was given, so it can be checked: the assistant can
 * be wrong.
 */
export function AssistantBriefing({ request, intro, testid }: { request: AiSummaryRequest; intro: string; testid?: string }): JSX.Element {
  const navigateTo = useUiStore((s) => s.navigateTo)
  const { status, checking, refresh } = useAiStatus()
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<(AiSummary & { at: Date }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  const write = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await window.api.ai.summarise(request)
      if (r.ok) setSummary({ ...r.data, at: new Date() })
      else {
        setError(r.error)
        void refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const ready = status?.state === 'ready'
  return (
    <div className="space-y-3" data-testid={testid}>
      <p className="max-w-prose text-sm text-white/55">{intro}</p>
      {status && !ready && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
          <span>{aiStateText(status)}</span>
          <button type="button" className={button} onClick={() => navigateTo('ai')}>
            Set up the assistant
          </button>
          <button type="button" className={button} onClick={() => void refresh()} disabled={checking}>
            Check again
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} onClick={() => void write()} disabled={busy || !ready} data-testid={testid ? `${testid}-write` : undefined}>
          <Sparkles size={13} aria-hidden />
          {busy ? 'Writing… this can take a minute' : summary ? 'Write it again' : 'Write a briefing'}
        </button>
      </div>
      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
      {summary && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4" aria-live="polite">
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/85" data-testid={testid ? `${testid}-text` : undefined}>{summary.text}</p>
          <p className="text-xs text-white/40">
            Written by {summary.model} on this computer at {summary.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. Check it against the figures: the assistant can be wrong.
          </p>
          <details className="text-xs text-white/55">
            <summary className="cursor-pointer text-white/65 hover:text-white/85">What the assistant was given</summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-sans text-[12px] leading-relaxed text-white/65">{summary.context}</pre>
          </details>
        </div>
      )}
    </div>
  )
}
