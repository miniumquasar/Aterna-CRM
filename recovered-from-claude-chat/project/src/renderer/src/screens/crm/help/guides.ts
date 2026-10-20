import type { NavRoute } from '@renderer/navigation/routes'

/**
 * The short guides on About and help: what a part of the app is for, where it
 * is, and the few things worth knowing. The full guides are in the docs folder
 * that comes with each release.
 */
export interface Guide {
  id: string
  title: string
  /** Where it is, in the sidebar's own words. */
  where: string
  /** The screen "Open" goes to, when there is one. */
  route?: NavRoute
  points: readonly string[]
}

export const GUIDES: readonly Guide[] = [
  {
    id: 'finding',
    title: 'Finding your way',
    where: 'The sidebar, and Go to… at the top',
    points: [
      'The sidebar has five groups: Work, Clients, Compliance, Practice and System. Where an entry holds more than one screen, they are tabs across the top.',
      'Go to… (Ctrl K, or ⌘K on a Mac) finds a client by name, client code, trading name, company number or one of their other names, and opens any screen.',
      'Every screen has its title at the top. From the top of the window, Tab once for “Skip to the screen”.'
    ]
  },
  {
    id: 'client-file',
    title: 'The client file',
    where: 'Clients → Client file',
    route: 'client-file',
    points: [
      'Everything about one client on one page: deadlines, contacts, payroll, workplace pensions, Self Assessment, linked clients and other names, then the record and every register. The links at the top jump to each part.',
      'Payroll: add each PAYE scheme with its references (checked as you type, never refused), then a line for each tax year.',
      'Workplace pensions: with the duties start date, the app adds the re-declaration of compliance for every third anniversary, due within five months of it. Check each date against The Pensions Regulator’s letter: the re-enrolment date can be moved by up to three months.',
      'Self Assessment: one registration per client, with how the return is filed, and a line for each source of income.',
      'Linked clients read from both sides: “Director of Alpha Ltd” here is “Jo Bloggs is a director of this client” on Alpha Ltd’s file. Other names (a maiden name, a former company name) are found by Go to and every client picker.'
    ]
  },
  {
    id: 'deadlines',
    title: 'Deadlines, the calendar and tasks',
    where: 'Compliance → Deadlines, Work → Calendar, Work → Tasks',
    route: 'deadlines',
    points: [
      'One list of open deadlines: the deadline register and the due dates on client records, leaving out former clients and dissolved companies. Home, Deadlines, Calendar, Forecast, Reports, the client file and the assistant all count from it, so their numbers agree.',
      'Calendar: arrow keys move a day or a week, Home and End go to the start or end of the week, Page Up and Page Down change the month, and Enter lists the day’s deadlines.',
      'Tasks are grouped as overdue, due today, in the next 7 days and later; done tasks are listed below them.'
    ]
  },
  {
    id: 'keyboard',
    title: 'Keyboard, screen readers and movement',
    where: 'Every screen',
    points: [
      'Tab and Shift Tab move between controls, and an outline shows where you are. Space or Enter presses a button.',
      'Escape closes a dialog, and the keyboard goes back to where it was. While a dialog is open, the screen behind it can’t be reached.',
      'A question such as “Delete this client?” is a dialog too. For anything that can’t be undone, the safe answer is chosen first.',
      'Every button and field has a name a screen reader can read. Messages that appear (saved, couldn’t be saved) are read out as they appear.',
      'Movement follows the computer’s reduce-motion setting. Settings → General → Visual effects: Lite turns it off as well.'
    ]
  },
  {
    id: 'backups',
    title: 'Backups and the recovery sheet',
    where: 'Settings → General → Backups',
    route: 'settings',
    points: [
      'A backup holds the practice database and every stored document, encrypted with the practice’s key. Backups run on a schedule (daily at 12:30 to start with), and a missed one is made at the next start.',
      'Choose a backup folder on another drive, a NAS or a USB drive: one in the app’s own folder is lost with the computer.',
      'To restore on another computer you need the backup folder and the recovery sheet. Keep the sheet sealed and locked away, apart from the computer.'
    ]
  },
  {
    id: 'security',
    title: 'Security and the audit log',
    where: 'System → Security',
    route: 'fortress',
    points: [
      'The sentence at the top of Security says whether everything is in order, and if not, what needs attention now and what needs a look.',
      'Every change to a record is kept in the audit log with who made it and the values before and after. The log is sealed, so a change made outside the app shows. Partners and managers can filter it and export it.',
      'Partners and managers change the vault passphrase here; every stored login is sealed again with it at once.'
    ]
  },
  {
    id: 'assistant',
    title: 'The assistant',
    where: 'The title bar → AI assistant',
    route: 'ai',
    points: [
      'The assistant runs on this computer with Ollama: nothing is sent anywhere. It checks first that Ollama is installed and running, and says what to do if it isn’t.',
      'It writes the briefings on Forecast and in the client file, and is never given a client’s tax references, National Insurance number or codes.'
    ]
  }
]

export interface Release {
  /** "4F", "4E": the bundle, while version 5.0.0 is built up. */
  bundle: string
  title: string
  items: readonly string[]
}

/** What changed, newest first. */
export const WHATS_NEW: readonly Release[] = [
  {
    bundle: '5',
    title: 'Ready to install on Windows',
    items: [
      'AETERNA CRM has its own icon, and an installer: it installs just for you without an administrator (or for everyone, with one), lets you choose the folder, and can start the app when it finishes.',
      'Uninstalling keeps the practice’s data unless you tick “Also remove my data” and confirm it. Installing a new version over this one never removes it.',
      'A menu: Edit, View (zoom and full screen) and Help (these guides, contacting support, and the download page). On Windows it appears when you press Alt.',
      'About and help says how to get a newer version: a full installer from the download page, run over this one.',
      'A smaller app: it now carries only what it runs.'
    ]
  },
  {
    bundle: '4F',
    title: 'The client file’s registers, and the app made consistent',
    items: [
      'The client file now changes payroll schemes and payroll years, workplace pensions, the Self Assessment registration and sources of income, linked clients and other names.',
      'A workplace pension’s duties start date adds its re-declaration deadlines; changing the date moves them, and removing the pension archives them.',
      'Other names are found by Go to and by every client picker.',
      'Reports, the client file and the assistant now count deadlines the same way as Home, Deadlines and Forecast.',
      'Calendar and Tasks rebuilt: a month you can move through with the keyboard, and tasks grouped by when they are due.',
      'Every question the app asks is now its own dialog, and every dialog keeps the keyboard inside until it closes.',
      'Easier to read: faint text made clearer, every button and field named for screen readers, and a “Skip to the screen” link.',
      'Editing a client: Cancel no longer saves the changes, the tick boxes work from the keyboard, statuses come from the practice’s own list, and references are checked as you type.',
      'Pasting clients from a spreadsheet reads names with commas and quotes correctly.',
      'Help (this screen) has short guides and a support form.'
    ]
  },
  {
    bundle: '4E',
    title: 'Forecast, Security and the assistant check',
    items: [
      'Practice → Forecast: deadlines, work and money in the months ahead, with an optional briefing from the assistant.',
      'System → Security: the practice’s protection in one place, sign-in history, and the audit log sealed against changes.',
      'The assistant checks it can run, and says how to install Ollama when it can’t.'
    ]
  },
  {
    bundle: '4D',
    title: 'Activity, Risk and notifications',
    items: [
      'A bell, a notifications list, toasts and desktop notifications.',
      'Every client scored for risk, with reasons that can each be opened.',
      'Companies House kept up to date by a daily check, and the stream for firms with a key.'
    ]
  }
]
