/** The AETERNA mark: a tile in the accent gradient with a fine Æ in Source Serif. Decorative; the product name is beside it. */
export function BrandMark({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center font-serif font-semibold text-accent-fg shadow-[inset_0_1px_0_0_rgb(255_255_255/0.28),0_4px_12px_-6px_rgb(var(--accent)/0.8)]"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        fontSize: size * 0.56,
        lineHeight: 1,
        background: 'linear-gradient(140deg, rgb(var(--accent-gradient-from)) 0%, rgb(var(--accent)) 55%, rgb(var(--accent-gradient-to)) 100%)'
      }}
    >
      Æ
    </span>
  )
}
