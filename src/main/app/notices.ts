/**
 * Notices from start-up that a person should see once the app is open (a
 * damaged database set aside, data from an earlier build left in place).
 * The system domain shows them in the database status banner.
 */
export interface StartupNotice {
  /** 'warning' needs a look; 'info' is for the record. */
  level: 'info' | 'warning'
  message: string
  at: string
}

const notices: StartupNotice[] = []

export function addStartupNotice(level: StartupNotice['level'], message: string): void {
  notices.push({ level, message, at: new Date().toISOString() })
}

export function startupNotices(): readonly StartupNotice[] {
  return notices
}

export function clearStartupNotices(): void {
  notices.length = 0
}
