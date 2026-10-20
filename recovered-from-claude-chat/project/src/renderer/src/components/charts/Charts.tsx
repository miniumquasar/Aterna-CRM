/**
 * The charts the screens share, drawn the same way everywhere: thin columns
 * with rounded tops on one baseline, hairline gridlines, muted axis text, one
 * label on the tallest column only, and a tooltip that leads with the value.
 * Every chart has its figures as a table too (FiguresToggle), so nothing is
 * only in a picture or behind a hover.
 */
import { useId, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMotionLevel } from '@renderer/lib/motion'
import { compactNumber, heatColours, heatStep, monthTick, niceMax, peakIndex, VIZ } from './scale'

export interface ColumnDatum {
  key: string
  /** "Nov 2026" */
  label: string
  value: number
}

interface TipProps {
  active?: boolean
  payload?: Array<{ payload?: ColumnDatum }>
  format: (value: number) => string
  unit?: (value: number) => string
}

/** The hovered column: its value first, then what it is. */
function TooltipBox({ active, payload, format, unit }: TipProps): JSX.Element | null {
  const d = active ? payload?.[0]?.payload : undefined
  if (!d) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0710]/95 px-3 py-2 shadow-xl shadow-black/50">
      <p className="text-sm font-medium text-white/95">
        {format(d.value)}
        {unit ? <span className="font-normal text-white/60"> {unit(d.value)}</span> : null}
      </p>
      <p className="text-xs text-white/55">{d.label}</p>
    </div>
  )
}

interface PeakLabelProps {
  x?: number | string
  y?: number | string
  width?: number | string
  value?: number | string
  index?: number
}

/**
 * Columns over a run of months, single series. `max` fixes the top of the
 * scale (small multiples that must compare share one); otherwise a round
 * number above the tallest column.
 */
export function ColumnChart({
  data,
  format,
  unit,
  axisFormat = compactNumber,
  label,
  height = 220,
  max,
  testid
}: {
  data: readonly ColumnDatum[]
  format: (value: number) => string
  unit?: (value: number) => string
  axisFormat?: (value: number) => string
  /** What the chart shows, for screen readers. */
  label: string
  height?: number
  max?: number
  testid?: string
}): JSX.Element {
  const motion = useMotionLevel()
  const peak = peakIndex(data.map((d) => d.value))
  const top = max ?? niceMax(Math.max(0, ...data.map((d) => d.value)))
  const rows = data.map((d, i) => ({ ...d, tick: monthTick(d.label, i) }))
  return (
    <figure className="m-0" data-testid={testid}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 24, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={VIZ.grid} />
            <XAxis dataKey="tick" interval={0} tick={{ fill: VIZ.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: VIZ.baseline }} />
            <YAxis
              domain={[0, top]}
              allowDecimals={false}
              tickFormatter={(v: number) => axisFormat(v)}
              tick={{ fill: VIZ.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.035)' }} content={<TooltipBox format={format} unit={unit} />} isAnimationActive={false} />
            <Bar
              dataKey="value"
              fill={VIZ.series[0]}
              activeBar={{ fill: VIZ.seriesHover }}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={motion !== 'none'}
              animationDuration={motion === 'full' ? 550 : 280}
            >
              {peak >= 0 && (
                <LabelList
                  dataKey="value"
                  content={(p: PeakLabelProps) =>
                    p.index === peak ? (
                      <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 8} textAnchor="middle" fill={VIZ.ink} fontSize={12}>
                        {format(Number(p.value))}
                      </text>
                    ) : null
                  }
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  )
}

/** "Show the figures": the chart's numbers as a table, under it. */
export function FiguresToggle({ children, label = 'figures' }: { children: ReactNode; label?: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="mt-2">
      <button type="button" className="text-xs text-white/55 hover:text-white/85" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {open ? `Hide the ${label}` : `Show the ${label}`}
      </button>
      <div id={id} hidden={!open} className="mt-2">
        {open && children}
      </div>
    </div>
  )
}

/** A plain two-column table of a chart's figures. */
export function FiguresTable({ head, rows }: { head: [string, string]; rows: Array<[string, string]> }): JSX.Element {
  return (
    <table className="w-full max-w-md text-xs">
      <thead className="text-white/50">
        <tr>
          <th scope="col" className="py-1 text-left font-medium">{head[0]}</th>
          <th scope="col" className="py-1 text-right font-medium">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([a, b]) => (
          <tr key={a} className="border-t border-white/5">
            <th scope="row" className="py-1 text-left font-normal text-white/75">{a}</th>
            <td className="py-1 text-right tabular-nums text-white/85">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export interface HeatRow {
  key: string
  label: string
  overdue: number
  byMonth: readonly number[]
  total: number
}

/** The five heat steps, few to many. */
export function HeatScale(): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-white/45" aria-hidden>
      <span>Fewer</span>
      {VIZ.heat.map((c) => (
        <span key={c} className="h-2.5 w-5 rounded-[3px]" style={{ backgroundColor: c }} />
      ))}
      <span>More</span>
    </div>
  )
}

/**
 * A table whose month cells are shaded by how many fall due: the darker, the
 * fewer. Overdue ones sit in their own column with a warning sign, never on
 * the same scale as the months.
 */
export function HeatTable({
  rows,
  months,
  rowHeader,
  caption,
  testid
}: {
  rows: readonly HeatRow[]
  months: ReadonlyArray<{ key: string; label: string }>
  rowHeader: string
  caption: string
  testid?: string
}): JSX.Element {
  const max = Math.max(0, ...rows.flatMap((r) => r.byMonth))
  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[2px] text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-white/50">
              <th scope="col" className="px-2 py-1 text-left font-medium">{rowHeader}</th>
              <th scope="col" className="px-2 py-1 text-right font-medium">Overdue</th>
              {months.map((m, i) => (
                <th key={m.key} scope="col" className="px-1 py-1 text-center font-medium" title={m.label}>
                  {monthTick(m.label, i)}
                </th>
              ))}
              <th scope="col" className="px-2 py-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="group">
                <th scope="row" className="max-w-[16rem] truncate px-2 py-1 text-left font-normal text-white/80" title={r.label}>
                  {r.label}
                </th>
                <td className="px-2 py-1 text-right tabular-nums">
                  {r.overdue ? (
                    <span className="inline-flex items-center gap-1 text-rose-200">
                      <AlertTriangle size={11} aria-hidden />
                      {r.overdue}
                    </span>
                  ) : (
                    <span className="text-white/25">0</span>
                  )}
                </td>
                {r.byMonth.map((n, i) => {
                  const c = heatColours(heatStep(n, max))
                  return (
                    <td
                      key={months[i]?.key ?? i}
                      className={`h-8 min-w-[2.4rem] rounded-[4px] px-1 text-center tabular-nums transition-[filter] hover:brightness-125 ${c ? '' : 'bg-white/[0.025] text-white/20'}`}
                      style={c ? { backgroundColor: c.fill, color: c.text } : undefined}
                      title={`${r.label}, ${months[i]?.label ?? ''}: ${n}`}
                    >
                      {n || ''}
                    </td>
                  )
                })}
                <td className="px-2 py-1 text-right tabular-nums text-white/85">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HeatScale />
    </div>
  )
}
