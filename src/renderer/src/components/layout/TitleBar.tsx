/**
 * The window's own title bar (the window has no native one): the product
 * mark and the firm the licence names, Go to… (Ctrl+K), the assistant and
 * the notification bell. It is the drag region; on Windows the system's
 * window controls sit over its right end (see src/main/app/window.ts).
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
    <header className="titlebar relative z-20 flex shrink-0 items-center gap-3 pl-5" data-testid="title-bar">
      <div className="flex min-w-0 shrink items-center gap-2.5">
        <BrandMark size={22} />
        <span className="whitespace-nowrap text-[12.5px] font-semibold tracking-[0.18em] text-fg">{PRODUCT_NAME}</span>
        {holder && (
          <>
            <span className="h-3.5 w-px bg-line/25" aria-hidden />
            <span className="truncate text-[13px] text-fg-muted" data-testid="firm-name" title={holder}>
              {holder}
            </span>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-1 justify-center px-4">
        <button
          type="button"
          onClick={onOpenPalette}
          className="glass-sunken group inline-flex h-[30px] w-full max-w-[26rem] items-center gap-2 rounded-[10px] px-3 text-[13px] text-fg-muted transition-colors hover:text-fg"
          aria-label="Go to a client or a screen"
          aria-keyshortcuts="Control+K"
        >
          <Search size={14} aria-hidden className="text-fg-subtle group-hover:text-fg-muted" />
          <span className="flex-1 truncate text-left">Go to…</span>
          <Kbd keys={['Ctrl', 'K']} />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-1 pr-3">
        <Tooltip content="Assistant" describe={false}>
          <GlassButton variant="ghost" size="sm" iconOnly icon={Sparkles} aria-label="Assistant" onClick={() => navigate('assistant')} />
        </Tooltip>
        <NotificationBell />
      </div>
    </header>
  )
}
