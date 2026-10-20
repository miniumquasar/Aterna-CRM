/**
 * Settings → Appearance: Day, Night or Auto; the colour theme; effects;
 * reduce motion and transparency. Saved for the person using this PC.
 * Owned by the design domain, which lays it out like the brief.
 */
import { Check, Contrast, Moon, Sun, type LucideIcon } from 'lucide-react'
import { EFFECTS_LABELS, EFFECTS_LEVELS, type ThemeMode } from '@shared/theme/appearance'
import { PALETTE_IDS, PALETTES } from '@shared/theme/palettes'
import { Segmented, Toggle } from '@renderer/components/ui'
import { cx } from '@renderer/lib/cx'
import { useTheme } from '@renderer/theme'

const MODES: ReadonlyArray<{ value: ThemeMode; label: string; hint: string; icon: LucideIcon }> = [
  { value: 'day', label: 'Day', hint: 'Light glass', icon: Sun },
  { value: 'night', label: 'Night', hint: 'Deep glass', icon: Moon },
  { value: 'auto', label: 'Auto', hint: 'Follows Windows', icon: Contrast }
]

export default function AppearanceSection(): JSX.Element {
  const { prefs, mode, setPrefs } = useTheme()
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="appearance-mode">
        <h3 id="appearance-mode" className="mb-3 text-sm font-semibold text-fg">
          Mode
        </h3>
        <div role="radiogroup" aria-labelledby="appearance-mode" className="grid grid-cols-3 gap-3">
          {MODES.map((m) => {
            const selected = prefs.mode === m.value
            const Icon = m.icon
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={selected}
                data-mode-choice={m.value}
                onClick={() => setPrefs({ mode: m.value })}
                className={cx(
                  'glass relative flex items-center gap-3 rounded-2xl p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                  selected ? '!border-accent/60 ring-1 ring-accent/40' : 'hover:bg-fg/[0.05]'
                )}
              >
                <Icon size={20} aria-hidden className={selected ? 'text-accent-text' : 'text-fg-subtle'} />
                <span>
                  <span className="block text-sm font-medium text-fg">{m.label}</span>
                  <span className="block text-xs text-fg-subtle">{m.hint}</span>
                </span>
                {selected && <Check size={16} aria-hidden className="absolute right-3 top-3 text-accent-text" />}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="appearance-theme">
        <h3 id="appearance-theme" className="mb-3 text-sm font-semibold text-fg">
          Colour theme
        </h3>
        <div role="radiogroup" aria-labelledby="appearance-theme" className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {PALETTE_IDS.map((id) => {
            const p = PALETTES[id]
            const t = p[mode]
            const selected = prefs.palette === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-palette-choice={id}
                onClick={() => setPrefs({ palette: id })}
                className={cx(
                  'glass relative overflow-hidden rounded-2xl p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                  selected ? '!border-accent/60 ring-1 ring-accent/40' : 'hover:bg-fg/[0.05]'
                )}
              >
                <span
                  aria-hidden
                  className="mb-3 block h-16 rounded-xl"
                  style={{ background: `linear-gradient(135deg, ${t.backdrop[0]} 0%, ${t.backdrop[1]} 50%, ${t.backdrop[2]} 100%)` }}
                >
                  <span className="flex h-full items-end gap-1.5 p-2.5">
                    <span className="h-4 w-4 rounded-full ring-2 ring-white/30" style={{ background: t.accent }} />
                    <span className="h-4 w-4 rounded-full ring-2 ring-white/30" style={{ background: t.accent2 }} />
                  </span>
                </span>
                <span className="block text-sm font-medium text-fg">{p.name}</span>
                <span className="block text-xs text-fg-subtle">{p.description}</span>
                {selected && (
                  <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg" aria-hidden>
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="appearance-effects" className="flex flex-col gap-4">
        <h3 id="appearance-effects" className="text-sm font-semibold text-fg">
          Effects
        </h3>
        <Segmented
          label="Effects"
          value={prefs.effects}
          onChange={(effects) => setPrefs({ effects })}
          options={EFFECTS_LEVELS.map((e) => ({ value: e, label: EFFECTS_LABELS[e] }))}
        />
        <p className="-mt-2 text-xs text-fg-subtle">Lite turns off the glass blur, for modest PCs.</p>
        <Toggle label="Reduce motion" description="Fewer animations, and none that move across the screen." checked={prefs.reduceMotion} onChange={(reduceMotion) => setPrefs({ reduceMotion })} />
        <Toggle label="Reduce transparency" description="Solid surfaces instead of glass." checked={prefs.reduceTransparency} onChange={(reduceTransparency) => setPrefs({ reduceTransparency })} />
      </section>
    </div>
  )
}
