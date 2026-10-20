/**
 * Sign-in, sessions, people, invitations, the firm's details and first-run
 * setup. Owned by the auth domain.
 *
 * The session lives in the main process, bound to the window that signed in;
 * the renderer never holds a token. The rules both processes share (password
 * and username rules, idle choices, invitation codes, the firm's reference
 * checks) are at the end of this file, so the screens check as you type and
 * the main process checks again before saving.
 */
import type { Actor, Role } from '../domain/roles'
import type { ChannelSpec, ChannelTable } from '../ipc/spec'

// ── Status and sign-in ──────────────────────────────────────────────────────

export interface AuthStatus {
  /** Nobody can sign in yet: a new installation, so the first-run wizard shows. */
  setupNeeded: boolean
  /** The first-run wizard has been finished (or a practice existed before it). */
  setupComplete: boolean
  signedIn: boolean
  /** The person signed in on this window, or null. */
  actor: Actor | null
  /** The practice's name from Settings → Firm, or null before setup. */
  firmName: string | null
}

export interface SignInInput {
  username: string
  password: string
}

/** A person whose password is temporary (a partner reset it): they choose a new one before anything else. */
export interface PasswordChangeNeeded {
  username: string
  name: string
}

export interface SignInResult extends AuthStatus {
  /**
   * Set when the password was right but temporary. No session was started:
   * the person chooses a new password with auth.completePasswordChange.
   */
  passwordChange?: PasswordChangeNeeded
}

export interface CompletePasswordChangeInput {
  username: string
  /** The temporary password the partner set. */
  currentPassword: string
  newPassword: string
}

export interface SignOutInput {
  /** 'idle' when the idle warning ran out (the session is recorded as ended for that). */
  reason?: 'idle'
}

/** The signed-in window's session, for the idle warning and password re-entry. */
export interface SessionInfo {
  signedInAt: string
  /** The last time the person used the app (input, not background reads). */
  lastActiveAt: string
  /** Minutes without use before sign-out. */
  idleMinutes: number
  /** Until when the password was last confirmed (auth.reauth or sign-in), or null. */
  reauthUntil: string | null
}

export interface ReauthInput {
  password: string
}

export interface ReauthResult {
  /** Protected actions are open until then (ISO 8601 UTC). */
  until: string
}

// ── Invitations (accepted on this PC) ───────────────────────────────────────

export interface InviteCodeInput {
  /** As typed: case, spaces and dashes don't matter. */
  code: string
}

export interface InvitePreview {
  name: string
  email: string | null
  role: Role
  firmName: string | null
  invitedBy: string | null
  expiresAt: string
  /** A username that is free, made from the name: 'jane.smith'. */
  suggestedUsername: string
}

export interface AcceptInviteInput {
  code: string
  name: string
  username: string
  password: string
}

export interface DevFirstUser {
  username: string
  name: string
}

// ── Your sign-in ────────────────────────────────────────────────────────────

export type SignInOutcome = 'success' | 'wrong_password' | 'unknown_user' | 'locked' | 'access_off'

export interface SignInEvent {
  id: number
  at: string
  username: string
  outcome: SignInOutcome
  /** A plain sentence when there is more to say ('Locked after 5 wrong passwords in a row'). */
  detail: string | null
}

export interface IdlePolicy {
  /** The practice's setting (a partner chooses it in Settings → People): the default and the longest allowed. */
  practiceMinutes: number
  /** The person's own, shorter choice, or null to use the practice's. */
  ownMinutes: number | null
  /** What applies: the person's choice when it is shorter, otherwise the practice's. */
  effectiveMinutes: number
}

export interface Account {
  id: number
  username: string
  name: string
  email: string | null
  role: Role
  createdAt: string
  lastSignInAt: string | null
  passwordChangedAt: string | null
  idle: IdlePolicy
  /** The person's own latest sign-in attempts, newest first. */
  recentSignIns: SignInEvent[]
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface SetOwnIdleInput {
  /** One of IDLE_CHOICES no longer than the practice's setting, or null for the practice's. */
  minutes: number | null
}

// ── People (partners) ───────────────────────────────────────────────────────

export interface Person {
  id: number
  username: string
  name: string
  email: string | null
  role: Role
  /** False when a partner has turned their access off. */
  active: boolean
  locked: boolean
  lockedAt: string | null
  /** When a lock lifts by itself (only when no other partner could lift it), else null. */
  selfUnlocksAt: string | null
  /** A partner set a temporary password; they choose their own at next sign-in. */
  mustChangePassword: boolean
  /** Wrong passwords in a row since the last good one. */
  failedSignIns: number
  lastSignInAt: string | null
  createdAt: string
  /** Signed in on this PC right now. */
  signedIn: boolean
  /** Clients they look after day to day, and clients they are the responsible partner for. */
  clients: { assigned: number; responsible: number }
  isYou: boolean
}

export interface PendingInvite {
  id: number
  name: string
  email: string | null
  role: Role
  invitedBy: string | null
  createdAt: string
  expiresAt: string
  expired: boolean
}

export interface PeopleOverview {
  people: Person[]
  /** Invitations not yet used: waiting, or expired in the last 30 days (they can be renewed). */
  invites: PendingInvite[]
  idle: { practiceMinutes: number }
  /** Wrong passwords in a row before an account locks. */
  lockAfter: number
}

export interface DirectoryPerson {
  id: number
  name: string
  role: Role
}

export interface InviteInput {
  name: string
  email?: string | null
  role: Role
  /** One of INVITE_EXPIRY_CHOICES. */
  expiresInDays: number
}

export interface InviteCreated {
  invite: PendingInvite
  /** The code to give the person, 'ABCD-EFGH-JKMN'. Shown once: only a hash is kept. */
  code: string
}

export interface RenewInviteInput {
  id: number
  expiresInDays?: number
}

export interface PersonIdInput {
  id: number
}

export interface SetRoleInput {
  id: number
  role: Role
}

export interface SetAccessInput {
  id: number
  active: boolean
}

export interface ResetPasswordInput {
  id: number
  temporaryPassword: string
}

export interface UpdatePersonInput {
  id: number
  name: string
  email?: string | null
}

/** Something in the practice under a person, which stops them being removed. */
export interface PersonLink {
  /** A plain phrase with the count: '12 clients they look after'. */
  label: string
  count: number
}

export interface RemovalCheck {
  canRemove: boolean
  links: PersonLink[]
  /** Why not, in a sentence, when canRemove is false. */
  reason: string | null
}

export interface SetIdlePolicyInput {
  minutes: number
}

// ── Firm details ────────────────────────────────────────────────────────────

export interface FirmDetails {
  name: string
  tradingName: string | null
  addressLine1: string | null
  addressLine2: string | null
  town: string | null
  county: string | null
  postcode: string | null
  country: string
  email: string | null
  phone: string | null
  website: string | null
  companyNumber: string | null
  vatNumber: string | null
  utr: string | null
  payeRef: string | null
  updatedAt: string | null
}

export type FirmField = Exclude<keyof FirmDetails, 'updatedAt'>

/** What a form sends: the name, and any other field it shows (fields left out keep their value). */
export type FirmInput = { name: string } & Partial<Record<Exclude<FirmField, 'name'>, string | null>>

export interface FirmView {
  /** Null before the firm's details are first saved. */
  details: FirmDetails | null
  /** References kept with a note because they don't pass their check. */
  warnings: Partial<Record<FirmField, string>>
  /** Partners and managers change the firm's details. */
  canEdit: boolean
}

// ── First-run setup ─────────────────────────────────────────────────────────

export const SETUP_STEP_IDS = ['firm', 'partner', 'recovery', 'vault', 'licence', 'import', 'done'] as const
export type SetupStepId = (typeof SETUP_STEP_IDS)[number]

/** The steps other domains fill, which they can tell the wizard about (registerSetupProbe). */
export type ProbedSetupStep = 'recovery' | 'vault' | 'licence' | 'import'

/**
 * done     its work is done (read from the records wherever that is possible)
 * skipped  the wizard moved past it and its work isn't done
 * passed   the wizard moved past it; the app can't tell whether its work was done
 * todo     not reached yet
 */
export type SetupStepState = 'done' | 'skipped' | 'passed' | 'todo'

export interface SetupStatus {
  complete: boolean
  /** Nobody can sign in yet. */
  firstRun: boolean
  firm: FirmDetails | null
  /** Where the wizard carries on from after a restart. */
  resumeAt: SetupStepId
  steps: Array<{ id: SetupStepId; state: SetupStepState }>
}

export interface FirstPartnerInput {
  /** The firm's name; may be left out once setup.saveFirm has saved the firm's details. */
  firmName?: string
  name: string
  username: string
  email?: string | null
  password: string
}

export interface SetupProgressInput {
  /** The step the wizard is now showing. */
  at: SetupStepId
}

// ── The channels ────────────────────────────────────────────────────────────

export interface AuthContract {
  /** Who is signed in on this window, and whether setup is needed. */
  'auth.status': ChannelSpec<void, AuthStatus>
  'auth.signIn': ChannelSpec<SignInInput, SignInResult>
  /** A temporary password is swapped for the person's own, then they are signed in. */
  'auth.completePasswordChange': ChannelSpec<CompletePasswordChangeInput, AuthStatus>
  'auth.signOut': ChannelSpec<SignOutInput | void, AuthStatus>
  /** The person used the app (the renderer reports input, at most every 30 seconds). */
  'auth.activity': ChannelSpec<void, SessionInfo>
  'auth.session': ChannelSpec<void, SessionInfo>
  /** The password again, for a protected action: opens them for REAUTH_MINUTES on this session. */
  'auth.reauth': ChannelSpec<ReauthInput, ReauthResult>
  /** An invitation code typed on the sign-in screen: who it is for. */
  'auth.checkInvite': ChannelSpec<InviteCodeInput, InvitePreview>
  /** The invited person chooses a username and password, and is signed in. Single use. */
  'auth.acceptInvite': ChannelSpec<AcceptInviteInput, AuthStatus>
  /** Development builds only (refused in an installed copy): the first partner, to fill in the sign-in screen. */
  'dev.firstUser': ChannelSpec<void, DevFirstUser | null>

  'account.get': ChannelSpec<void, Account>
  'account.changePassword': ChannelSpec<ChangePasswordInput, Account>
  'account.setIdle': ChannelSpec<SetOwnIdleInput, Account>

  'people.list': ChannelSpec<void, PeopleOverview>
  /** Active people by name, for choosing who does something (any signed-in person). */
  'people.directory': ChannelSpec<void, DirectoryPerson[]>
  'people.invite': ChannelSpec<InviteInput, InviteCreated>
  'people.renewInvite': ChannelSpec<RenewInviteInput, InviteCreated>
  'people.cancelInvite': ChannelSpec<PersonIdInput, PeopleOverview>
  'people.update': ChannelSpec<UpdatePersonInput, Person>
  'people.setRole': ChannelSpec<SetRoleInput, Person>
  'people.setAccess': ChannelSpec<SetAccessInput, Person>
  'people.unlock': ChannelSpec<PersonIdInput, Person>
  /** Needs the partner's password confirmed in the last REAUTH_MINUTES (auth.reauth). */
  'people.resetPassword': ChannelSpec<ResetPasswordInput, Person>
  'people.removalCheck': ChannelSpec<PersonIdInput, RemovalCheck>
  'people.remove': ChannelSpec<PersonIdInput, PeopleOverview>
  'people.setIdlePolicy': ChannelSpec<SetIdlePolicyInput, PeopleOverview>

  'firm.get': ChannelSpec<void, FirmView>
  'firm.update': ChannelSpec<FirmInput, FirmView>

  /** The wizard's state: anyone while nobody can sign in, then partners. */
  'setup.status': ChannelSpec<void, SetupStatus>
  /** Only while nobody can sign in: the firm's details, from the wizard's first step. */
  'setup.saveFirm': ChannelSpec<FirmInput, SetupStatus>
  /** Only while nobody can sign in: creates the first partner (saving the firm's name if given) and signs them in. */
  'setup.createFirstPartner': ChannelSpec<FirstPartnerInput, AuthStatus>
  /** Where the wizard is, so it carries on there after a restart. */
  'setup.progress': ChannelSpec<SetupProgressInput, SetupStatus>
  /** A partner finishes the first-run wizard. */
  'setup.finish': ChannelSpec<void, AuthStatus>
}

export const authChannels = {
  'auth.status': { kind: 'read', auth: 'public' },
  'auth.signIn': { kind: 'write', auth: 'public', allowWhenReadOnly: true, audited: false },
  'auth.completePasswordChange': { kind: 'write', auth: 'public', allowWhenReadOnly: true },
  'auth.signOut': { kind: 'write', auth: 'public', allowWhenReadOnly: true, audited: false },
  'auth.activity': { kind: 'write', allowWhenReadOnly: true, audited: false },
  'auth.session': { kind: 'read' },
  'auth.reauth': { kind: 'write', allowWhenReadOnly: true, audited: false },
  'auth.checkInvite': { kind: 'read', auth: 'public' },
  'auth.acceptInvite': { kind: 'write', auth: 'public', allowWhenReadOnly: true },
  'dev.firstUser': { kind: 'read', auth: 'public' },

  'account.get': { kind: 'read' },
  'account.changePassword': { kind: 'write', allowWhenReadOnly: true },
  'account.setIdle': { kind: 'write', allowWhenReadOnly: true },

  'people.list': { kind: 'read' },
  'people.directory': { kind: 'read' },
  'people.invite': { kind: 'write', allowWhenReadOnly: true },
  'people.renewInvite': { kind: 'write', allowWhenReadOnly: true },
  'people.cancelInvite': { kind: 'write', allowWhenReadOnly: true },
  'people.update': { kind: 'write', allowWhenReadOnly: true },
  'people.setRole': { kind: 'write', allowWhenReadOnly: true },
  'people.setAccess': { kind: 'write', allowWhenReadOnly: true },
  'people.unlock': { kind: 'write', allowWhenReadOnly: true },
  'people.resetPassword': { kind: 'write', allowWhenReadOnly: true },
  'people.removalCheck': { kind: 'read' },
  'people.remove': { kind: 'write', allowWhenReadOnly: true },
  'people.setIdlePolicy': { kind: 'write', allowWhenReadOnly: true },

  'firm.get': { kind: 'read' },
  'firm.update': { kind: 'write', allowWhenReadOnly: true },

  'setup.status': { kind: 'read', auth: 'public' },
  'setup.saveFirm': { kind: 'write', auth: 'public' },
  'setup.createFirstPartner': { kind: 'write', auth: 'public' },
  'setup.progress': { kind: 'write', allowWhenReadOnly: true, audited: false },
  'setup.finish': { kind: 'write', allowWhenReadOnly: true }
} as const satisfies ChannelTable<AuthContract>

// ── Rules both processes share ──────────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 200

/** Wrong passwords in a row before an account locks, and the try from which the sign-in screen warns. */
export const LOCK_AFTER_FAILURES = 5
export const WARN_FROM_FAILURE = 3
/** A lock that no other partner could lift (the only partner's) lifts by itself after this long. */
export const SELF_UNLOCK_MINUTES = 15

/** How long without use before sign-out. */
export const IDLE_CHOICES = [5, 10, 15, 30, 60, 120, 240] as const
export const DEFAULT_IDLE_MINUTES = 30
/** The warning shows this long before the idle sign-out. */
export const IDLE_WARNING_SECONDS = 60
/** The main process allows this much longer than the renderer's own timer, so the renderer's sign-out comes first. */
export const IDLE_GRACE_SECONDS = 60
/** How often, at most, the renderer reports that the person is using the app. */
export const ACTIVITY_REPORT_SECONDS = 30

/** How long a confirmed password opens protected actions. */
export const REAUTH_MINUTES = 5
/**
 * The `field` of the refusal a protected channel gives when the password
 * hasn't been confirmed recently ({ code: 'forbidden', field: 'reauth' }).
 * The renderer asks for the password (components/session/reauth.ts) and tries again.
 */
export const REAUTH_REQUIRED_FIELD = 'reauth'

export const INVITE_EXPIRY_CHOICES = [1, 3, 7, 14, 30] as const
export const DEFAULT_INVITE_DAYS = 7

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  partner: 'Everything, including people, the vault, deleting kept records and the licence',
  manager: 'Every client and the practice’s work; assigns clients and changes most settings',
  staff: 'The clients assigned to them, and those clients’ records'
}

/** '30 minutes', '1 hour', '4 hours'. */
export function idleLabel(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? '1 hour' : `${hours} hours`
  }
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

export function isIdleChoice(value: unknown): value is (typeof IDLE_CHOICES)[number] {
  return typeof value === 'number' && (IDLE_CHOICES as readonly number[]).includes(value)
}

/** The idle time that applies: the person's own choice when it is shorter than the practice's. */
export function effectiveIdleMinutes(practiceMinutes: number, ownMinutes: number | null): number {
  return ownMinutes !== null && ownMinutes < practiceMinutes ? ownMinutes : practiceMinutes
}

/** Passwords too common to use, even at 10 characters or more. */
const COMMON_PASSWORDS = new Set([
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  '1234567890',
  '0123456789',
  '0987654321',
  '12345678910',
  '123456789012',
  'qwertyuiop',
  'qwerty123456',
  'iloveyou123',
  'letmein1234',
  'welcome123',
  'welcome1234',
  'abcdefghij',
  'aeternacrm',
  'aeternacrm1'
])

export interface PasswordContext {
  username?: string | null
  name?: string | null
}

/** A plain sentence about what is wrong with a new password, or null when it is fine. */
export function passwordProblem(password: string, context: PasswordContext = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password.length > MAX_PASSWORD_LENGTH) return `Use a password of at most ${MAX_PASSWORD_LENGTH} characters.`
  if (password.trim() !== password) return 'A password can’t start or end with a space.'
  const lower = password.toLowerCase()
  if (/^(.)\1+$/.test(password) || COMMON_PASSWORDS.has(lower)) return 'That password is too easy to guess. Try a few words that mean something to you.'
  if (context.username && lower === context.username.trim().toLowerCase()) return 'Choose a password that isn’t your username.'
  if (context.name && lower.replace(/\s+/g, '') === context.name.trim().toLowerCase().replace(/\s+/g, '')) return 'Choose a password that isn’t your name.'
  return null
}

export interface PasswordStrength {
  /** 0 (too short) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
}

/** A rough guide shown as a person types a new password. Only passwordProblem() refuses one. */
export function passwordStrength(password: string, context: PasswordContext = {}): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) return { score: 0, label: 'Too short' }
  if (passwordProblem(password, context)) return { score: 1, label: 'Weak' }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9\s]/, /\s/].filter((r) => r.test(password)).length
  const distinct = new Set(password.toLowerCase()).size
  let points = 0
  if (password.length >= 14) points += 1
  if (password.length >= 20) points += 1
  if (kinds >= 2) points += 1
  if (kinds >= 3) points += 1
  if (distinct < 5) points -= 2
  if (points >= 3) return { score: 4, label: 'Strong' }
  if (points >= 2) return { score: 3, label: 'Good' }
  if (points >= 1) return { score: 2, label: 'Fair' }
  return { score: 1, label: 'Weak' }
}

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/

/** A plain sentence about what is wrong with a new username, or null when it is fine. */
export function usernameProblem(username: string): string | null {
  const u = username.trim()
  if (!u) return 'Enter a username.'
  if (!USERNAME.test(u)) return 'Use 3 to 64 letters, numbers, dots, hyphens or underscores for the username, starting with a letter or number.'
  return null
}

/** A username made from a name: 'Jane O’Brien-Smith' → 'jane.obrien-smith'. */
export function suggestUsername(name: string): string {
  const plain = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 40)
    .replace(/[.-]+$/g, '')
  return plain.length >= 3 ? plain : `${plain}user`
}

/** The letters an invitation code uses: no 0, O, 1, I or L, so it can be read aloud and typed without slips. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const INVITE_CODE_LENGTH = 12

/** The code as typed → its 12 characters, or null when it can't be one. */
export function normaliseInviteCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]+/g, '')
  if (code.length !== INVITE_CODE_LENGTH) return null
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return null
  return code
}

/** 'ABCDEFGHJKMN' → 'ABCD-EFGH-JKMN'. */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}

// ── The firm's details: limits and reference checks ─────────────────────────

export const FIRM_FIELDS: readonly FirmField[] = [
  'name',
  'tradingName',
  'addressLine1',
  'addressLine2',
  'town',
  'county',
  'postcode',
  'country',
  'email',
  'phone',
  'website',
  'companyNumber',
  'vatNumber',
  'utr',
  'payeRef'
]

export const FIRM_FIELD_LABELS: Record<FirmField, string> = {
  name: 'Firm name',
  tradingName: 'Trading name',
  addressLine1: 'Address',
  addressLine2: 'Address line 2',
  town: 'Town or city',
  county: 'County',
  postcode: 'Postcode',
  country: 'Country',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  companyNumber: 'Company number',
  vatNumber: 'VAT number',
  utr: 'Corporation Tax UTR',
  payeRef: 'Employer PAYE reference'
}

/** The fields with a check of their own, kept with a note (and a data issue) when they don't pass. */
export const FIRM_REFERENCE_FIELDS: readonly FirmField[] = ['companyNumber', 'vatNumber', 'utr', 'payeRef']

const FIRM_LIMITS: Record<FirmField, number> = {
  name: 200,
  tradingName: 200,
  addressLine1: 200,
  addressLine2: 200,
  town: 100,
  county: 100,
  postcode: 12,
  country: 100,
  email: 200,
  phone: 40,
  website: 200,
  companyNumber: 12,
  vatNumber: 20,
  utr: 16,
  payeRef: 20
}

/**
 * A field as it should be saved:
 *   value    the tidied value (null for empty)
 *   problem  a sentence that stops it being saved (too long, not an email address)
 *   warning  a sentence kept beside it: a reference that doesn't pass its check is saved, with this note
 */
export interface FirmFieldCheck {
  value: string | null
  problem?: string
  warning?: string
}

const compact = (raw: string): string => raw.replace(/[\s-]+/g, '').toUpperCase()

/** HMRC UTR: 10 digits; the first is a check digit over the other nine. */
export function utrChecksumOk(utr: string): boolean {
  if (!/^\d{10}$/.test(utr)) return false
  const weights = [6, 7, 8, 9, 10, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * Number(utr[i + 1]), 0)
  return [2, 1, 9, 8, 7, 6, 5, 4, 3, 2, 1][sum % 11] === Number(utr[0])
}

/** UK VAT number: 9 digits, the mod-97 check in either the old or the post-2010 range. */
export function vatChecksumOk(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false
  const total = [8, 7, 6, 5, 4, 3, 2].reduce((acc, w, i) => acc + w * Number(digits[i]), 0) + Number(digits.slice(7))
  return total % 97 === 0 || (total + 55) % 97 === 0
}

/** Two-letter Companies House prefixes seen on the register (England and Wales numbers are 8 digits). */
const CRN_PREFIXES = new Set([
  'SC', 'NI', 'OC', 'SO', 'NC', 'LP', 'SL', 'NL', 'R0', 'RC', 'SE', 'SR', 'ES', 'FC', 'SF', 'NF', 'GE', 'GS', 'GN',
  'IP', 'SP', 'NP', 'IC', 'SI', 'NA', 'NZ', 'RS', 'CE', 'CS', 'OE', 'BR', 'NR', 'SG', 'NO', 'AC', 'SA', 'SZ', 'ZC',
  'FE', 'FS', 'ZS', 'PC', 'NV', 'RO', 'IS', 'NE'
])

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?|GIR) ?(\d[A-Z]{2})$/

/** True for an email address that looks right ('office@example.co.uk'). */
export function looksLikeEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

function isUk(country: string | null | undefined): boolean {
  const c = (country ?? '').trim().toLowerCase()
  return c === '' || ['united kingdom', 'uk', 'england', 'scotland', 'wales', 'northern ireland', 'great britain', 'gb'].includes(c)
}

/** Checks and tidies one of the firm's fields. `country` decides whether a postcode is checked as a UK one. */
export function checkFirmField(field: FirmField, raw: string | null | undefined, country?: string | null): FirmFieldCheck {
  const text = (raw ?? '').trim().replace(/\s+/g, ' ')
  const label = FIRM_FIELD_LABELS[field]
  if (field === 'name' && !text) return { value: null, problem: 'Enter the firm’s name.' }
  if (!text) return { value: field === 'country' ? 'United Kingdom' : null }
  if (text.length > FIRM_LIMITS[field]) return { value: text, problem: `${label} can be at most ${FIRM_LIMITS[field]} characters.` }
  switch (field) {
    case 'email':
      return EMAIL.test(text) ? { value: text } : { value: text, problem: 'Enter an email address like office@example.co.uk.' }
    case 'phone': {
      if (!/^[+\d][\d\s()-]*$/.test(text)) return { value: text, problem: 'Use digits, spaces and + ( ) - in the phone number.' }
      const digits = text.replace(/\D/g, '').length
      return digits < 10 ? { value: text, warning: 'That phone number looks short. Check it has the area code.' } : { value: text }
    }
    case 'website':
      if (/\s/.test(text)) return { value: text, problem: 'A website address has no spaces.' }
      return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(text) ? { value: text } : { value: text, warning: 'That doesn’t look like a website address, like www.example.co.uk.' }
    case 'postcode': {
      const v = text.toUpperCase().replace(/\s+/g, '')
      if (!isUk(country)) return { value: text.toUpperCase() }
      const m = UK_POSTCODE.exec(v)
      return m ? { value: `${m[1]} ${m[2]}` } : { value: text.toUpperCase(), warning: 'That doesn’t look like a UK postcode. Check it.' }
    }
    case 'companyNumber': {
      const v = compact(text)
      if (/^\d{1,8}$/.test(v)) return { value: v.padStart(8, '0') }
      const m = /^([A-Z][A-Z0-9])(\d{1,6})$/.exec(v)
      if (!m) return { value: v, warning: 'A company number is 8 digits, or 2 letters and 6 digits (for example SC123456 or OC123456).' }
      const value = m[1] + m[2].padStart(6, '0')
      return CRN_PREFIXES.has(m[1]) ? { value } : { value, warning: `${m[1]} isn’t a prefix this app recognises. Check it on the Companies House register.` }
    }
    case 'vatNumber': {
      const digits = compact(text).replace(/^GB/, '')
      if (!/^\d{9}$/.test(digits)) return { value: compact(text), warning: 'A UK VAT number is 9 digits (the GB prefix is optional).' }
      const value = `GB${digits}`
      return vatChecksumOk(digits) ? { value } : { value, warning: 'Those 9 digits don’t pass the VAT number check. Look for a mistyped digit.' }
    }
    case 'utr': {
      const v = compact(text).replace(/K$/, '')
      if (!/^\d{10}$/.test(v)) return { value: v, warning: 'A UTR is 10 digits.' }
      return utrChecksumOk(v) ? { value: v } : { value: v, warning: 'Those 10 digits don’t pass the UTR check. Look for a mistyped digit.' }
    }
    case 'payeRef': {
      const v = text.replace(/\s+/g, '').toUpperCase()
      const m = /^(\d{3})\/?([A-Z0-9]{1,10})$/.exec(v)
      return m ? { value: `${m[1]}/${m[2]}` } : { value: v, warning: 'An employer PAYE reference is a 3-digit office number, a slash, then letters and digits (for example 123/AB45678).' }
    }
    default:
      return { value: text }
  }
}
