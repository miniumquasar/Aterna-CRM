// @vitest-environment jsdom
/**
 * Design-system behaviour beyond the core tests: choice cards and tabs by
 * keyboard, the stat tile's once-per-session count-up (and none under
 * reduced motion), money and references for screen readers, the table's
 * Space to tick, and Escape hiding a hint.
 */
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Amount, GlassButton, GlassTable, RadioCards, Reference, StatTile, Tabs, Tooltip, type Column } from '@renderer/components/ui'
import { figureAt, readFigure, resetCounted } from '@renderer/components/ui/countUp'

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.motion
})

describe('RadioCards', () => {
  function Harness(): JSX.Element {
    const [v, setV] = useState<'day' | 'night' | 'auto'>('night')
    return (
      <RadioCards
        label="Mode"
        value={v}
        onChange={setV}
        choiceAttribute="data-mode-choice"
        options={[
          { value: 'day', label: 'Day', description: 'Bright and crisp' },
          { value: 'night', label: 'Night', description: 'Easy on the eyes' },
          { value: 'auto', label: 'Auto', description: 'Follows Windows', disabled: true }
        ]}
      />
    )
  }

  it('is one radio group: arrows move and choose, skipping what is unavailable, and only the chosen card is in the Tab order', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy()
    const night = screen.getByRole('radio', { name: /Night/ })
    expect(night.getAttribute('aria-checked')).toBe('true')
    expect(night.tabIndex).toBe(0)
    expect(screen.getByRole('radio', { name: /Day/ }).tabIndex).toBe(-1)
    expect(night.getAttribute('data-mode-choice')).toBe('night')
    night.focus()
    await user.keyboard('{ArrowRight}')
    // Auto is unavailable, so → wraps to Day.
    expect(screen.getByRole('radio', { name: /Day/ }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /Day/ }))
    await user.keyboard('{End}')
    expect(screen.getByRole('radio', { name: /Night/ }).getAttribute('aria-checked')).toBe('true')
    await user.click(screen.getByRole('radio', { name: /Day/ }))
    expect(screen.getByRole('radio', { name: /Day/ }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('Tabs', () => {
  it('move with the arrow keys and Home and End, showing the chosen panel', async () => {
    const user = userEvent.setup()
    function Harness(): JSX.Element {
      const [tab, setTab] = useState('a')
      return (
        <Tabs label="Client file" value={tab} onChange={setTab} tabs={[{ id: 'a', label: 'Overview' }, { id: 'b', label: 'Deadlines', badge: 3 }, { id: 'c', label: 'Billing' }]}>
          <p>Panel {tab}</p>
        </Tabs>
      )
    }
    render(<Harness />)
    screen.getByRole('tab', { name: 'Overview' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Deadlines/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toBe('Panel b')
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Billing' }))
    await user.keyboard('{Home}')
    expect(screen.getByRole('tabpanel').textContent).toBe('Panel a')
  })
})

describe('StatTile', () => {
  beforeEach(() => resetCounted())

  it('reads a formatted figure and counts it in the same format', () => {
    const f = readFigure('£12,400.00')
    expect(f).toEqual({ prefix: '£', value: 12400, decimals: 2, grouped: true, suffix: '' })
    expect(figureAt(f!, 0)).toBe('£0.00')
    expect(figureAt(f!, 1)).toBe('£12,400.00')
    expect(readFigure('42%')).toMatchObject({ value: 42, suffix: '%' })
    expect(readFigure('7')).toMatchObject({ value: 7, decimals: 0 })
    expect(readFigure('Not yet')).toBeNull()
    expect(readFigure('3 of 4')).toBeNull()
  })

  it('counts up once per session, while screen readers hear only the figure', async () => {
    const { unmount } = render(<StatTile label="Unbilled work" value="£48,210.00" />)
    // While counting, the moving number is hidden and the real one is read.
    expect(document.querySelector('.sr-only')?.textContent).toBe('£48,210.00')
    expect(document.querySelector('[aria-hidden="true"].tabular')).not.toBeNull()
    await act(() => new Promise<void>((r) => setTimeout(r, 800)))
    expect(screen.getByText('£48,210.00')).toBeTruthy()
    expect(document.querySelector('.sr-only')).toBeNull()
    unmount()
    // The same tile again in this session: no count-up.
    render(<StatTile label="Unbilled work" value="£48,210.00" />)
    expect(document.querySelector('.sr-only')).toBeNull()
    expect(screen.getByText('£48,210.00')).toBeTruthy()
  })

  it('never counts under reduced motion, nor when told not to', () => {
    document.documentElement.dataset.motion = 'reduce'
    render(<StatTile label="Overdue" value="12" />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(document.querySelector('.sr-only')).toBeNull()
    cleanup()
    delete document.documentElement.dataset.motion
    render(<StatTile label="Owed" value="£9,840.00" countUp={false} />)
    expect(screen.getByText('£9,840.00')).toBeTruthy()
  })

  it('is a button that opens the detail when given onClick, and shows a labelled placeholder while loading', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<StatTile label="Overdue deadlines" value="7" countUp={false} onClick={open} />)
    await user.click(screen.getByRole('button', { name: /Overdue deadlines/ }))
    expect(open).toHaveBeenCalledTimes(1)
    cleanup()
    render(<StatTile label="Overdue deadlines" value="7" loading />)
    expect(screen.getByRole('status', { name: 'Loading Overdue deadlines' })).toBeTruthy()
  })
})

describe('Amount and Reference', () => {
  it('sets money the accountant’s way, and says it plainly to screen readers', () => {
    const { container, rerender } = render(<Amount pence={125000} />)
    expect(container.querySelector('[aria-hidden]')?.textContent).toBe('£1,250.00')
    expect(container.querySelector('.sr-only')?.textContent).toBe('£1,250.00')
    rerender(<Amount pence={-124050} />)
    expect(container.querySelector('[aria-hidden]')?.textContent).toBe('(£1,240.50)')
    expect(container.querySelector('.sr-only')?.textContent).toBe('minus £1,240.50')
    rerender(<Amount pence={-1250} negative="minus" />)
    expect(container.querySelector('[aria-hidden]')?.textContent).toBe('−£12.50')
    rerender(<Amount pence={4821049} whole />)
    expect(container.querySelector('[aria-hidden]')?.textContent).toBe('£48,210')
    rerender(<Amount pence={500} symbol={false} />)
    expect(container.querySelector('[aria-hidden]')?.textContent).toBe('5.00')
    rerender(<Amount pence={null} />)
    expect(container.textContent).toBe('—')
  })

  it('keeps a reference on one line, untranslated, with its name for screen readers', () => {
    const { container } = render(<Reference label="UTR">10203 04050</Reference>)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('translate')).toBe('no')
    expect(el.className).toContain('ref-figures')
    expect(el.textContent).toBe('UTR: 10203 04050')
  })
})

describe('GlassTable', () => {
  it('ticks the focused row with Space and opens it with Enter', async () => {
    const user = userEvent.setup()
    const rows = [
      { id: 1, name: 'Alder Ltd' },
      { id: 2, name: 'Beech LLP' }
    ]
    const columns: Column<(typeof rows)[number]>[] = [{ id: 'name', header: 'Name', cell: (r) => r.name }]
    const changed = vi.fn()
    const open = vi.fn()
    render(<GlassTable caption="Clients" columns={columns} rows={rows} rowKey={(r) => r.id} selectedKeys={new Set()} onSelectionChange={changed} onRowClick={open} rowLabel={(r) => `Open ${r.name}`} />)
    screen.getByRole('row', { name: 'Open Alder Ltd' }).focus()
    await user.keyboard(' ')
    expect([...changed.mock.calls[0][0]]).toEqual([1])
    await user.keyboard('{ArrowDown}{Enter}')
    expect(open).toHaveBeenCalledWith(rows[1])
  })
})

describe('Tooltip', () => {
  it('shows on focus at once, describes its button, and hides on Escape', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Opens the client file">
        <GlassButton>Open</GlassButton>
      </Tooltip>
    )
    await user.tab()
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('Opens the client file')
    expect(screen.getByRole('button', { name: 'Open' }).getAttribute('aria-describedby')).toBe(tip.id)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
