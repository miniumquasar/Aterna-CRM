/**
 * A table on glass: sortable columns, row click, sticky frosted header,
 * keyboard row navigation (↑ ↓ Home End, Enter opens), optional tick-box
 * selection, and an empty state when there are no rows. Figures are
 * tabular, so columns of money and dates line up; rows follow Settings →
 * Appearance → Density (44px Comfortable, 32px Compact).
 */
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cx } from '../../lib/cx'
import { Checkbox } from './Checkbox'
import { Loading } from './Loading'

export type SortDirection = 'asc' | 'desc'
export interface SortState {
  columnId: string
  direction: SortDirection
}

/**
 * @prop id         Unique within the table.
 * @prop header     The column heading.
 * @prop cell       What a row shows in this column.
 * @prop sortValue  Makes the column sortable by this value (text sorts in UK order, numbers numerically, null last).
 * @prop align      'start' (default), 'end' (numbers, money) or 'center'.
 * @prop width      A CSS width for the column ('8rem', '20%').
 * @prop hideBelow  Hide the column on narrow windows: 'md' | 'lg' | 'xl'.
 */
export interface Column<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null | undefined
  align?: 'start' | 'end' | 'center'
  width?: string
  hideBelow?: 'md' | 'lg' | 'xl'
}

export type RowKey = string | number

/**
 * @prop caption           What the table holds; read by screen readers (shown when `showCaption`).
 * @prop columns, rows     The data.
 * @prop rowKey            A stable key per row.
 * @prop onRowClick        Makes rows open something (click, or Enter on the focused row).
 * @prop rowLabel          The accessible name of a row's action: (row) => `Open ${row.name}`.
 * @prop sort / onSortChange   Controlled sorting; or `initialSort` for the table to keep its own.
 * @prop selectedKeys / onSelectionChange   Turns on tick boxes for bulk actions.
 * @prop empty             Shown instead of the body when there are no rows (an EmptyState).
 * @prop loading           Shows Loading in the body.
 * @prop stickyHeader      Default true; give the table a `maxHeight` (or a scrolling parent).
 * @prop dense             Tighter rows (Compact, whatever the density setting).
 */
export interface GlassTableProps<T> {
  caption: string
  showCaption?: boolean
  columns: readonly Column<T>[]
  rows: readonly T[]
  rowKey: (row: T) => RowKey
  onRowClick?: (row: T) => void
  rowLabel?: (row: T) => string
  sort?: SortState | null
  onSortChange?: (sort: SortState | null) => void
  initialSort?: SortState | null
  selectedKeys?: ReadonlySet<RowKey>
  onSelectionChange?: (keys: Set<RowKey>) => void
  empty?: ReactNode
  loading?: boolean
  stickyHeader?: boolean
  maxHeight?: string
  dense?: boolean
  className?: string
}

const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' })

function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' }
const ALIGN = { start: 'text-left', end: 'text-right', center: 'text-center' } as const

export function GlassTable<T>({
  caption,
  showCaption = false,
  columns,
  rows,
  rowKey,
  onRowClick,
  rowLabel,
  sort: controlledSort,
  onSortChange,
  initialSort = null,
  selectedKeys,
  onSelectionChange,
  empty,
  loading = false,
  stickyHeader = true,
  maxHeight,
  dense = false,
  className
}: GlassTableProps<T>): JSX.Element {
  const [ownSort, setOwnSort] = useState<SortState | null>(initialSort)
  const sort = controlledSort !== undefined ? controlledSort : ownSort
  const [focusIndex, setFocusIndex] = useState(0)
  const body = useRef<HTMLTableSectionElement>(null)
  const selectable = selectedKeys !== undefined && onSelectionChange !== undefined

  const sorted = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((c) => c.id === sort.columnId)
    if (!column?.sortValue) return rows
    const value = column.sortValue
    const out = [...rows].sort((a, b) => compare(value(a), value(b)))
    return sort.direction === 'desc' ? out.reverse() : out
  }, [rows, columns, sort])

  const setSort = (columnId: string): void => {
    const next: SortState | null =
      sort?.columnId !== columnId ? { columnId, direction: 'asc' } : sort.direction === 'asc' ? { columnId, direction: 'desc' } : null
    if (onSortChange) onSortChange(next)
    if (controlledSort === undefined) setOwnSort(next)
  }

  const focusRow = (index: number): void => {
    const clamped = Math.max(0, Math.min(sorted.length - 1, index))
    setFocusIndex(clamped)
    body.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row]')[clamped]?.focus()
  }

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, row: T, index: number): void => {
    if (event.target !== event.currentTarget) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRow(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusRow(0)
        break
      case 'End':
        event.preventDefault()
        focusRow(sorted.length - 1)
        break
      case 'Enter':
        if (onRowClick) {
          event.preventDefault()
          onRowClick(row)
        }
        break
      case ' ':
        if (selectable) {
          event.preventDefault()
          toggle(rowKey(row))
        }
        break
    }
  }

  const toggle = (key: RowKey): void => {
    if (!selectable) return
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectionChange(next)
  }

  const allKeys = sorted.map(rowKey)
  const selectedCount = selectable ? allKeys.filter((k) => selectedKeys.has(k)).length : 0
  const cellPad = dense ? 'px-3 py-1' : 'px-4 py-1.5'
  const rowHeight = dense ? 'h-8' : 'h-row'
  const headerCell = cx('border-b hairline', stickyHeader && 'glass-header sticky top-0 z-10')
  const activeIndex = Math.min(focusIndex, Math.max(0, sorted.length - 1))

  return (
    <div className={cx('glass overflow-auto rounded-2xl', className)} style={maxHeight ? { maxHeight } : undefined} data-print-flow>
      <table className="tabular w-full border-separate border-spacing-0 text-sm">
        <caption className={showCaption ? 'px-4 pb-2 pt-3.5 text-left text-[13px] font-semibold text-fg' : 'sr-only'}>{caption}</caption>
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className={cx('w-11', headerCell, cellPad)}>
                <Checkbox
                  checked={sorted.length > 0 && selectedCount === sorted.length}
                  indeterminate={selectedCount > 0 && selectedCount < sorted.length}
                  onChange={(on) => onSelectionChange(on ? new Set([...selectedKeys, ...allKeys]) : new Set([...selectedKeys].filter((k) => !allKeys.includes(k))))}
                  aria-label={selectedCount === sorted.length ? 'Untick every row' : 'Tick every row'}
                />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.columnId === c.id
              const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined
              const SortIcon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={ariaSort}
                  style={c.width ? { width: c.width } : undefined}
                  className={cx(
                    'h-10 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted',
                    headerCell,
                    cellPad,
                    ALIGN[c.align ?? 'start'],
                    c.hideBelow && HIDE[c.hideBelow]
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => setSort(c.id)}
                      className={cx(
                        'group/sort -mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 uppercase tracking-[0.08em] transition-colors hover:text-fg',
                        active && 'text-fg',
                        c.align === 'end' && 'flex-row-reverse'
                      )}
                    >
                      {c.header}
                      <SortIcon size={13} aria-hidden className={cx('transition-opacity', active ? 'text-accent-text opacity-100' : 'opacity-40 group-hover/sort:opacity-80')} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody ref={body}>
          {loading ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-8">
                <Loading label={`Loading ${caption.charAt(0).toLowerCase()}${caption.slice(1)}…`} />
              </td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-6">
                {empty ?? <p className="py-4 text-center text-sm text-fg-muted">Nothing to show here yet.</p>}
              </td>
            </tr>
          ) : (
            sorted.map((row, index) => {
              const key = rowKey(row)
              const selected = selectable && selectedKeys.has(key)
              return (
                <tr
                  key={key}
                  data-row
                  tabIndex={index === activeIndex ? 0 : -1}
                  aria-selected={selectable ? selected : undefined}
                  aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={(e) => onRowKey(e, row, index)}
                  onFocus={() => setFocusIndex(index)}
                  data-selected={selected || undefined}
                  className={cx(
                    'group outline-none transition-colors duration-150',
                    onRowClick && 'cursor-pointer',
                    'hover:bg-fg/[0.035]',
                    // Focus and selection: the accent tint and a 3px bar on the first cell (rows can't draw shadows).
                    'focus-visible:bg-accent-soft [&:focus-visible>td:first-child]:shadow-[inset_3px_0_0_0_rgb(var(--focus))]',
                    selected && 'bg-accent-soft [&>td:first-child]:shadow-[inset_3px_0_0_0_rgb(var(--accent))]'
                  )}
                >
                  {selectable && (
                    <td className={cx('border-b hairline group-last:border-b-0', rowHeight, cellPad)} onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected} onChange={() => toggle(key)} aria-label={rowLabel ? `Tick: ${rowLabel(row)}` : 'Tick this row'} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.id} className={cx('border-b hairline text-fg group-last:border-b-0', rowHeight, cellPad, ALIGN[c.align ?? 'start'], c.hideBelow && HIDE[c.hideBelow])}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
