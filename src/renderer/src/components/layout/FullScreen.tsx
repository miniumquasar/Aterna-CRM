import type { ReactNode } from 'react'
import { PRODUCT_NAME } from '@shared/product'
import { BrandMark } from './BrandMark'

/** The backdrop and title bar with one thing in the middle: loading, or a problem before sign-in. */
export function FullScreen({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="relative flex h-full flex-col">
      <div className="app-backdrop" aria-hidden />
      <header className="titlebar relative z-10 flex items-center gap-2.5 pl-5">
        <BrandMark size={22} />
        <span className="font-display text-[13px] font-semibold tracking-[0.18em] text-fg">{PRODUCT_NAME}</span>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  )
}
