import { Search, Settings, Sparkles } from 'lucide-react'

interface AetherTitleBarProps {
  /** Whose licence this is ("Licensed to …", or the trial): always on show, so a shared key is plain to see. */
  licence?: string
  /** The keys that open Go to…: "Ctrl K", or "⌘K" on a Mac. */
  goToKeys: string
  onGoTo: () => void
  onAssistant: () => void
  onSettings: () => void
}

/**
 * Frameless, drag-enabled title bar.
 *
 * The `-webkit-app-region: drag` style is applied to the outer container
 * so the user can move the window from the title bar — but interactive
 * regions are marked as `no-drag` so clicks still register.
 */
export function AetherTitleBar({ licence, goToKeys, onGoTo, onAssistant, onSettings }: AetherTitleBarProps): JSX.Element {
  return (
    <header
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={{ WebkitAppRegion: 'drag' } as any}
      className="flex h-12 items-center justify-between border-b border-white/5 bg-void/60 px-6 backdrop-blur-xl"
    >
      <div className="flex min-w-0 items-center gap-3 pl-16 md:pl-0">
        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-aether shadow-[0_0_8px_rgba(0,245,232,0.8)]" />
        <span className="flex-shrink-0 text-[11px] font-light uppercase tracking-[0.3em] text-white/40">AETERNA CRM</span>
        {licence && (
          <span className="truncate text-[11px] text-white/60" title={licence} data-testid="title-licence">
            {licence}
          </span>
        )}
      </div>

      <div
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style={{ WebkitAppRegion: 'no-drag' } as any}
        className="flex items-center gap-2"
      >
        <button
          type="button"
          onClick={onGoTo}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white/85"
          data-testid="open-goto"
        >
          <Search size={12} aria-hidden />
          <span>Go to…</span>
          <kbd className="font-mono text-[10px] tracking-wider text-white/35">{goToKeys}</kbd>
        </button>
        <button
          type="button"
          onClick={onAssistant}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/85"
          data-testid="open-assistant"
        >
          <Sparkles size={13} aria-hidden /> AI assistant
        </button>
        <button
          type="button"
          onClick={onSettings}
          className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
          aria-label="Settings"
        >
          <Settings size={14} aria-hidden />
        </button>
      </div>
    </header>
  )
}
