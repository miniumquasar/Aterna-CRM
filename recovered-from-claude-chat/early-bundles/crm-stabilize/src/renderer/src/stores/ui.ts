import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * All navigable screens in the CRM shell. The v5 blueprint keeps navigation
 * in a dedicated store, but the original AetherSidebar imports this type
 * as `NavRoute` so we continue to export it under that name — and we also
 * re-export as `Screen` for the v5-native call sites that use the
 * `setScreen()` verb.
 */
export type NavRoute =
  | 'dashboard'
  | 'clients'
  | 'companies'
  | 'tasks'
  | 'calendar'
  | 'wip'
  | 'hmrc'
  | 'aml'
  | 'communications'
  | 'interactions'
  | 'payments'
  | 'reports'
  | 'documents'
  | 'email-templates'
  | 'client-onboarding'
  | 'ai-assistant'
  | 'spatial'
  | 'settings'
  | 'pulse'
  | 'sentinel'
  | 'oracle'
  | 'fortress'

export type Screen = NavRoute

export type HardwareTier = 'BEAST' | 'STANDARD' | 'LITE'

type ThemeMode = 'light' | 'dark' | 'system'
type UiStyle = 'glass' | 'bento' | 'neumorphic' | 'clay' | 'skeuo' | 'neo'

interface UiState {
  // ── Awakening (splash) ──────────────────────────────────────────────────
  awakeningComplete: boolean
  setAwakeningComplete: (v: boolean) => void

  // ── Navigation ──────────────────────────────────────────────────────────
  activeRoute: NavRoute
  selectedClientId: number | null
  /** Go to a specific screen; optionally carries a selected client id. */
  navigateTo: (route: NavRoute, clientId?: number | null) => void
  /** Back-compat alias for Companies.tsx and other historic call sites. */
  setScreen: (route: NavRoute) => void
  openClientDetail: (id: number) => void
  returnToDashboard: () => void

  // ── Appearance & design system ──────────────────────────────────────────
  theme: ThemeMode
  uiStyle: UiStyle
  hidePrivateData: boolean
  setTheme: (t: ThemeMode) => void
  setUiStyle: (s: UiStyle) => void
  togglePrivateData: () => void

  // ── Hardware tier (user override of auto-detected) ──────────────────────
  hardwareTier: HardwareTier
  setHardwareTier: (tier: HardwareTier) => void

  // ── Modals ──────────────────────────────────────────────────────────────
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  dataLakeOpen: boolean
  setDataLakeOpen: (open: boolean) => void
  commandMenuOpen: boolean
  setCommandMenuOpen: (open: boolean) => void

  // ── First-run orchestration ─────────────────────────────────────────────
  firstRunComplete: boolean
  setFirstRunComplete: (v: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      awakeningComplete: false,
      setAwakeningComplete: (v) => set({ awakeningComplete: v }),

      activeRoute: 'dashboard',
      selectedClientId: null,
      navigateTo: (route, clientId = null) =>
        set({ activeRoute: route, selectedClientId: clientId }),
      setScreen: (route) => set({ activeRoute: route, selectedClientId: null }),
      openClientDetail: (id) => set({ activeRoute: 'dashboard', selectedClientId: id }),
      returnToDashboard: () => set({ activeRoute: 'dashboard', selectedClientId: null }),

      theme: 'system',
      uiStyle: 'glass',
      hidePrivateData: false,
      setTheme: (theme) => set({ theme }),
      setUiStyle: (uiStyle) => set({ uiStyle }),
      togglePrivateData: () => set((s) => ({ hidePrivateData: !s.hidePrivateData })),

      hardwareTier: 'STANDARD',
      setHardwareTier: (tier) => set({ hardwareTier: tier }),

      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      dataLakeOpen: false,
      setDataLakeOpen: (open) => set({ dataLakeOpen: open }),
      commandMenuOpen: false,
      setCommandMenuOpen: (open) => set({ commandMenuOpen: open }),

      firstRunComplete: false,
      setFirstRunComplete: (v) => set({ firstRunComplete: v })
    }),
    {
      name: 'aeterna-ui-state',
      // Only persist appearance + first-run flags, never transient UI state.
      partialize: (s) => ({
        awakeningComplete: s.awakeningComplete,
        theme: s.theme,
        uiStyle: s.uiStyle,
        hidePrivateData: s.hidePrivateData,
        hardwareTier: s.hardwareTier,
        firstRunComplete: s.firstRunComplete
      })
    }
  )
)
