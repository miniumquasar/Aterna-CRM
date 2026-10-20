/**
 * The window's own title bar (the window has no native one): the product
 * and the firm the licence names, Go to…, the assistant and the
 * notification bell. It is the drag region; on Windows the system's window
 * controls sit over its right end (see src/main/app/window.ts).
 */
import { Search, Sparkles } from 'lucide-react'
import { PRODUCT_NAME } from '@shared/product'
import { useApiQuery } from '../../lib/api'
import { navigate } from '../../stores/router'
import { NotificationBell } from '../notifications/NotificationBell'
import { GlassButton, Kbd, Tooltip } from '../ui'
import { BrandMark } from './BrandMark'

export interface TitleBarProps {
  /** The firm's name from setup; the licence holder's name wins once there is one. */
  firmName: string | null
  onOpenPalette: () => void
}

export function TitleBar({ firmName, onOpenPalette }: TitleBarProps): JSX.Element {
  const info = useApiQuery('system.info', undefined, { staleTime: 5 * 60_000 })
  const holder = info.data?.licenceHolder ?? firmName
  return (
    <header className="titlebar hairline relative z-20 flex shrink-0 items-center gap-3 border-b pl-4" data-testid="title-bar">
      <div className="flex min-w-0 items-center gap-2.5">
        <BrandMark size={22} />
        <span className="font-display text-[13px] font-semibold tracking-[0.18em] text-fg">{PRODUCT_NAME}</span>
        {holder && (
          <>
            <span className="h-4 w-px bg-line/25" aria-hidden />
            <span className="truncate text-[13px] text-fg-muted" data-testid="firm-name">
              {holder}
            </span>
          </>
        )}
      </div>
      <div className="flex flex-1 justify-center px-4">
        <button
          type="button"
          onClick={onOpenPalette}
          className="glass-sunken inline-flex h-7 w-full max-w-md items-center gap-2 rounded-lg px-3 text-[13px] text-fg-subtle transition-colors hover:text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          aria-label="Go to a client or a screen"
          aria-keyshortcuts="Control+K"
        >
          <Search size={14} aria-hidden />
          <span className="flex-1 truncate text-left">Go to…</span>
          <Kbd keys={['Ctrl', 'K']} />
        </button>
      </div>
      <div className="flex items-center gap-1 pr-2">
        <Tooltip content="Assistant" describe={false}>
          <GlassButton variant="ghost" size="sm" iconOnly icon={Sparkles} aria-label="Assistant" onClick={() => navigate('assistant')} />
        </Tooltip>
        <NotificationBell />
      </div>
    </header>
  )
}
