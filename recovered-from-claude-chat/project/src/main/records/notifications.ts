/**
 * Notifications — what each person is told, and keeping that list tidy. Plain
 * functions over the database; the timer, the push to the window and desktop
 * notifications are in ../services/notifier.ts.
 *
 * What each person hears about:
 *   deadlines         theirs (the person on the deadline, else the client's), and
 *                     for partners and managers the ones with nobody: once when it
 *                     comes within the alert window, once when it becomes overdue.
 *                     The open-deadline list is the one Home and Deadlines show.
 *   Companies House   changes for their clients; for partners and managers also
 *                     clients with nobody, and every red flag
 *   follow-ups        calls they logged, on the follow-up date
 *   tasks             tasks assigned to them, on the due date (completed and
 *                     cancelled ones never); for both, one missed by up to 30
 *                     days is still announced, and the notice stays until done
 *   backups, licence  partners and managers: a failed backup, the backup folder,
 *                     no backup for a week, the trial or licence ending
 *
 * Each thing is announced to a person once (notification_seen). When more than a
 * handful of deadlines or Companies House changes are new at once — the first
 * day, or after an import — they come as one summary instead. A notification
 * stays until its person marks it done, or the app does when what it was about
 * is dealt with (a deadline filed, a task completed, a backup that worked) —
 * never merely because time passed or a setting changed.
 */
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type {
  AppNotification, LicenceStatus, NotificationCounts, NotificationKind, NotificationQuery, NotificationSeverity, NotificationTarget, OpenDeadline
} from '../../shared/types'
import { obligationPhrase, OBLIGATION_LABELS } from '../../shared/types'
import { canManage, UserFacingError, type Actor } from '../access/policy'
import { listChanges } from './ch-watch'
import { localDate } from './common'
import { openDeadlines } from './deadlines'

/** A notification before it is saved. */
export interface NoticeDraft {
  /** Announced once per person. */
  key: string
  kind: NotificationKind
  severity: NotificationSeverity
  /** What it is about; the app marks it done when that is dealt with. */
  subject: string | null
  client_ref: string | null
  title: string
  body: string | null
  target: NotificationTarget | null
}

/** The practice's own state, for the notices only partners and managers get. */
export interface PracticeFacts {
  licence?: Pick<LicenceStatus, 'state' | 'active' | 'validUntil' | 'daysRemaining' | 'graceEndsOn'> | null
  backup?: { lastBackupAt: string | null; lastError: { at: string; message: string } | null; schedule: string; folderProblem: string | null } | null
}

export interface RefreshOptions {
  today?: string
  /** Deadlines this many days ahead are announced. */
  alertDays?: number
  facts?: PracticeFacts
  /** More new deadlines (or Companies House changes) than this come as one summary. */
  summariseAbove?: number
}

export interface RefreshResult extends NotificationCounts {
  created: AppNotification[]
  /** Marked done by the app because what they were about was dealt with. */
  resolved: number
}

const KINDS: readonly NotificationKind[] = ['deadline', 'companies_house', 'follow_up', 'task', 'backup', 'licence']

const shortDate = (iso: string): string => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const longDate = (iso: string): string => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const daysText = (n: number): string => `${n} day${n === 1 ? '' : 's'}`
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const clip = (s: string | null, max = 160): string | null => (s && s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)
const same = (a: string | null | undefined, b: string | null): boolean => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Notifications belong to someone who signs in: an actor with an id and a name. */
function personId(person: Actor): number {
  if (typeof person.id !== 'number' || !person.name) throw new UserFacingError('Sign in first.')
  return person.id
}

/** Whether a deadline is this person's to hear about. */
export function deadlineIsTheirs(d: Pick<OpenDeadline, 'person'>, person: Actor): boolean {
  return d.person ? same(d.person, person.name) : canManage(person)
}

/** The furthest ahead a deadline is looked for: every open one, whatever the alert window. */
const ALL_AHEAD = 3650

/** Days ahead deadlines are announced: a whole number from 0 to 3650, else 30. */
export function alertWindow(days: unknown): number {
  // A number, or digits as a setting holds them; nothing else (null and '' are not 0).
  const n = typeof days === 'number' ? days : typeof days === 'string' && /^\s*\d+\s*$/.test(days) ? Number(days) : Number.NaN
  return Number.isInteger(n) && n >= 0 && n <= ALL_AHEAD ? n : 30
}

/**
 * Deadlines: once when within the alert window, once when overdue. Every open
 * deadline stays live, so a notice is only marked done by the app when its
 * deadline is filed, not needed or moved — never because the window was shortened.
 */
export function deadlineNotices(db: Database, person: Actor, today: string, alertDays: number): { drafts: NoticeDraft[]; live: Set<string> } {
  const within = alertWindow(alertDays)
  const deadlines = openDeadlines(db, person, { withinDays: ALL_AHEAD }, today).filter((d) => deadlineIsTheirs(d, person))
  const live = new Set<string>()
  const drafts: NoticeDraft[] = []
  for (const d of deadlines) {
    const subject = `deadline:${d.key}:${d.due_date}`
    live.add(subject)
    if (d.days > within) continue
    const overdue = d.days < 0
    const label = OBLIGATION_LABELS[d.obligation] ?? d.obligation
    const period = d.period_end ? ` (period to ${shortDate(d.period_end)})` : d.tax_year ? ` (${d.tax_year})` : ''
    const when = d.days === 0 ? 'today' : d.days === 1 ? 'tomorrow' : `in ${daysText(d.days)}`
    drafts.push({
      key: `${subject}:${overdue ? 'overdue' : 'soon'}`,
      kind: 'deadline',
      severity: overdue ? 'urgent' : d.days <= 7 ? 'warning' : 'info',
      subject,
      client_ref: d.client_ref,
      title: overdue ? `${label} overdue: ${d.client_name}` : `${label} due ${when}: ${d.client_name}`,
      body: overdue
        ? `The ${obligationPhrase(d.obligation)}${period} was due on ${longDate(d.due_date)}, ${daysText(-d.days)} ago.`
        : `The ${obligationPhrase(d.obligation)}${period} is due on ${longDate(d.due_date)}.`,
      target: d.client_ref ? { route: 'client-file', clientRef: d.client_ref } : { route: 'deadlines', window: overdue ? 'overdue' : '30' }
    })
  }
  return { drafts, live }
}

/** Companies House changes from the last 14 days. */
export function companiesHouseNotices(db: Database, person: Actor): NoticeDraft[] {
  const manager = canManage(person)
  return listChanges(db, person, { days: 14, limit: 1000 })
    .filter((c) => (c.assigned_to ? same(c.assigned_to, person.name) : manager) || (c.red_flag && manager))
    .map((c) => ({
      key: `ch:${c.id}`,
      kind: 'companies_house',
      severity: c.red_flag ? 'urgent' : 'info',
      subject: `ch:${c.id}`,
      client_ref: c.client_ref,
      title: `${c.client_name}: ${c.summary}`,
      body: `Companies House, company ${c.company_number}.`,
      target: { route: 'pulse', clientRef: c.client_ref }
    }))
}

/** How far back a missed follow-up or task is still announced. Older ones stay on the list until done, but aren't announced. */
const ANNOUNCE_MISSED_DAYS = 30

/** A task the practice still has to do (the same test as the practice report and reassignment). */
const OPEN_TASK = "lower(COALESCE(t.status, '')) NOT IN ('completed', 'done', 'cancelled')"

/**
 * Follow-ups due today, or missed, on calls this person logged. A missed one is
 * announced if it was due in the last 30 days; any not yet done stays live.
 */
export function followUpNotices(db: Database, person: Actor, today: string): { drafts: NoticeDraft[]; live: Set<string> } {
  const rows = db.prepare(
    `SELECT i.id, i.client_ref, c.client_name, i.summary, substr(i.followup_date, 1, 10) AS due
       FROM interactions i LEFT JOIN clients c ON c.ref = i.client_ref
      WHERE COALESCE(i.followup_done, 0) = 0 AND substr(i.followup_date, 1, 10) <= ? AND i.followup_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
        AND lower(trim(i.staff_member)) = lower(trim(?))`
  ).all(today, person.name) as Array<{ id: number; client_ref: string | null; client_name: string | null; summary: string | null; due: string }>
  const live = new Set<string>()
  const drafts: NoticeDraft[] = []
  const since = addDays(today, -ANNOUNCE_MISSED_DAYS)
  for (const r of rows) {
    const subject = `follow_up:${r.id}`
    live.add(subject)
    if (r.due < since) continue
    const who = r.client_name ?? 'the client'
    drafts.push({
      key: `${subject}:${r.due}`,
      kind: 'follow_up',
      severity: r.due < today ? 'urgent' : 'warning',
      subject,
      client_ref: r.client_ref,
      title: r.due < today ? `Follow-up with ${who} was due ${shortDate(r.due)}` : `Follow up with ${who} today`,
      body: clip(r.summary),
      target: { route: 'communications', clientRef: r.client_ref }
    })
  }
  return { drafts, live }
}

/**
 * Tasks assigned to this person, due today or missed. A missed one is announced
 * if it was due in the last 30 days; any still to do stays live. Completed and
 * cancelled tasks are never announced.
 */
export function taskNotices(db: Database, person: Actor, today: string): { drafts: NoticeDraft[]; live: Set<string> } {
  const rows = db.prepare(
    `SELECT t.id, t.client_ref, c.client_name, t.description, substr(t.due_date, 1, 10) AS due
       FROM tasks t LEFT JOIN clients c ON c.ref = t.client_ref
      WHERE ${OPEN_TASK} AND substr(t.due_date, 1, 10) <= ? AND t.due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
        AND lower(trim(t.assigned_to)) = lower(trim(?))`
  ).all(today, person.name) as Array<{ id: number; client_ref: string | null; client_name: string | null; description: string; due: string }>
  const live = new Set<string>()
  const drafts: NoticeDraft[] = []
  const since = addDays(today, -ANNOUNCE_MISSED_DAYS)
  for (const r of rows) {
    const subject = `task:${r.id}`
    live.add(subject)
    if (r.due < since) continue
    drafts.push({
      key: `${subject}:${r.due}`,
      kind: 'task',
      severity: r.due < today ? 'urgent' : 'warning',
      subject,
      client_ref: r.client_ref,
      title: r.due < today ? `Task overdue: ${clip(r.description, 80)}` : `Task due today: ${clip(r.description, 80)}`,
      body: r.client_name ? `For ${r.client_name}.` : null,
      target: { route: 'tasks' }
    })
  }
  return { drafts, live }
}

/**
 * The licence and backups, for partners and managers. `known` holds the kinds
 * whose facts were read: only their open notices can be marked done by the app,
 * so a moment when the backup settings couldn't be read never clears a warning.
 * Staff are never told about either, so for them both are known (and nothing is live).
 */
export function practiceNotices(person: Actor, facts: PracticeFacts, today: string): { drafts: NoticeDraft[]; live: Set<string>; known: Set<NotificationKind> } {
  const drafts: NoticeDraft[] = []
  const live = new Set<string>()
  if (!canManage(person)) return { drafts, live, known: new Set<NotificationKind>(['licence', 'backup']) }
  const known = new Set<NotificationKind>()
  if (facts.licence) known.add('licence')
  if (facts.backup) known.add('backup')

  const l = facts.licence
  if (l) {
    const trial = l.state === 'trial' || l.state === 'trial_expired'
    if ((l.state === 'trial' || l.state === 'licensed') && l.validUntil && l.daysRemaining <= 30) {
      const subject = `licence:${l.state}:${l.validUntil}`
      live.add(subject)
      drafts.push({
        key: `licence:ending:${l.validUntil}`, kind: 'licence', severity: l.daysRemaining <= 7 ? 'urgent' : 'warning', subject, client_ref: null,
        title: `${trial ? 'The free trial' : 'The licence'} ends on ${longDate(l.validUntil)}`,
        body: trial ? 'Enter a licence key before then to keep making changes.' : 'A renewal key adds a full year from that date. Enter it in Settings → Licence.',
        target: { route: 'licence' }
      })
    }
    if (l.state === 'grace' && l.graceEndsOn) {
      const subject = `licence:grace:${l.graceEndsOn}`
      live.add(subject)
      drafts.push({
        key: subject, kind: 'licence', severity: 'urgent', subject, client_ref: null,
        title: 'The licence has ended',
        body: `Everything keeps working until ${longDate(l.graceEndsOn)}. After that the app is read-only until a new licence key is entered.`,
        target: { route: 'licence' }
      })
    }
    if (!l.active) {
      const subject = `licence:read-only:${l.validUntil ?? ''}`
      live.add(subject)
      drafts.push({
        key: subject, kind: 'licence', severity: 'urgent', subject, client_ref: null,
        title: 'The app is read-only',
        body: `${trial ? 'The free trial has ended' : 'The licence has expired'}. Records can be read and exported; enter a licence key to make changes.`,
        target: { route: 'licence' }
      })
    }
  }

  const b = facts.backup
  if (b) {
    if (b.lastError) {
      live.add('backup:failed')
      drafts.push({
        key: `backup:failed:${b.lastError.at}`, kind: 'backup', severity: 'urgent', subject: 'backup:failed', client_ref: null,
        title: 'The last backup didn’t work', body: clip(b.lastError.message, 300), target: { route: 'settings' }
      })
    }
    if (b.folderProblem) {
      live.add('backup:folder')
      drafts.push({
        key: `backup:folder:${b.folderProblem.slice(0, 80)}`, kind: 'backup', severity: 'warning', subject: 'backup:folder', client_ref: null,
        title: 'Backups can’t use the chosen folder', body: clip(b.folderProblem, 300), target: { route: 'settings' }
      })
    }
    const last = b.lastBackupAt ? b.lastBackupAt.slice(0, 10) : null
    if (!last || last < addDays(today, -7)) {
      live.add('backup:none')
      // Told again once a week (weeks counted from a Monday) while there is still no recent backup.
      const week = Math.floor((Date.parse(`${today}T12:00:00Z`) / 86_400_000 + 3) / 7)
      drafts.push({
        key: `backup:none:w${week}`, kind: 'backup', severity: 'warning', subject: 'backup:none', client_ref: null,
        title: last ? `No backup since ${longDate(last)}` : 'No backup has been made yet',
        body: b.schedule === 'off' ? 'Scheduled backups are off. Turn them on, or make one now, in Settings → Backups.' : 'Make one now in Settings → Backups, and check the schedule.',
        target: { route: 'settings' }
      })
    }
  }
  return { drafts, live, known }
}

/** One notice for many new deadlines or Companies House changes. */
function summaryOf(kind: 'deadline' | 'companies_house', drafts: readonly NoticeDraft[], alertDays: number, today: string): NoticeDraft {
  if (kind === 'deadline') {
    const overdue = drafts.filter((d) => d.key.endsWith(':overdue')).length
    const soon = drafts.length - overdue
    const parts = [overdue ? `${overdue} overdue` : '', soon ? `${soon} due within ${daysText(alertDays)}` : ''].filter(Boolean)
    return {
      key: `summary:deadline:${today}:${drafts.length}`, kind, severity: overdue ? 'urgent' : 'warning', subject: null, client_ref: null,
      title: `${drafts.length} deadlines need attention`,
      body: `${parts.join(' and ')}. Compliance → Deadlines lists them.`,
      target: { route: 'deadlines', window: overdue ? 'overdue' : '30' }
    }
  }
  const red = drafts.filter((d) => d.severity === 'urgent').length
  return {
    key: `summary:ch:${today}:${drafts.length}`, kind, severity: red ? 'urgent' : 'info', subject: null, client_ref: null,
    title: `${drafts.length} Companies House changes for your clients`,
    body: red ? `${red} of them need attention: strike-off, insolvency or something overdue.` : 'Activity lists them.',
    target: { route: 'pulse' }
  }
}

const SELECT = `
  SELECT n.id, n.kind, n.severity, n.title, n.body, n.client_ref, c.client_name, n.target, n.created_at, n.done_at, n.done_by
    FROM notifications n LEFT JOIN clients c ON c.ref = n.client_ref`

type NotificationRow = Omit<AppNotification, 'target'> & { target: string | null }

const fromRow = (r: NotificationRow): AppNotification => {
  let target: NotificationTarget | null = null
  try {
    target = r.target ? (JSON.parse(r.target) as NotificationTarget) : null
  } catch {
    target = null
  }
  return { ...r, target }
}

export function notificationCounts(db: Database, person: Actor): NotificationCounts {
  const r = db.prepare("SELECT COUNT(*) AS open, COALESCE(SUM(severity = 'urgent'), 0) AS urgent FROM notifications WHERE user_id = ? AND done_at IS NULL").get(personId(person)) as NotificationCounts
  return { open: r.open, urgent: r.urgent }
}

/**
 * Brings one person's notifications up to date: new ones made (each thing
 * once), and open ones about things since dealt with marked done by the app.
 */
export function refreshNotifications(db: Database, person: Actor, opts: RefreshOptions = {}): RefreshResult {
  const userId = personId(person)
  const today = opts.today ?? localDate()
  const alertDays = alertWindow(opts.alertDays ?? 30)
  const summariseAbove = opts.summariseAbove ?? 5

  const deadlines = deadlineNotices(db, person, today, alertDays)
  const followUps = followUpNotices(db, person, today)
  const tasks = taskNotices(db, person, today)
  const practice = practiceNotices(person, opts.facts ?? {}, today)
  const ch = companiesHouseNotices(db, person)
  const live = new Set([...deadlines.live, ...followUps.live, ...tasks.live, ...practice.live])

  return db.transaction((): RefreshResult => {
    const seen = db.prepare('INSERT OR IGNORE INTO notification_seen (user_id, seen_key) VALUES (?, ?)')
    const fresh = (drafts: readonly NoticeDraft[]): NoticeDraft[] => drafts.filter((d) => seen.run(userId, d.key).changes > 0)
    const insert = db.prepare('INSERT INTO notifications (user_id, kind, severity, subject, client_ref, title, body, target) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const supersede = db.prepare("UPDATE notifications SET done_at = datetime('now'), done_by = 'The app' WHERE user_id = ? AND subject = ? AND done_at IS NULL")

    const toCreate: NoticeDraft[] = []
    for (const [kind, drafts] of [['deadline', deadlines.drafts], ['companies_house', ch]] as const) {
      const n = fresh(drafts)
      if (n.length > summariseAbove) toCreate.push(summaryOf(kind, n, alertDays, today))
      else toCreate.push(...n)
    }
    toCreate.push(...fresh(followUps.drafts), ...fresh(tasks.drafts), ...fresh(practice.drafts))

    const ids: number[] = []
    for (const d of toCreate) {
      // A newer notice about the same thing (a deadline now overdue) replaces the open one.
      if (d.subject) supersede.run(userId, d.subject)
      ids.push(Number(insert.run(userId, d.kind, d.severity, d.subject, d.client_ref, d.title, d.body, d.target ? JSON.stringify(d.target) : null).lastInsertRowid))
    }

    // Open notices about things since dealt with: a deadline filed or moved, a follow-up or task done, a backup that worked.
    // Backup and licence notices only when their facts could be read just now.
    const open = db.prepare(
      "SELECT id, kind, subject FROM notifications WHERE user_id = ? AND done_at IS NULL AND subject IS NOT NULL AND kind IN ('deadline', 'follow_up', 'task', 'backup', 'licence')"
    ).all(userId) as Array<{ id: number; kind: NotificationKind; subject: string }>
    const done = db.prepare("UPDATE notifications SET done_at = datetime('now'), done_by = 'The app' WHERE id = ?")
    let resolved = 0
    for (const o of open) {
      if ((o.kind === 'backup' || o.kind === 'licence') && !practice.known.has(o.kind)) continue
      if (!live.has(o.subject)) resolved += done.run(o.id).changes
    }

    // Housekeeping: done notices after 90 days, what was seen after 400.
    db.prepare("DELETE FROM notifications WHERE user_id = ? AND done_at IS NOT NULL AND done_at < datetime('now', '-90 days')").run(userId)
    db.prepare("DELETE FROM notification_seen WHERE user_id = ? AND seen_at < datetime('now', '-400 days')").run(userId)

    const created = ids.length
      ? (db.prepare(`${SELECT} WHERE n.id IN (${ids.map(() => '?').join(', ')}) ORDER BY n.id DESC`).all(...ids) as NotificationRow[]).map(fromRow)
      : []
    return { created, resolved, ...notificationCounts(db, person) }
  })()
}

function readQuery(q: unknown): { show: 'open' | 'done'; kind: NotificationKind | null; limit: number } {
  const query = (q && typeof q === 'object' ? q : {}) as NotificationQuery
  const show = query.show ?? 'open'
  if (show !== 'open' && show !== 'done') throw new UserFacingError('Choose open or done notifications.')
  if (query.kind !== undefined && !KINDS.includes(query.kind)) throw new UserFacingError('Choose a kind of notification from the list.')
  const limit = query.limit ?? 200
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new UserFacingError('Show 1 to 500 notifications.')
  return { show, kind: query.kind ?? null, limit }
}

/** This person's notifications: open ones newest first, or the done ones most recently done first. */
export function listNotifications(db: Database, person: Actor, query?: unknown): AppNotification[] {
  const q = readQuery(query)
  const params: unknown[] = [personId(person)]
  let sql = `${SELECT} WHERE n.user_id = ? AND n.done_at IS ${q.show === 'open' ? 'NULL' : 'NOT NULL'}`
  if (q.kind) {
    sql += ' AND n.kind = ?'
    params.push(q.kind)
  }
  sql += q.show === 'open' ? " ORDER BY (n.severity = 'urgent') DESC, n.id DESC" : ' ORDER BY n.done_at DESC, n.id DESC'
  sql += ' LIMIT ?'
  params.push(q.limit)
  return (db.prepare(sql).all(...params) as NotificationRow[]).map(fromRow)
}

/** Marks this person's notifications done: some by id, or every open one. Someone else's are never touched. */
export function markDone(db: Database, person: Actor, ids: unknown): number {
  const userId = personId(person)
  if (ids === 'all') {
    return db.prepare("UPDATE notifications SET done_at = datetime('now'), done_by = ? WHERE user_id = ? AND done_at IS NULL").run(person.name, userId).changes
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((i) => typeof i !== 'number' || !Number.isInteger(i) || i < 1)) {
    throw new UserFacingError('Choose the notifications to mark done.')
  }
  const done = db.prepare("UPDATE notifications SET done_at = datetime('now'), done_by = ? WHERE id = ? AND user_id = ? AND done_at IS NULL")
  return db.transaction(() => (ids as number[]).reduce((n, id) => n + done.run(person.name, id, userId).changes, 0))()
}

/** Puts a done notification back on this person's open list. */
export function reopen(db: Database, person: Actor, id: unknown): void {
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) throw new UserFacingError('That isn’t a notification.')
  const r = db.prepare('UPDATE notifications SET done_at = NULL, done_by = NULL WHERE id = ? AND user_id = ? AND done_at IS NOT NULL').run(id, personId(person))
  if (!r.changes) throw new UserFacingError('That notification isn’t on your done list.')
}
