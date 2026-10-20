import { Contrast, Moon, Sun } from 'lucide-react'
import type { ThemeMode } from '@shared/theme/appearance'
import { useTheme } from '../../theme'
import { Segmented, type SegmentedOption } from '../ui'

const OPTIONS: readonly SegmentedOption<ThemeMode>[] = [
  { value: 'day', label: 'Day', icon: Sun },
  { value: 'night', label: 'Night', icon: Moon },
  { value: 'auto', label: 'Auto (follows Windows)', icon: Contrast }
]

/** Day, Night or Auto, from the sidebar's footer. */
export function ModeSwitch({ compact = true }: { compact?: boolean }): JSX.Element {
  const { prefs, setPrefs } = useTheme()
  return <Segmented label="Theme mode" value={prefs.mode} onChange={(mode) => setPrefs({ mode })} options={OPTIONS} iconOnly={compact} size="sm" />
}
