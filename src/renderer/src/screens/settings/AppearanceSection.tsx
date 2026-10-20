/**
 * Settings → Appearance, laid out like the brief: Day, Night and Auto as
 * cards, each with a live picture of the current colour theme in that mode;
 * the colour themes as cards with their three-colour gradient and a check on
 * the chosen one; then glass effects, density, and the comfort switches.
 * Saved for the person using this PC, shown at once (cross-fading unless
 * motion is reduced), and used before anyone signs in.
 */
import type { ReactNode } from 'react'
import {
  DENSITY_LABELS,
  DENSITY_LEVELS,
  DENSITY_TAGLINES,
  EFFECTS_LABELS,
  EFFECTS_LEVELS,
  EFFECTS_TAGLINES,
  MODE_LABELS,
  MODE_TAGLINES,
  THEME_MODES,
  type ThemeMode
} from '@shared/theme/appearance'
import { PALETTE_IDS, PALETTES, prose, type PaletteId, type ResolvedMode } from '@shared/theme/palettes'
import { RadioCards, Segmented, Toggle } from '@renderer/components/ui'
import { ThemeScope, useTheme } from '@renderer/theme'

export default function AppearanceSection(): JSX.Element {
  const { prefs, palette, setPrefs, reducedMotion, reducedTransparency, osDark } = useTheme()
  const windowsAsksStill = reducedMotion && !prefs.reduceMotion
  const windowsAsksSolid = reducedTransparency && !prefs.reduceTransparency

  return (
    <div className="flex flex-col gap-9">
      <p className="-mt-2 text-[13px] leading-5 text-fg-muted">Saved for you on this PC, and used on the sign-in screen too. Changes show at once.</p>

      <Section id="appearance-mode" title="Mode">
        <RadioCards
          labelledBy="appearance-mode"
          value={prefs.mode}
          onChange={(mode) => setPrefs({ mode })}
          columns={3}
          choiceAttribute="data-mode-choice"
          options={THEME_MODES.map((m) => ({
            value: m,
            label: MODE_LABELS[m],
            description: m === 'auto' ? `${MODE_TAGLINES.auto} (now ${osDark ? 'Night' : 'Day'})` : MODE_TAGLINES[m],
            preview: <ModePreview palette={prefs.palette} mode={m} />
          }))}
        />
      </Section>

      <Section id="appearance-theme" title="Colour theme" note={<>{palette.name} suits {lowerFirst(prose(palette.recommendedFor))}</>}>
        <RadioCards
          labelledBy="appearance-theme"
          value={prefs.palette}
          onChange={(id) => setPrefs({ palette: id })}
          columns={4}
          choiceAttribute="data-palette-choice"
          options={PALETTE_IDS.map((id) => ({ value: id, label: PALETTES[id].name, description: PALETTES[id].tagline, preview: <Swatch id={id} /> }))}
        />
      </Section>

      <div className="grid gap-9 xl:grid-cols-2">
        <Section id="appearance-effects" title="Glass effects" note={windowsAsksSolid || prefs.reduceTransparency ? 'Reduce transparency is on, so every surface is solid whatever is chosen here.' : EFFECTS_TAGLINES[prefs.effects]}>
          <Segmented label="Glass effects" value={prefs.effects} onChange={(effects) => setPrefs({ effects })} options={EFFECTS_LEVELS.map((e) => ({ value: e, label: EFFECTS_LABELS[e] }))} fullWidth />
        </Section>
        <Section id="appearance-density" title="Density" note={DENSITY_TAGLINES[prefs.density]}>
          <Segmented label="Density" value={prefs.density} onChange={(density) => setPrefs({ density })} options={DENSITY_LEVELS.map((d) => ({ value: d, label: DENSITY_LABELS[d] }))} fullWidth />
        </Section>
      </div>

      <Section id="appearance-comfort" title="Comfort">
        <div className="hairline flex flex-col divide-y divide-line/10 rounded-2xl border">
          <Toggle
            className="px-4 py-3.5"
            label="Reduce motion"
            description={windowsAsksStill ? 'Windows already asks for less movement, so the app keeps still whatever this says.' : 'No count-ups, cross-fades or sliding: changes simply appear.'}
            checked={prefs.reduceMotion}
            onChange={(reduceMotion) => setPrefs({ reduceMotion })}
          />
          <Toggle
            className="px-4 py-3.5"
            label="Reduce transparency"
            description={windowsAsksSolid ? 'Windows already has transparency effects off, so surfaces are solid whatever this says.' : 'Solid surfaces instead of glass, with stronger edges. Easier on older PCs too.'}
            checked={prefs.reduceTransparency}
            onChange={(reduceTransparency) => setPrefs({ reduceTransparency })}
          />
        </div>
      </Section>
    </div>
  )
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-muted">
        {title}
      </h3>
      {children}
      {note && <p className="mt-2.5 text-[13px] leading-5 text-fg-muted">{note}</p>}
    </section>
  )
}

/** The palette's three colours as one gradient: deep, accent, sheen. */
function Swatch({ id }: { id: PaletteId }): JSX.Element {
  const [deep, accent, sheen] = PALETTES[id].swatches
  return (
    <span
      aria-hidden
      className="block h-[68px] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.28),inset_0_-12px_24px_-12px_rgb(0_0_0/0.25)]"
      style={{ backgroundImage: `linear-gradient(135deg, ${deep} 0%, ${accent} 58%, ${sheen} 108%)` }}
    />
  )
}

/** A small window in the current colour theme, in one mode (Auto: Day and Night, split across). */
function ModePreview({ palette, mode }: { palette: PaletteId; mode: ThemeMode }): JSX.Element {
  if (mode !== 'auto') return <MiniWindow palette={palette} mode={mode} />
  return (
    <span className="relative block">
      <MiniWindow palette={palette} mode="day" />
      <span className="absolute inset-0 block" style={{ clipPath: 'polygon(56% 0, 100% 0, 100% 100%, 44% 100%)' }}>
        <MiniWindow palette={palette} mode="night" />
      </span>
    </span>
  )
}

function MiniWindow({ palette, mode }: { palette: PaletteId; mode: ResolvedMode }): JSX.Element {
  return (
    <ThemeScope as="span" palette={palette} mode={mode} aria-hidden className="relative block h-[86px] overflow-hidden">
      <span className="app-backdrop backdrop-contained" />
      <span className="glass-panel absolute bottom-2 left-2 top-2 w-[24%] rounded-[9px]" />
      <span className="glass absolute left-[calc(24%+14px)] right-2 top-2 h-[34%] rounded-[9px]" />
      <span className="absolute bottom-2 left-[calc(24%+14px)] right-2 h-[38%] rounded-[9px] bg-gradient-to-r from-accent-from to-accent-to shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]" />
    </ThemeScope>
  )
}
