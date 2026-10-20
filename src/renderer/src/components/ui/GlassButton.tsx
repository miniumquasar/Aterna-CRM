import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { cx } from '../../lib/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * Primary: the accent gradient with white text (both ends clear 4.5:1). In
 * Day hovering deepens it; in Night it lifts (the fill is already at its
 * white-text limit). Danger is solid in Day and a soft tint with danger
 * text in Night, where a solid red can't carry white text.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger'
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-[10px] px-3 text-[13px]',
  md: 'h-9 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-11 gap-2 rounded-[14px] px-5 text-[15px]'
}

const ICON_ONLY: Record<ButtonSize, string> = { sm: 'h-8 w-8 rounded-[10px]', md: 'h-9 w-9 rounded-xl', lg: 'h-11 w-11 rounded-[14px]' }
const ICON_SIZE: Record<ButtonSize, number> = { sm: 15, md: 16, lg: 18 }

/**
 * The app's button. Buttons say what they do ("Mark filed").
 *
 * @prop variant      'primary' (the main action), 'secondary' (default), 'ghost' (quiet), 'danger' (removes something).
 * @prop size         'sm' | 'md' (default) | 'lg'.
 * @prop icon         A lucide icon shown with the label.
 * @prop iconPosition 'start' (default) or 'end'.
 * @prop iconOnly     Show only the icon; give the button an aria-label (and usually a Tooltip).
 * @prop loading      Shows a spinner, sets aria-busy and stops further clicks.
 * @prop fullWidth    Fills its container's width.
 * `type` defaults to 'button'; every other button attribute passes through.
 */
export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  iconPosition?: 'start' | 'end'
  iconOnly?: boolean
  loading?: boolean
  fullWidth?: boolean
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { variant = 'secondary', size = 'md', icon: Icon, iconPosition = 'start', iconOnly = false, loading = false, fullWidth = false, disabled, className, children, type = 'button', ...rest },
  ref
) {
  const iconEl = loading ? (
    <LoaderCircle size={ICON_SIZE[size]} className="animate-spin" aria-hidden />
  ) : Icon ? (
    <Icon size={ICON_SIZE[size]} aria-hidden strokeWidth={1.9} />
  ) : null
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.005em] [&>svg]:shrink-0',
        // While busy it keeps its look (the spinner says why it can't be pressed); otherwise disabled dims it.
        loading ? 'cursor-progress' : 'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        iconOnly ? ICON_ONLY[size] : SIZE[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {iconPosition === 'start' && iconEl}
      {!iconOnly && children}
      {iconPosition === 'end' && iconEl}
    </button>
  )
})
