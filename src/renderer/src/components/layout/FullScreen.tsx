import type { ReactNode } from 'react'
import { PRODUCT_NAME } from '@shared/product'
import { BrandMark } from './BrandMark'

/** The colour field and title bar with one thing in the middle: loading, sign-in, or a problem before sign-in. */
export function FullScreen({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="relative flex h-full flex-col" data-app-shell>
      <div className="app-backdrop" aria-hidden />
      <div className="app-grain" aria-hidden />
      <header className="titlebar relative z-10 flex shrink-0 items-center gap-2.5 pl-5">
        <BrandMark size={22} />
        <span className="whitespace-nowrap text-[12.5px] font-semibold tracking-[0.18em] text-fg">{PRODUCT_NAME}</span>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto px-6 pb-16">
        <div className="w-full max-w-lg animate-rise-in">{children}</div>
      </main>
    </div>
  )
}
