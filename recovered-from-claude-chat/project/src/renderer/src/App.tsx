import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { AetherSidebar, AetherTitleBar, GodRays, detectHardwareProfile, EASE_PREMIUM } from '@aether/index'
import type { SessionUserInfo, SystemStatus } from '@shared/types'
import { ErrorBoundary } from '@renderer/components/errors/ErrorBoundary'
import { ConfirmHost } from '@renderer/components/ui/Confirm'
import { ComingSoon } from '@renderer/screens/ComingSoon'
import { Home, GO_TO_KEYS } from '@renderer/screens/Home'
import { Clients } from '@renderer/screens/crm/Clients'
import { Companies } from '@renderer/screens/crm/Companies'
import { HMRC } from '@renderer/screens/crm/HMRC'
import { AML } from '@renderer/screens/crm/AML'
import { AIAssistant } from '@renderer/screens/crm/AIAssistant'
import { Tasks } from '@renderer/screens/crm/Tasks'
import { WIP } from '@renderer/screens/crm/WIP'
import { Interactions } from '@renderer/screens/crm/Interactions'
import { CommunicationsHub } from '@renderer/screens/crm/CommunicationsHub'
import { Calendar } from '@renderer/screens/crm/Calendar'
import { Payments } from '@renderer/screens/crm/Payments'
import { Reports } from '@renderer/screens/crm/Reports'
import { EmailTemplatesEditor } from '@renderer/screens/crm/EmailTemplatesEditor'
import { Settings } from '@renderer/screens/crm/Settings'
import { Licence } from '@renderer/screens/crm/Licence'
import { OnboardingGaps } from '@renderer/screens/crm/OnboardingGaps'
import { PracticeDetails } from '@renderer/screens/crm/PracticeDetails'
import { ClientReferences } from '@renderer/screens/crm/ClientReferences'
import { ClientFile } from '@renderer/screens/crm/ClientFile'
import { DataExplorer } from '@renderer/screens/crm/DataExplorer'
import { ImportScreen } from '@renderer/screens/crm/Import'
import { About } from '@renderer/screens/crm/About'
import { SetupWizard } from '@renderer/screens/setup/SetupWizard'
import { SignIn } from '@renderer/screens/auth/SignIn'
import { LicenceBanner } from '@renderer/components/licence/LicenceBanner'
import { DatabaseStatusBanner } from '@renderer/components/system/DatabaseStatusBanner'
import { RecoveryPrompt } from '@renderer/components/recovery/RecoveryPrompt'
import { ScreenHeader, screenTitle } from '@renderer/components/layout/ScreenTabs'
import { GoToPalette } from '@renderer/components/navigation/GoToPalette'
import { Splash } from '@renderer/components/Splash'
import { licenceLabel, licenceTitle, useLicence } from '@renderer/hooks/useLicence'
import { useMotionLevel } from '@renderer/lib/motion'
import { SKIP_SPLASH } from '@renderer/lib/session'
import { isNavRoute, type NavRoute } from '@renderer/navigation/routes'
import { useUiStore } from '@renderer/stores/ui'
import { useAuthStore } from '@renderer/stores/crm/auth'

/** The screens still to be built: what each will show. */
const MODULES = {
  pulse: {
    title: 'Activity',
    module: 'Pulse',
    description: 'Today’s changes — imports, edits, filings and deadlines — Companies House changes for your clients, and the health of the database, backups and licence.'
  },
  sentinel: {
    title: 'Risk',
    module: 'Sentinel',
    description: 'Clients ranked by risk: overdue deadlines, open data issues, missing AML checks or engagement letters, missing or expiring authorisations, and Companies House warnings such as strike-off notices.'
  },
  oracle: {
    title: 'Forecast',
    module: 'Oracle',
    description: 'Deadlines and workload by month and by person, expected fees and work in progress, a cash view from invoices and receipts, and an optional summary from the AI on this computer.'
  },
  fortress: {
    title: 'Security',
    module: 'Fortress',
    description: 'People and roles, sign-in history, the vault, the recovery sheet, backups, the audit log and the licence, in one place.'
  }
} as const

/** The screen for a route. */
function ScreenFor({ route, navigate, openGoTo }: { route: NavRoute; navigate: (r: NavRoute) => void; openGoTo: () => void }): JSX.Element {
  switch (route) {
    case 'dashboard':
      return <Home onGoTo={openGoTo} />
    case 'clients':
      return <Clients />
    case 'client-file':
      return <ClientFile />
    case 'companies':
      return <Companies />
    case 'tasks':
      return <Tasks />
    case 'calendar':
      return <Calendar />
    case 'communications':
      return <CommunicationsHub />
    case 'interactions':
      return <Interactions />
    case 'email-templates':
      return <EmailTemplatesEditor />
    case 'compliance':
      return (
        <div className="space-y-10">
          <HMRC />
          <AML />
        </div>
      )
    case 'onboarding-gaps':
      return <OnboardingGaps />
    case 'references':
      return <ClientReferences />
    case 'payments':
      return <Payments />
    case 'wip':
      return <WIP />
    case 'reports':
      return <Reports />
    case 'settings':
      return <Settings />
    case 'practice':
      return <PracticeDetails />
    case 'data':
      return <DataExplorer />
    case 'import':
      return <ImportScreen />
    case 'licence':
      return <Licence />
    case 'ai':
      return <AIAssistant />
    case 'about':
      return <About onOpenLicence={() => navigate('licence')} />
    case 'pulse':
    case 'sentinel':
    case 'oracle':
    case 'fortress':
      return <ComingSoon {...MODULES[route]} />
    default: {
      const unhandled: never = route
      return <p className="text-sm text-white/50">Unknown screen {String(unhandled)}.</p>
    }
  }
}

/** Skip the splash once after a sign-out (lib/session.ts reloads the window). */
function splashAlreadyShown(): boolean {
  try {
    if (sessionStorage.getItem(SKIP_SPLASH)) {
      sessionStorage.removeItem(SKIP_SPLASH)
      return true
    }
  } catch {
    /* storage unavailable: show the splash */
  }
  return false
}

/**
 * App.tsx — the shell: the launch splash, then sign-in or the setup wizard,
 * then the sidebar, title bar and the open screen. Every risky part has its
 * own error boundary, so one failing screen never takes the app down.
 */
function AppShell(): JSX.Element {
  const activeRoute = useUiStore((s) => s.activeRoute)
  const navigateTo = useUiStore((s) => s.navigateTo)
  const hardwareTier = useUiStore((s) => s.hardwareTier)
  const setHardwareTier = useUiStore((s) => s.setHardwareTier)
  const goToOpen = useUiStore((s) => s.goToOpen)
  const setGoToOpen = useUiStore((s) => s.setGoToOpen)
  const motionLevel = useMotionLevel()

  // How much movement the whole window may use, for the styles too (index.css): none under
  // reduced motion or Visual effects: Lite.
  useEffect(() => {
    document.documentElement.dataset.motion = motionLevel
  }, [motionLevel])

  // Whose licence this is shows in the window's title and the title bar, on every screen.
  const { status: licence } = useLicence()
  useEffect(() => {
    document.title = licenceTitle(licence)
  }, [licence])

  // Detect the hardware tier once per start, unless the user has chosen one in Settings.
  const hasDetectedTier = useRef(false)
  useEffect(() => {
    if (hasDetectedTier.current || useUiStore.getState().hardwareTierChosen) return
    hasDetectedTier.current = true
    void detectHardwareProfile().then((profile) => {
      if (!useUiStore.getState().hardwareTierChosen) setHardwareTier(profile.tier)
    })
  }, [setHardwareTier])

  const [splashDone, setSplashDone] = useState(splashAlreadyShown)
  const finishSplash = useCallback(() => setSplashDone(true), [])

  // Who is signed in is the main process's answer, never a value saved in the page.
  const user = useAuthStore((s) => s.user)
  const [authChecked, setAuthChecked] = useState(false)
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [inSetup, setInSetup] = useState(false)
  useEffect(() => {
    void (async () => {
      const [s, sys] = await Promise.all([window.api.auth.status(), window.api.getSystemStatus().catch(() => null)])
      const mode = sys && sys.ok ? sys.data : null
      setSystem(mode)
      // A new installation sets up first; a locked database is unlocked on the sign-in screen instead.
      // A partner still signed in (the window was reloaded part-way through) carries on with setup.
      let setup = s.firstRun && mode?.mode !== 'locked'
      if (!setup && s.user?.role === 'partner') {
        const r = await window.api.setup.status().catch(() => null)
        setup = !!r?.ok && !r.data.complete
      }
      if (s.user) useAuthStore.getState().setUser(s.user)
      else useAuthStore.getState().clear()
      setInSetup(setup)
      setAuthChecked(true)
    })()
  }, [])

  /** After signing in: a partner carries on with setup if it isn't finished. */
  const signedIn = useCallback(async (person: SessionUserInfo) => {
    useAuthStore.getState().setUser(person)
    if (person.role !== 'partner') return
    const r = await window.api.setup.status().catch(() => null)
    if (r?.ok && !r.data.complete) setInSetup(true)
  }, [])

  // Go to… : Ctrl K, or ⌘K on a Mac.
  const shellOpen = !!user && !inSetup
  useEffect(() => {
    if (!shellOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setGoToOpen(!useUiStore.getState().goToOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shellOpen, setGoToOpen])

  // Automation hook for navigation only; there is no way round signing in.
  useEffect(() => {
    ;(window as unknown as { __setScreen?: (target: string) => void }).__setScreen = (target: string) => {
      if (isNavRoute(target)) navigateTo(target)
    }
  }, [navigateTo])

  if (!splashDone) {
    return (
      <ErrorBoundary errorBoundaryName="Splash" onReset={finishSplash}>
        <Splash onDone={finishSplash} />
      </ErrorBoundary>
    )
  }

  if (!authChecked) return <div className="h-screen w-screen bg-void" aria-busy="true" />

  if (inSetup) {
    return (
      <ErrorBoundary errorBoundaryName="Setup">
        <SetupWizard
          user={user}
          system={system}
          onSignedIn={(person) => useAuthStore.getState().setUser(person)}
          onFinished={() => {
            setInSetup(false)
            navigateTo('dashboard')
          }}
          onNotNow={() => setInSetup(false)}
        />
      </ErrorBoundary>
    )
  }

  if (!user) return <SignIn onSignedIn={(person) => void signedIn(person)} />

  const enter =
    motionLevel === 'full'
      ? { initial: { opacity: 0, y: 10, scale: 0.995 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.32, ease: EASE_PREMIUM } }
      : motionLevel === 'calm'
        ? { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.18, ease: EASE_PREMIUM } }
        : { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } }

  const named = screenTitle(activeRoute)
  const skipToScreen = (): void => {
    const target = document.getElementById('screen-title') ?? document.getElementById('screen')
    target?.focus()
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-void text-white">
      {/* For the keyboard: the first Tab offers to skip the sidebar and go straight to the screen. */}
      <a
        href="#screen"
        onClick={(e) => {
          e.preventDefault()
          skipToScreen()
        }}
        className="sr-only z-[90] rounded-lg bg-aether px-3 py-2 text-sm font-medium text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        data-testid="skip-to-screen"
      >
        Skip to the screen
      </a>
      {/* Says which screen opened, for screen readers (the page itself doesn't reload). */}
      <p className="sr-only" aria-live="polite" data-testid="screen-announcer">
        {named ? `${named.title}${named.tab ? `, ${named.tab}` : ''}` : ''}
      </p>
      <RecoveryPrompt isPartner={user.role === 'partner'} openNow={false} onClosed={() => undefined} />
      {/* Persistent atmosphere — rendered once, never unmounted */}
      {hardwareTier !== 'LITE' && (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-40">
          <ErrorBoundary errorBoundaryName="Atmosphere" fallback={<></>}>
            <GodRays tier={hardwareTier} intensity={0.5} />
          </ErrorBoundary>
        </div>
      )}

      <div className="relative z-10 flex h-full w-full">
        <ErrorBoundary errorBoundaryName="Sidebar" fallback={<></>}>
          <AetherSidebar activeRoute={activeRoute} onNavigate={navigateTo} />
        </ErrorBoundary>

        <main className="flex flex-1 flex-col overflow-hidden">
          <ErrorBoundary errorBoundaryName="TitleBar" fallback={<></>}>
            <AetherTitleBar
              licence={licenceLabel(licence)}
              goToKeys={GO_TO_KEYS}
              onGoTo={() => setGoToOpen(true)}
              onAssistant={() => navigateTo('ai')}
              onSettings={() => navigateTo('settings')}
            />
          </ErrorBoundary>

          <ErrorBoundary errorBoundaryName="DatabaseStatusBanner" fallback={<></>}>
            <DatabaseStatusBanner />
          </ErrorBoundary>
          <ErrorBoundary errorBoundaryName="LicenceBanner" fallback={<></>}>
            <LicenceBanner onOpen={() => navigateTo('licence')} />
          </ErrorBoundary>

          <div className="flex-1 overflow-y-auto focus:outline-none" id="screen" tabIndex={-1}>
            <ScreenHeader route={activeRoute} onNavigate={navigateTo} />
            <motion.div key={activeRoute} initial={enter.initial} animate={enter.animate} transition={enter.transition} className="p-10">
              <ErrorBoundary errorBoundaryName={activeRoute}>
                <ScreenFor route={activeRoute} navigate={navigateTo} openGoTo={() => setGoToOpen(true)} />
              </ErrorBoundary>
            </motion.div>
          </div>
        </main>
      </div>

      <GoToPalette open={goToOpen} onClose={() => setGoToOpen(false)} onNavigate={navigateTo} />
    </div>
  )
}

/** Framer Motion follows the same level: no transforms when the computer asks for reduced motion or effects are Lite. */
function MotionRules({ children }: { children: ReactNode }): JSX.Element {
  const level = useMotionLevel()
  // The level already follows the computer's setting, live: framer-motion's "user" would only read it once.
  return <MotionConfig reducedMotion={level === 'none' ? 'always' : 'never'}>{children}</MotionConfig>
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary errorBoundaryName="Global">
      <MotionRules>
        <AppShell />
        {/* The app's own questions ("Remove this contact?") and notices, over whatever is open. */}
        <ConfirmHost />
      </MotionRules>
    </ErrorBoundary>
  )
}
