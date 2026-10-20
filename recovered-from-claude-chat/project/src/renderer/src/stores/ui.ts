import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI Store — everything that's not data and not auth: which screen is open,
 * the look chosen on this computer, and the few dialogs other screens open.
 */

import type { NavRoute } from '@renderer/navigation/routes'
import type { HardwareTier } from '@aether/hardware-profile'

export type { NavRoute, HardwareTier }

/** The tiers hardware-profile.ts produces; anything else read back from storage falls back to STANDARD. */
const HARDWARE_TIERS: readonly HardwareTier[] = ['LITE', 'STANDARD', 'SOVEREIGN']

export type ThemeMode = 'light' | 'dark' | 'system'
export type UiStyleName =
  | 'glass'
  | 'bento'
  | 'neumorphic'
  | 'clay'
  | 'skeuo'
  | 'neo'

interface UiState {
  // Navigation
  activeRoute: NavRoute
  navigateTo: (route: NavRoute) => void

  // Appearance & design system
  theme: ThemeMode
  uiStyle: UiStyleName
  hidePrivateData: boolean
  setTheme: (t: ThemeMode) => void
  setUiStyle: (s: UiStyleName) => void
  togglePrivateData: () => void

  // Hardware tier: detected at start-up until the user chooses one in Settings
  hardwareTier: HardwareTier
  setHardwareTier: (tier: HardwareTier) => void
  hardwareTierChosen: boolean
  chooseHardwareTier: (tier: HardwareTier) => void

  /** The go-to palette (⌘K / Ctrl+K). */
  goToOpen: boolean
  setGoToOpen: (open: boolean) => void
  /** The encryption key's recovery sheet dialog (opened from Settings → Backups too). */
  recoverySheetOpen: boolean
  setRecoverySheetOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeRoute: 'dashboard',
      navigateTo: (route) => set({ activeRoute: route, goToOpen: false }),

      theme: 'system',
      uiStyle: 'glass',
      hidePrivateData: false,
      setTheme: (theme) => set({ theme }),
      setUiStyle: (uiStyle) => set({ uiStyle }),
      togglePrivateData: () => set((s) => ({ hidePrivateData: !s.hidePrivateData })),

      hardwareTier: 'STANDARD',
      setHardwareTier: (tier) => set({ hardwareTier: tier }),
      hardwareTierChosen: false,
      chooseHardwareTier: (tier) => set({ hardwareTier: tier, hardwareTierChosen: true }),

      goToOpen: false,
      setGoToOpen: (open) => set({ goToOpen: open }),

      recoverySheetOpen: false,
      setRecoverySheetOpen: (open) => set({ recoverySheetOpen: open })
    }),
    {
      name: 'companies-house-crm.ui',
      partialize: (s) => ({
        theme: s.theme,
        uiStyle: s.uiStyle,
        hidePrivateData: s.hidePrivateData,
        hardwareTier: s.hardwareTier,
        hardwareTierChosen: s.hardwareTierChosen
      }),
      // A tier saved by an older build may not be one the renderer knows. Fall back rather than crash.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UiState>
        return {
          ...current,
          theme: saved.theme ?? current.theme,
          uiStyle: saved.uiStyle ?? current.uiStyle,
          hidePrivateData: saved.hidePrivateData ?? current.hidePrivateData,
          hardwareTierChosen: saved.hardwareTierChosen ?? current.hardwareTierChosen,
          hardwareTier: saved.hardwareTier && HARDWARE_TIERS.includes(saved.hardwareTier) ? saved.hardwareTier : current.hardwareTier
        }
      }
    }
  )
)
