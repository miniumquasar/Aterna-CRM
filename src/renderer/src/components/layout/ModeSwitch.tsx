import { Contrast, Moon, Sun } from 'lucide-react'
import type { ThemeMode } from '@shared/theme/appearance'
import { useTheme } from '../../theme'
import { Segmented, type SegmentedOption } from '../ui'

const OPTIONS: readonly SegmentedOption<ThemeMode>[] = [
  { value: 'day', label: 'Day', icon: Sun, hint: 'Day: bright and crisp' },
  { value: 'night', label: 'Night', icon: Moon, hint: 'Night: easy on the eyes' },
  { value: 'auto', label: 'Auto (follows Windows)', icon: Contrast, hint: 'Auto: follows Windows' }
]

/**
 * Day, Night or Auto — the sun, moon and half circle in the sidebar's footer,
 * as in the brief. `compact` (default) shows the icons only, across the width.
 */
export function ModeSwitch({ compact = true }: { compact?: boolean }): JSX.Element {
  const { prefs, setPrefs } = useTheme()
  return (
    <Segmented
      label="Theme mode"
      value={prefs.mode}
      onChange={(mode) => setPrefs({ mode })}
      options={OPTIONS}
      iconOnly={compact}
      fullWidth={compact}
      tooltipSide="top"
      size="md"
    />
  )
}
