/**
 * The design gallery: every component of the design system in every state,
 * in the current colour theme and mode, with a switcher for both (it changes
 * your appearance, as Settings → Appearance does) — and every palette side
 * by side in Day and Night. This is how the system is reviewed. Every
 * control here works: buttons and rows say what was pressed.
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
  Bell,
  CalendarClock,
  Contrast,
  FileText,
  Hourglass,
  Inbox,
  Landmark,
  Mail,
  Moon,
  Palette as PaletteIcon,
  PartyPopper,
  Plus,
  Receipt,
  Save,
  Send,
  Sun,
  Trash2,
  Users
} from 'lucide-react'
import { MODE_LABELS, THEME_MODES, type ThemeMode } from '@shared/theme/appearance'
import { PALETTE_IDS, PALETTES, type PaletteId, type ResolvedMode } from '@shared/theme/palettes'
import type { CivilDate } from '@shared/domain/dates'
import {
  Amount,
  Avatar,
  Checkbox,
  DateInput,
  EmptyState,
  Field,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassModal,
  GlassPanel,
  GlassTable,
  Kbd,
  LoadProblem,
  Loading,
  MoneyInput,
  PageHeader,
  ProgressRing,
  RadioCards,
  Reference,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  StatTile,
  Tabs,
  TextArea,
  TextInput,
  Toggle,
  Tooltip,
  toast,
  useConfirm,
  type ButtonSize,
  type ButtonVariant,
  type Column,
  type RowKey,
  type Tone
} from '@renderer/components/ui'
import { cx } from '@renderer/lib/cx'
import { ThemeScope, useTheme } from '@renderer/theme'

const TONES: readonly Tone[] = ['neutral', 'accent', 'success', 'warning', 'danger', 'info']
const TONE_WORDS: Record<Tone, string> = { neutral: 'Draft', accent: 'Selected', success: 'Paid', warning: 'Due in 3 days', danger: 'Overdue', info: 'Filed' }

function pressed(what: string): void {
  toast.info(`${what} pressed`, { description: 'In the gallery, controls only say what they would do.' })
}

export default function DesignGallery(): JSX.Element {
  const { prefs, palette, mode, setPrefs } = useTheme()
  return (
    <>
      <PageHeader
        title="Design gallery"
        subtitle={`Every component, in ${palette.name} · ${MODE_LABELS[mode]}`}
        icon={PaletteIcon}
        actions={
          <>
            <Select
              aria-label="Colour theme"
              value={prefs.palette}
              onChange={(id) => setPrefs({ palette: id })}
              options={PALETTE_IDS.map((id) => ({ value: id, label: PALETTES[id].name }))}
              className="w-52"
            />
            <Segmented
              label="Mode"
              value={prefs.mode}
              onChange={(m: ThemeMode) => setPrefs({ mode: m })}
              options={THEME_MODES.map((m) => ({ value: m, label: MODE_LABELS[m], icon: m === 'day' ? Sun : m === 'night' ? Moon : Contrast }))}
            />
          </>
        }
      />
      <div className="flex flex-col gap-[var(--gap-section)]">
        <TokensCard />
        <TypeCard />
        <SurfacesCard />
        <ButtonsCard />
        <BadgesCard />
        <FormsCard />
        <ChoiceCard />
        <FiguresCard />
        <StatesCard />
        <OverlaysCard />
        <TableCard />
        <ChartsCard />
        <PalettesCard />
      </div>
    </>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <div className={cx('grid grid-cols-[9rem_minmax(0,1fr)] items-start gap-4 py-3 first:pt-0 last:pb-0', className)}>
      <p className="pt-2 text-xs font-medium leading-5 text-fg-muted">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">{children}</div>
    </div>
  )
}

function Chip({ name, cssVar, alpha }: { name: string; cssVar: string; alpha?: string }): JSX.Element {
  return (
    <span className="flex w-[7.5rem] flex-col gap-1.5">
      <span
        className="hairline block h-10 rounded-xl border shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)]"
        style={{ backgroundColor: alpha ? `rgb(var(${cssVar}) / var(${alpha}))` : `rgb(var(${cssVar}))` }}
        aria-hidden
      />
      <span className="truncate text-[11.5px] leading-4 text-fg-muted">{name}</span>
    </span>
  )
}

// ── Theme tokens ───────────────────────────────────────────────────────────

function TokensCard(): JSX.Element {
  return (
    <GlassCard title="Tokens" subtitle="The colour theme’s tokens as they are on screen now, at the chosen glass level" headingLevel={2}>
      <div className="divide-y divide-line/10">
        <Row label="Field and glass">
          <Chip name="Backdrop from" cssVar="--backdrop-1" />
          <Chip name="Backdrop via" cssVar="--backdrop-2" />
          <Chip name="Backdrop to" cssVar="--backdrop-3" />
          <Chip name="Glow A" cssVar="--glow-1" alpha="--glow-1-alpha" />
          <Chip name="Glow B" cssVar="--glow-2" alpha="--glow-2-alpha" />
          <Chip name="Surface (solid)" cssVar="--solid-surface" />
          <Chip name="Raised (solid)" cssVar="--solid-raised" />
          <Chip name="Sunken (solid)" cssVar="--solid-sunken" />
          <Chip name="Selected (solid)" cssVar="--solid-selected" />
        </Row>
        <Row label="Text">
          <Chip name="Text" cssVar="--text" />
          <Chip name="Muted" cssVar="--text-muted" />
          <Chip name="Faint" cssVar="--text-faint" />
        </Row>
        <Row label="Accent">
          <Chip name="Accent" cssVar="--accent" />
          <Chip name="Hover" cssVar="--accent-hover" />
          <Chip name="Pressed" cssVar="--accent-active" />
          <Chip name="Gradient from" cssVar="--accent-gradient-from" />
          <Chip name="Gradient to" cssVar="--accent-gradient-to" />
          <Chip name="Soft" cssVar="--accent-soft" alpha="--accent-soft-alpha" />
          <Chip name="Focus / accent text" cssVar="--focus" />
          <Chip name="Second accent" cssVar="--accent-2" />
        </Row>
        <Row label="Meaning">
          {(['success', 'warning', 'danger', 'info'] as const).map((t) => (
            <span key={t} className="contents">
              <Chip name={t.charAt(0).toUpperCase() + t.slice(1)} cssVar={`--${t}`} />
              <Chip name={`${t.charAt(0).toUpperCase() + t.slice(1)} soft`} cssVar={`--${t}-soft`} alpha={`--${t}-soft-alpha`} />
            </span>
          ))}
        </Row>
      </div>
    </GlassCard>
  )
}

// ── Type ───────────────────────────────────────────────────────────────────

function TypeCard(): JSX.Element {
  return (
    <GlassCard title="Type" subtitle="Inter for the interface and every figure; Source Serif 4 for page titles, client file headers and empty-state headlines" headingLevel={2}>
      <div className="divide-y divide-line/10">
        <Row label="Page title">
          <p className="font-serif text-[30px] font-semibold leading-tight tracking-[-0.015em] text-fg">Alder &amp; Beech Ltd</p>
        </Row>
        <Row label="Headings">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold tracking-[-0.01em] text-fg">A dialog heading, 18px</p>
            <p className="text-[15px] font-semibold text-fg">A card heading, 15px</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-muted">A section label</p>
          </div>
        </Row>
        <Row label="Body">
          <div className="flex max-w-xl flex-col gap-1">
            <p className="text-sm text-fg">Body text at 14px: the confirmation statement is due on 14 November 2026.</p>
            <p className="text-[13px] text-fg-muted">Secondary text at 13px: last filed 14 November 2025.</p>
            <p className="text-xs text-fg-subtle">Faint text for asides only: updated 3 minutes ago.</p>
          </div>
        </Row>
        <Row label="Figures">
          <div className="grid grid-cols-2 gap-x-10 gap-y-1 text-sm text-fg">
            <span className="text-fg-muted">Tabular, in tables</span>
            <span className="text-fg-muted">Proportional, for headline figures</span>
            <span className="tabular">111,111.11</span>
            <span className="text-[22px] font-semibold">£48,210</span>
            <span className="tabular">987,650.04</span>
            <span className="text-[22px] font-semibold">1,250 clients</span>
          </div>
        </Row>
        <Row label="Money">
          <Amount pence={125000} />
          <Amount pence={-124000} />
          <Amount pence={4821000} whole />
          <Amount pence={-1250} negative="minus" />
          <Amount pence={null} />
        </Row>
        <Row label="References">
          <span className="text-sm text-fg">
            UTR <Reference>10203 04050</Reference>
          </span>
          <span className="text-sm text-fg">
            Company <Reference>01230045</Reference>
          </span>
          <span className="text-sm text-fg">
            VAT <Reference>GB 100 2003 01</Reference>
          </span>
          <span className="text-sm text-fg">
            PAYE <Reference>120/IL10</Reference>
          </span>
        </Row>
        <Row label="Keys">
          <Kbd keys={['Ctrl', 'K']} />
          <Kbd>Esc</Kbd>
          <Kbd>Enter</Kbd>
          <Kbd keys={['Alt', '←']} />
        </Row>
      </div>
    </GlassCard>
  )
}

// ── Surfaces ───────────────────────────────────────────────────────────────

function SurfacesCard(): JSX.Element {
  return (
    <GlassCard title="Surfaces" subtitle="Cards sit on the main panel; menus and dialogs float higher; wells sink in" headingLevel={2}>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <GlassPanel padding="md">
          <p className="text-sm font-semibold text-fg">Card</p>
          <p className="mt-1 text-[13px] text-fg-muted">Raised glass on the panel, with a hairline and a top-edge highlight.</p>
        </GlassPanel>
        <GlassPanel tone="raised" padding="md">
          <p className="text-sm font-semibold text-fg">Raised</p>
          <p className="mt-1 text-[13px] text-fg-muted">Menus, popovers and dialogs: deeper blur, twice the shadow.</p>
        </GlassPanel>
        <GlassPanel tone="sunken" padding="md">
          <p className="text-sm font-semibold text-fg">Sunken</p>
          <p className="mt-1 text-[13px] text-fg-muted">Wells for inputs, tracks and quiet groups.</p>
        </GlassPanel>
        <GlassPanel
          padding="md"
          interactive
          role="button"
          tabIndex={0}
          onClick={() => pressed('The card')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              pressed('The card')
            }
          }}
        >
          <p className="text-sm font-semibold text-fg">Interactive</p>
          <p className="mt-1 text-[13px] text-fg-muted">Lifts towards the pointer. Press it.</p>
        </GlassPanel>
        {(['accent', 'success', 'warning', 'danger', 'info'] as const).map((tone) => (
          <GlassPanel key={tone} tone={tone} padding="md">
            <p className="text-sm font-semibold text-fg">{tone.charAt(0).toUpperCase() + tone.slice(1)} tint</p>
            <p className="mt-1 text-[13px] text-fg-muted">A banner or a note that needs a look.</p>
          </GlassPanel>
        ))}
        <GlassPanel padding="md" specular radius="2xl" className="xl:col-span-3">
          <p className="text-sm font-semibold text-fg">Primary panel with the pointer highlight</p>
          <p className="mt-1 text-[13px] text-fg-muted">With Glass effects on Full, a soft light follows the pointer across it, like light on a glass desk. Off on Balanced and Lite, and whenever motion or transparency is reduced.</p>
        </GlassPanel>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <GlassCard title="A card with everything" subtitle="Title, subtitle, actions and a footer" eyebrow="Engagement" actions={<GlassButton size="sm" icon={Plus} onClick={() => pressed('Add')}>Add</GlassButton>} footer={<p className="text-xs text-fg-muted">Last changed 20 Oct 2026 by Pat Partner</p>}>
          <p className="text-sm text-fg-muted">The card’s body. The footer’s hairline runs edge to edge.</p>
        </GlassCard>
        <GlassCard title="Compact padding" padding="sm" subtitle="padding sm">
          <p className="text-sm text-fg-muted">Density Compact takes a third off every card’s padding.</p>
        </GlassCard>
      </div>
    </GlassCard>
  )
}

// ── Buttons ────────────────────────────────────────────────────────────────

const VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger']
const SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg']

function ButtonsCard(): JSX.Element {
  const label: Record<ButtonVariant, string> = { primary: 'Raise invoice', secondary: 'Export', ghost: 'Cancel', danger: 'Remove contact' }
  const icon = { primary: Send, secondary: FileText, ghost: undefined, danger: Trash2 } as const
  return (
    <GlassCard title="Buttons" subtitle="Primary is the accent gradient; in Night every button lifts instead of lightening" headingLevel={2}>
      <div className="divide-y divide-line/10">
        {VARIANTS.map((v) => (
          <Row key={v} label={v.charAt(0).toUpperCase() + v.slice(1)}>
            {SIZES.map((s) => (
              <GlassButton key={s} variant={v} size={s} icon={icon[v]} onClick={() => pressed(label[v])}>
                {label[v]}
              </GlassButton>
            ))}
            <Tooltip content={label[v]} describe={false}>
              <GlassButton variant={v} iconOnly icon={icon[v] ?? Save} aria-label={label[v]} onClick={() => pressed(label[v])} />
            </Tooltip>
            <GlassButton variant={v} loading>
              Saving…
            </GlassButton>
            <GlassButton variant={v} disabled>
              Not available
            </GlassButton>
          </Row>
        ))}
        <Row label="Full width">
          <div className="w-full max-w-sm">
            <GlassButton variant="primary" size="lg" fullWidth icon={Send} onClick={() => pressed('Send 8 reminders')}>
              Send 8 reminders
            </GlassButton>
          </div>
        </Row>
      </div>
    </GlassCard>
  )
}

// ── Badges ─────────────────────────────────────────────────────────────────

function BadgesCard(): JSX.Element {
  return (
    <GlassCard title="Badges and status" subtitle="A status is a dot and its word in a soft pill — never colour alone, never a coloured row" headingLevel={2}>
      <div className="divide-y divide-line/10">
        <Row label="Status pills">
          {TONES.map((t) => (
            <GlassBadge key={t} tone={t} dot>
              {TONE_WORDS[t]}
            </GlassBadge>
          ))}
        </Row>
        <Row label="Labels">
          {TONES.map((t) => (
            <GlassBadge key={t} tone={t}>
              {t === 'neutral' ? 'Staff' : t === 'accent' ? 'Partner' : TONE_WORDS[t]}
            </GlassBadge>
          ))}
        </Row>
        <Row label="With icons, small">
          <GlassBadge size="sm" tone="info" icon={Landmark}>
            HMRC
          </GlassBadge>
          <GlassBadge size="sm" tone="accent" icon={Users}>
            12 clients
          </GlassBadge>
          <GlassBadge size="sm" tone="warning" icon={CalendarClock}>
            VAT due
          </GlassBadge>
          <GlassBadge size="sm">3</GlassBadge>
        </Row>
        <Row label="People">
          <Avatar name="Pat Partner" size="xs" />
          <Avatar name="Morgan Manager" size="sm" />
          <Avatar name="Sam Staff" size="md" />
          <Avatar name="Alex Alder" size="lg" />
        </Row>
      </div>
    </GlassCard>
  )
}

// ── Forms ──────────────────────────────────────────────────────────────────

function FormsCard(): JSX.Element {
  const [name, setName] = useState('Alder & Beech Ltd')
  const [number, setNumber] = useState('0123456')
  const [notes, setNotes] = useState('')
  const [type, setType] = useState<'' | 'company' | 'llp' | 'sole'>('')
  const [date, setDate] = useState<CivilDate | null>('2026-10-31')
  const [fee, setFee] = useState<number | null>(125000)
  const [feeError, setFeeError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [ticks, setTicks] = useState({ a: true, b: false })
  const [toggles, setToggles] = useState({ a: true, b: false })
  return (
    <GlassCard title="Form controls" subtitle="Labelled, described and checked as you type; a failing reference is kept with a warning" headingLevel={2}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-3">
        <Field label="Client name" hint="As registered at Companies House">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Company number" error={number.length === 8 ? null : 'Enter a company number of 8 characters.'}>
          <TextInput value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} className="ref-figures" />
        </Field>
        <Field label="UTR" warning="This UTR doesn’t pass its check. It is saved, and flagged for a look.">
          <TextInput defaultValue="1234567890" className="ref-figures" />
        </Field>
        <Field label="Client type">
          <Select
            value={type}
            onChange={setType}
            placeholder="Choose a type…"
            options={[
              { value: 'company', label: 'Company' },
              { value: 'llp', label: 'LLP' },
              { value: 'sole', label: 'Sole trader' }
            ]}
          />
        </Field>
        <Field label="Year end">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Annual fee" error={feeError}>
          <MoneyInput value={fee} onChange={setFee} onValidityChange={setFeeError} label="The fee" />
        </Field>
        <Field label="Trading name" optional>
          <TextInput placeholder="If different" />
        </Field>
        <Field label="Locked field" hint="Disabled">
          <TextInput value="Set by the licence" disabled readOnly />
        </Field>
        <Field label="Search">
          <SearchInput value={query} onChange={setQuery} label="Search clients" placeholder="Name, code or company number" shortcut="/" />
        </Field>
        <Field label="Notes" className="col-span-2 xl:col-span-3">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What was agreed on the call" />
        </Field>
      </div>
      <div className="hairline mt-6 grid grid-cols-2 gap-6 border-t pt-5">
        <div className="flex flex-col gap-3">
          <Checkbox label="Engagement letter signed" checked={ticks.a} onChange={(a) => setTicks((t) => ({ ...t, a }))} />
          <Checkbox label="AML check done" description="Customer due diligence, with ID seen" checked={ticks.b} onChange={(b) => setTicks((t) => ({ ...t, b }))} />
          <Checkbox label="Some of the group" checked={false} indeterminate onChange={() => pressed('The tick box')} />
          <Checkbox label="Not available" checked={false} disabled onChange={() => undefined} />
        </div>
        <div className="flex flex-col gap-4">
          <Toggle label="Daily Companies House check" description="Two minutes after the app starts" checked={toggles.a} onChange={(a) => setToggles((t) => ({ ...t, a }))} />
          <Toggle label="Desktop notifications" checked={toggles.b} onChange={(b) => setToggles((t) => ({ ...t, b }))} />
          <Toggle label="Not available here" description="Disabled" checked={false} disabled onChange={() => undefined} />
        </div>
      </div>
    </GlassCard>
  )
}

// ── Choices ────────────────────────────────────────────────────────────────

function ChoiceCard(): JSX.Element {
  const [seg, setSeg] = useState<'month' | 'week' | 'list'>('month')
  const [icons, setIcons] = useState<ThemeMode>('day')
  const [tab, setTab] = useState('overview')
  const [pill, setPill] = useState('open')
  const [card, setCard] = useState<'mailto' | 'smtp' | 'm365'>('mailto')
  return (
    <GlassCard title="Choices" subtitle="Segmented controls, tabs and choice cards: arrow keys move, Tab leaves" headingLevel={2}>
      <div className="divide-y divide-line/10">
        <Row label="Segmented">
          <Segmented
            label="Calendar view"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'list', label: 'List' }
            ]}
          />
          <Segmented
            label="Mode"
            value={icons}
            onChange={setIcons}
            iconOnly
            options={[
              { value: 'day', label: 'Day', icon: Sun },
              { value: 'night', label: 'Night', icon: Moon },
              { value: 'auto', label: 'Auto', icon: Contrast }
            ]}
          />
          <Segmented
            label="Small"
            size="sm"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'list', label: 'List', disabled: true }
            ]}
          />
        </Row>
        <Row label="Tabs">
          <div className="w-full">
            <Tabs
              label="Client file"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: 'Overview', icon: Inbox },
                { id: 'deadlines', label: 'Deadlines', icon: CalendarClock, badge: 4 },
                { id: 'billing', label: 'Billing', icon: Receipt },
                { id: 'comms', label: 'Communications', icon: Mail, badge: 12 },
                { id: 'wip', label: 'Work in progress', icon: Hourglass, disabled: true }
              ]}
            >
              <p className="text-sm text-fg-muted">The {tab} tab’s panel.</p>
            </Tabs>
          </div>
        </Row>
        <Row label="Pill tabs">
          <Tabs
            label="Task status"
            variant="pill"
            value={pill}
            onChange={setPill}
            panelClassName="pt-3"
            tabs={[
              { id: 'open', label: 'Open', badge: 18 },
              { id: 'progress', label: 'In progress', badge: 5 },
              { id: 'done', label: 'Done' }
            ]}
          >
            <p className="text-sm text-fg-muted">Showing {pill} tasks.</p>
          </Tabs>
        </Row>
        <Row label="Choice cards">
          <RadioCards
            label="How email is sent"
            value={card}
            onChange={setCard}
            columns={3}
            className="w-full"
            options={[
              { value: 'mailto', label: 'The PC’s mail app', description: 'Opens a new message; nothing to set up' },
              { value: 'smtp', label: 'SMTP', description: 'Your provider’s server and password' },
              { value: 'm365', label: 'Microsoft 365', description: 'Sign in once in the browser' }
            ]}
          />
        </Row>
      </div>
    </GlassCard>
  )
}

// ── Figures ────────────────────────────────────────────────────────────────

function FiguresCard(): JSX.Element {
  return (
    <GlassCard title="Figures" subtitle="Stat tiles count up once per session (never under reduced motion); every figure is real on real screens" headingLevel={2}>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Unbilled work" value="£48,210.00" hint="12 matters" icon={Hourglass} />
        <StatTile label="Owed over 60 days" value="£9,840.00" hint="4 clients" icon={Receipt} tone="warning" trend={{ direction: 'down', label: '£1,200 on last month', good: true }} />
        <StatTile label="Overdue deadlines" value="7" hint="2 this week" icon={CalendarClock} tone="danger" onClick={() => pressed('Overdue deadlines')} />
        <StatTile label="Live clients" value="1,250" hint="38 no longer clients" icon={Users} tone="accent" trend={{ direction: 'up', label: '+14 this quarter' }} />
        <StatTile label="Filed this month" value="31" icon={Landmark} tone="success" />
        <StatTile label="Notifications" value="3" icon={Bell} tone="info" />
        <StatTile label="Loading" value="—" loading />
        <StatTile label="As it is, no count-up" value="£2,400" countUp={false} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-6">
        <ProgressRing value={0} label="Setup progress" showValue />
        <ProgressRing value={35} label="Onboarding" showValue tone="warning" />
        <ProgressRing value={72} label="AML checks done" showValue size={56} thickness={5} />
        <ProgressRing value={100} label="Filed" showValue tone="success" />
        <ProgressRing value={88} label="Risk score" showValue tone="danger" size={64} thickness={6} />
      </div>
    </GlassCard>
  )
}

// ── States ─────────────────────────────────────────────────────────────────

function StatesCard(): JSX.Element {
  const [retrying, setRetrying] = useState(false)
  return (
    <GlassCard title="Loading, empty and problems" subtitle="Every screen that reads data shows one of these: never a blank panel or an endless spinner" headingLevel={2}>
      <div className="grid grid-cols-2 gap-4">
        <EmptyState
          title="No clients yet"
          body="Add your first client, or bring in the master workbook."
          icon={Users}
          action={
            <>
              <GlassButton variant="primary" icon={Plus} onClick={() => pressed('Add a client')}>
                Add a client
              </GlassButton>
              <GlassButton onClick={() => pressed('Import the workbook')}>Import the workbook</GlassButton>
            </>
          }
        />
        <LoadProblem
          error={new Error('The database is busy.')}
          message="The deadlines couldn’t be read because the database is busy with a backup. Try again in a moment."
          onRetry={() => {
            setRetrying(true)
            setTimeout(() => setRetrying(false), 1200)
          }}
          retrying={retrying}
        />
        <GlassPanel padding="md">
          <EmptyState size="sm" tone="success" icon={PartyPopper} title="Nothing overdue" body="Every deadline is filed or not yet due." />
        </GlassPanel>
        <GlassPanel padding="md">
          <LoadProblem size="sm" message="The Companies House check couldn’t reach the internet." onRetry={() => pressed('Try again')} />
        </GlassPanel>
        <GlassPanel padding="md" className="flex flex-col gap-4">
          <Loading label="Loading clients…" />
          <div className="flex items-center gap-6">
            <Loading size="sm" inline label="Small" />
            <Loading size="lg" inline label="Large" />
          </div>
        </GlassPanel>
        <GlassPanel padding="md" className="flex flex-col gap-4">
          <p className="text-[13px] text-fg-muted">Skeletons, for the shape of what is coming</p>
          <Skeleton lines={3} width="45%" />
          <Skeleton height={28} width="30%" />
        </GlassPanel>
      </div>
    </GlassCard>
  )
}

// ── Overlays ───────────────────────────────────────────────────────────────

function OverlaysCard(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Ann Alder')
  const confirm = useConfirm()
  return (
    <GlassCard title="Dialogs, questions, messages and hints" subtitle="Dialogs hold the keyboard until they close; a danger question starts on Cancel" headingLevel={2}>
      <div className="divide-y divide-line/10">
        <Row label="Dialog">
          <GlassButton icon={Users} onClick={() => setOpen(true)}>
            Edit a contact
          </GlassButton>
          <GlassModal
            open={open}
            onClose={() => setOpen(false)}
            title="Edit contact"
            description="Alder & Beech Ltd · CL0042"
            onSubmit={() => {
              setOpen(false)
              toast.success('Contact saved', { description: `${name} is up to date.` })
            }}
            footer={
              <>
                <GlassButton variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </GlassButton>
                <GlassButton variant="primary" type="submit" icon={Save}>
                  Save contact
                </GlassButton>
              </>
            }
          >
            <div className="flex flex-col gap-4 pt-2">
              <Field label="Name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Role" optional>
                <TextInput placeholder="Director, PSC, payroll contact…" />
              </Field>
            </div>
          </GlassModal>
        </Row>
        <Row label="Questions">
          <GlassButton
            variant="danger"
            icon={Trash2}
            onClick={() =>
              void confirm({ title: 'Remove this contact?', body: 'Ann Alder is removed from Alder & Beech Ltd. Their past emails stay in Communications.', confirmLabel: 'Remove contact', tone: 'danger' }).then((yes) =>
                yes ? toast.success('Contact removed') : toast.info('Nothing was removed')
              )
            }
          >
            Remove a contact
          </GlassButton>
          <GlassButton
            onClick={() =>
              void confirm({ title: 'Mark the VAT return filed?', body: 'Quarter to 30 Sep 2026, for Alder & Beech Ltd.', confirmLabel: 'Mark filed' }).then((yes) => (yes ? toast.success('VAT return marked filed') : undefined))
            }
          >
            Ask a question
          </GlassButton>
        </Row>
        <Row label="Messages">
          <GlassButton size="sm" onClick={() => toast.success('Client saved', { description: 'Alder & Beech Ltd is up to date.' })}>
            Success
          </GlassButton>
          <GlassButton size="sm" onClick={() => toast.info('Backup made', { description: 'Kept with the newest 14.' })}>
            Information
          </GlassButton>
          <GlassButton size="sm" onClick={() => toast.warning('The licence ends in 12 days', { action: { label: 'Renew', onClick: () => pressed('Renew') } })}>
            Warning
          </GlassButton>
          <GlassButton size="sm" onClick={() => toast.error('The backup couldn’t be made', { description: 'The backup folder is on a drive that isn’t connected.' })}>
            Problem
          </GlassButton>
        </Row>
        <Row label="Hints">
          {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
            <Tooltip key={side} content={`A hint on the ${side}`} side={side}>
              <GlassButton size="sm" variant="ghost" onClick={() => pressed(`The ${side} hint’s button`)}>
                Hint {side}
              </GlassButton>
            </Tooltip>
          ))}
        </Row>
      </div>
    </GlassCard>
  )
}

// ── Table ──────────────────────────────────────────────────────────────────

interface Invoice {
  id: number
  number: string
  client: string
  issued: string
  status: Tone
  amount: number
}

const INVOICES: readonly Invoice[] = [
  { id: 1, number: 'INV-20931', client: 'Alder & Beech Ltd', issued: '2026-10-02', status: 'success', amount: 125000 },
  { id: 2, number: 'INV-20932', client: 'Cedar Lane LLP', issued: '2026-10-05', status: 'warning', amount: 48000 },
  { id: 3, number: 'INV-20933', client: 'Dunmore Trust', issued: '2026-09-12', status: 'danger', amount: 310050 },
  { id: 4, number: 'INV-20934', client: 'Elm Street Bakery', issued: '2026-10-14', status: 'neutral', amount: 9600 },
  { id: 5, number: 'CRN-00102', client: 'Alder & Beech Ltd', issued: '2026-10-16', status: 'info', amount: -12500 }
]
const STATUS_WORD: Record<Tone, string> = { success: 'Paid', warning: 'Due in 3 days', danger: 'Overdue', neutral: 'Draft', info: 'Credit note', accent: 'Selected' }
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function TableCard(): JSX.Element {
  const [selected, setSelected] = useState<Set<RowKey>>(() => new Set([2]))
  const [dense, setDense] = useState(false)
  const [showEmpty, setShowEmpty] = useState(false)
  const columns = useMemo<Column<Invoice>[]>(
    () => [
      { id: 'number', header: 'Invoice', cell: (r) => <Reference>{r.number}</Reference>, sortValue: (r) => r.number, width: '9rem' },
      { id: 'client', header: 'Client', cell: (r) => <span className="font-medium">{r.client}</span>, sortValue: (r) => r.client },
      { id: 'issued', header: 'Issued', cell: (r) => dateFmt.format(new Date(`${r.issued}T00:00:00Z`)), sortValue: (r) => r.issued, hideBelow: 'lg' },
      {
        id: 'status',
        header: 'Status',
        cell: (r) => (
          <GlassBadge tone={r.status} dot size="sm">
            {STATUS_WORD[r.status]}
          </GlassBadge>
        ),
        sortValue: (r) => STATUS_WORD[r.status]
      },
      { id: 'amount', header: 'Amount', cell: (r) => <Amount pence={r.amount} />, sortValue: (r) => r.amount, align: 'end' }
    ],
    []
  )
  return (
    <GlassCard
      title="Table"
      subtitle="Sort by any heading; ↑ ↓ move between rows, Enter opens, Space ticks"
      headingLevel={2}
      actions={
        <>
          <Toggle label="Compact rows" checked={dense} onChange={setDense} />
          <Toggle label="Empty" checked={showEmpty} onChange={setShowEmpty} />
        </>
      }
    >
      <GlassTable
        caption="Invoices"
        columns={columns}
        rows={showEmpty ? [] : INVOICES}
        rowKey={(r) => r.id}
        onRowClick={(r) => pressed(`Invoice ${r.number}`)}
        rowLabel={(r) => `Open invoice ${r.number} for ${r.client}`}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        initialSort={{ columnId: 'issued', direction: 'desc' }}
        dense={dense}
        empty={<EmptyState size="sm" icon={Receipt} title="No invoices yet" body="Raise the first from a client’s Billing tab." />}
      />
      <div className="mt-4">
        <GlassTable caption="Invoices" columns={columns} rows={[]} rowKey={(r) => r.id} loading />
      </div>
    </GlassCard>
  )
}

// ── Charts ─────────────────────────────────────────────────────────────────

const BARS = [92, 74, 63, 55, 48, 40, 31, 22]

function ChartsCard(): JSX.Element {
  return (
    <GlassCard title="Chart colours" subtitle="Eight categorical colours led by the theme, a sequential ramp in the accent hue and a diverging scale with a grey middle" headingLevel={2}>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <figure>
          <svg viewBox="0 0 400 180" role="img" aria-label="Fees by service line, a sample chart in the theme’s categorical colours" className="h-48 w-full">
            {[0, 1, 2, 3].map((i) => (
              <line key={i} x1="0" x2="400" y1={20 + i * 45} y2={20 + i * 45} style={{ stroke: 'rgb(var(--text) / 0.08)' }} />
            ))}
            {BARS.map((h, i) => (
              <rect key={i} x={12 + i * 48} y={155 - h * 1.4} width="32" height={h * 1.4} rx="5" style={{ fill: `rgb(var(--chart-${i + 1}))` }} />
            ))}
            <line x1="0" x2="400" y1="155.5" y2="155.5" style={{ stroke: 'rgb(var(--text) / 0.25)' }} />
          </svg>
          <figcaption className="mt-1 text-xs text-fg-muted">Fees by service line (sample figures)</figcaption>
        </figure>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-fg-muted">Categorical, slots 1 to 8</p>
            <div className="flex gap-1.5">
              {BARS.map((_, i) => (
                <span key={i} className="h-7 flex-1 rounded-md" style={{ backgroundColor: `rgb(var(--chart-${i + 1}))` }} aria-hidden />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-fg-muted">Sequential: aged debt 0–30, 31–60, 61–90, 90+ days</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="h-7 flex-1 rounded-md" style={{ backgroundColor: `rgb(var(--chart-seq-${i}))` }} aria-hidden />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-fg-muted">Diverging: under budget to over budget</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="h-7 flex-1 rounded-md" style={{ backgroundColor: `rgb(var(--chart-div-${i}))` }} aria-hidden />
              ))}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}

// ── Every palette ──────────────────────────────────────────────────────────

function PalettesCard(): JSX.Element {
  const { prefs, setPrefs } = useTheme()
  return (
    <GlassCard title="Every colour theme, Day and Night" subtitle="Each drawn in its own tokens; choose one to use it" headingLevel={2}>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {PALETTE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPrefs({ palette: id })}
            aria-pressed={prefs.palette === id}
            className={cx('glass flex flex-col gap-2 rounded-2xl p-2.5 text-left', prefs.palette === id ? 'tint-accent ring-1 ring-accent/45' : 'lift')}
          >
            <span className="grid grid-cols-2 gap-1.5 overflow-hidden rounded-xl">
              <PaletteSample id={id} mode="night" />
              <PaletteSample id={id} mode="day" />
            </span>
            <span className="px-1">
              <span className="block text-[13.5px] font-semibold text-fg">{PALETTES[id].name}</span>
              <span className="block text-xs text-fg-muted">{PALETTES[id].tagline}</span>
            </span>
          </button>
        ))}
      </div>
    </GlassCard>
  )
}

function PaletteSample({ id, mode }: { id: PaletteId; mode: ResolvedMode }): JSX.Element {
  return (
    <ThemeScope as="span" palette={id} mode={mode} aria-hidden className="relative block h-28 overflow-hidden rounded-lg">
      <span className="app-backdrop backdrop-contained" />
      <span className="glass-panel absolute inset-1.5 flex flex-col gap-1.5 rounded-[9px] p-2">
        <span className="text-[10px] font-semibold leading-3 text-fg">£48,210</span>
        <span className="text-[8px] leading-[10px] text-fg-muted">Unbilled work</span>
        <span className="mt-auto flex h-7 items-end gap-[3px]">
          {[70, 52, 44, 36, 28].map((h, i) => (
            <span key={i} className="flex-1 rounded-[2px]" style={{ height: `${h}%`, backgroundColor: `rgb(var(--chart-${i + 1}))` }} />
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-[7px] w-[7px] rounded-full bg-success" />
          <span className="h-[7px] w-[7px] rounded-full bg-warning" />
          <span className="h-[7px] w-[7px] rounded-full bg-danger" />
          <span className="ml-auto h-3 w-9 rounded-[4px] bg-gradient-to-r from-accent-from to-accent-to" />
        </span>
      </span>
    </ThemeScope>
  )
}
