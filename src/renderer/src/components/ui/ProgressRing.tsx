import { TONE_VAR, type Tone } from './tones'

/**
 * A ring that fills to show progress or a score (role="progressbar").
 *
 * @prop value      How far along, from 0 to `max`.
 * @prop max        Default 100.
 * @prop label      What it measures, for screen readers ('Setup progress').
 * @prop size       Diameter in pixels (default 44).
 * @prop thickness  Ring width in pixels (default 4).
 * @prop showValue  Show the percentage in the middle.
 * @prop tone       'accent' (default) | 'success' | 'warning' | 'danger' | 'info' | 'neutral'.
 */
export interface ProgressRingProps {
  value: number
  max?: number
  label: string
  size?: number
  thickness?: number
  showValue?: boolean
  tone?: Tone
  className?: string
}

export function ProgressRing({ value, max = 100, label, size = 44, thickness = 4, showValue = false, tone = 'accent', className }: ProgressRingProps): JSX.Element {
  const clamped = Math.max(0, Math.min(max, value))
  const fraction = max > 0 ? clamped / max : 0
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(clamped)}
      className={`relative inline-flex items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} style={{ stroke: 'rgb(var(--text) / 0.12)' }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ stroke: TONE_VAR[tone], transition: 'stroke-dashoffset 400ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>
      {showValue && <span className="tabular absolute text-[11px] font-semibold text-fg">{Math.round(fraction * 100)}%</span>}
    </span>
  )
}
