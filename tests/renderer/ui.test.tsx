// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmHost, GlassButton, GlassModal, GlassTable, Segmented, confirmAction, type Column } from '@renderer/components/ui'

afterEach(() => cleanup())

function ModalHarness({ onClose = () => undefined }: { onClose?: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <GlassButton onClick={() => setOpen(true)}>Open</GlassButton>
      <GlassModal
        open={open}
        onClose={() => {
          setOpen(false)
          onClose()
        }}
        title="Edit client"
        footer={<GlassButton variant="primary">Save</GlassButton>}
      >
        <input aria-label="Name" />
      </GlassModal>
    </>
  )
}

describe('GlassModal', () => {
  it('is labelled, focuses its first field, keeps Tab inside and returns focus on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ModalHarness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Edit client' })
    expect(dialog).toHaveProperty('ariaModal', 'true')
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
    // The page behind is inert while the dialog is open.
    expect(opener.closest('[inert]')).not.toBeNull()
    await user.tab() // Save
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }))
    await user.tab() // wraps to the first control (the close button sits before the field)
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener.closest('[inert]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('closes only the top dialog of a stack on Escape', async () => {
    const user = userEvent.setup()
    function Nested(): JSX.Element {
      const [inner, setInner] = useState(true)
      const [outer, setOuter] = useState(true)
      return (
        <>
          <GlassModal open={outer} onClose={() => setOuter(false)} title="Outer">
            <span>outer body</span>
          </GlassModal>
          <GlassModal open={inner} onClose={() => setInner(false)} title="Inner">
            <span>inner body</span>
          </GlassModal>
        </>
      )
    }
    render(<Nested />)
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('useConfirm', () => {
  it('resolves true for the button that goes ahead, false for Escape', async () => {
    const user = userEvent.setup()
    render(<ConfirmHost />)
    let answer: Promise<boolean> = Promise.resolve(false)
    act(() => {
      answer = confirmAction({ title: 'Remove this contact?', body: 'Ann Alder is removed from Alder Ltd.', confirmLabel: 'Remove contact', tone: 'danger' })
    })
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove this contact?' })
    // A danger question starts on the safe choice.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    expect(dialog.textContent).toContain('Ann Alder')
    await user.click(screen.getByRole('button', { name: 'Remove contact' }))
    await expect(answer).resolves.toBe(true)
    act(() => {
      answer = confirmAction({ title: 'Mark filed?', confirmLabel: 'Mark filed' })
    })
    await screen.findByRole('alertdialog')
    await user.keyboard('{Escape}')
    await expect(answer).resolves.toBe(false)
  })
})

describe('Segmented', () => {
  it('moves and chooses with the arrow keys', async () => {
    const user = userEvent.setup()
    function Harness(): JSX.Element {
      const [v, setV] = useState<'day' | 'night' | 'auto'>('day')
      return (
        <Segmented
          label="Theme mode"
          value={v}
          onChange={setV}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'night', label: 'Night' },
            { value: 'auto', label: 'Auto' }
          ]}
        />
      )
    }
    render(<Harness />)
    const day = screen.getByRole('radio', { name: 'Day' })
    expect(day.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Night' }).tabIndex).toBe(-1)
    day.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Night' }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Night' }))
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Auto' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('GlassTable', () => {
  interface Row {
    id: number
    name: string
    fee: number | null
  }
  const rows: Row[] = [
    { id: 1, name: 'beech & co', fee: 120000 },
    { id: 2, name: 'Alder Ltd', fee: null },
    { id: 3, name: 'Cedar LLP', fee: 50000 }
  ]
  const columns: Column<Row>[] = [
    { id: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
    { id: 'fee', header: 'Fee', cell: (r) => String(r.fee ?? ''), sortValue: (r) => r.fee, align: 'end' }
  ]
  const names = (): string[] => screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent ?? '')

  it('sorts by a column, ascending then descending then as given, with empties last', async () => {
    const user = userEvent.setup()
    render(<GlassTable caption="Clients" columns={columns} rows={rows} rowKey={(r) => r.id} />)
    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(names()).toEqual(['Alder Ltd', 'beech & co', 'Cedar LLP'])
    expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe('ascending')
    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(names()).toEqual(['Cedar LLP', 'beech & co', 'Alder Ltd'])
    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(names()).toEqual(['beech & co', 'Alder Ltd', 'Cedar LLP'])
    await user.click(screen.getByRole('button', { name: /Fee/ }))
    expect(names()).toEqual(['Cedar LLP', 'beech & co', 'Alder Ltd'])
  })

  it('moves between rows with the arrow keys and opens one with Enter', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<GlassTable caption="Clients" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={open} rowLabel={(r) => `Open ${r.name}`} />)
    const first = screen.getByRole('row', { name: 'Open beech & co' })
    expect(first.tabIndex).toBe(0)
    first.focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('row', { name: 'Open Alder Ltd' }))
    await user.keyboard('{End}{Enter}')
    expect(open).toHaveBeenCalledWith(rows[2])
  })

  it('shows its empty state when there are no rows', () => {
    render(<GlassTable caption="Clients" columns={columns} rows={[]} rowKey={(r) => r.id} empty={<p>No clients yet</p>} />)
    expect(screen.getByText('No clients yet')).toBeTruthy()
  })

  it('ticks rows for bulk actions', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    render(<GlassTable caption="Clients" columns={columns} rows={rows} rowKey={(r) => r.id} selectedKeys={new Set([2])} onSelectionChange={changed} rowLabel={(r) => r.name} />)
    await user.click(screen.getByRole('checkbox', { name: 'Tick every row' }))
    expect([...changed.mock.calls[0][0]].sort()).toEqual([1, 2, 3])
    await user.click(screen.getByRole('checkbox', { name: 'Tick: Alder Ltd' }))
    expect([...changed.mock.calls[1][0]]).toEqual([])
  })
})
