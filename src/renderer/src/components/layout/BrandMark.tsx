/** The AETERNA mark: an accent-gradient tile with a fine Æ. Decorative; the product name is beside it. */
export function BrandMark({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[7px] font-display font-semibold text-accent-fg shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25)]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: 'linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent) / 0.75) 55%, rgb(var(--accent-2) / 0.9) 100%)'
      }}
    >
      Æ
    </span>
  )
}
