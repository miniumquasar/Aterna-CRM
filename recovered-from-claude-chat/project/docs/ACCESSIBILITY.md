# Using AETERNA CRM from the keyboard, with a screen reader, and with less movement

The app is meant to work fully from the keyboard and with a screen reader (NVDA or Narrator on Windows, VoiceOver on a Mac), and to follow the computer's settings for movement. The aim is WCAG 2.2 level AA. If something falls short, tell support (About and help → *Ask for help*): say which screen and what you were doing.

## Moving around

| Keys | What they do |
|---|---|
| **Tab**, **Shift Tab** | The next or previous button, field or link. An outline shows where you are. |
| **Tab** once, from the top of the window | *Skip to the screen*: past the sidebar and title bar, to the screen's title. |
| **Ctrl K** (⌘K on a Mac) | Go to…: a client by name, client code, trading name, company number or other name, or any screen. |
| **Enter**, **Space** | Press a button; tick or untick a box. |
| **Arrow keys** | Between the tabs at the top of a screen, once one has focus; through Go to…'s results; through the options of a list. |
| **Escape** | Close a dialog or Go to…. |

**The client list.** Each client's name is a button that shows their details beside the list. The buttons at the end of the row (open the client file, edit, delete) appear when the row has focus, as they do under the mouse. The column headings are buttons too: press one to sort by it, and again to sort the other way.

**The client file.** The links at the top jump to each part (deadlines, contacts, payroll, pensions, Self Assessment, links and other names, the record, the registers), and move the keyboard there.

**The calendar.** The month is a grid of days:
- the **arrow keys** move a day (left and right) or a week (up and down);
- **Home** and **End** go to the start or end of the week;
- **Page Up** and **Page Down** change the month;
- **Enter** lists that day's deadlines below the grid, each with a button to open the client file.

## Dialogs and questions

- A dialog takes the keyboard when it opens, and **Tab stays inside it** until it closes. The screen behind can't be reached meanwhile, by the keyboard or a screen reader.
- **Escape** closes it, unless it is busy saving. The keyboard goes back to the button that opened it.
- Questions such as *Delete this client?* are dialogs too. For anything that can't be undone, the safe answer (*Cancel*) has the keyboard first, so pressing Enter by habit changes nothing.

## Screen readers

- Every screen has one main heading, its title, and each part of a screen has a heading below it.
- Every button says what it does and to what: *Delete Alpha Ltd*, not just *Delete*. Buttons that show only an icon have a name.
- Every field has a label that is read with it, and says when it is needed. Hints and checks under a field are read with it too.
- Changes that appear without moving the keyboard — *Saved*, an error, a new screen's title, the number of results — are read out.
- Icons that only decorate are hidden from screen readers.

## Reading the screen

- Text is at least 4.5 to 1 against its background, and meaningful icons at least 3 to 1. The faint greys of earlier versions were raised to meet this in Level 4F.
- Nothing is told by colour alone: a deadline's state is in words (*3 days overdue*), a tile's state has a word beside its dot, and a status has its name.
- The app can be zoomed with **Ctrl +** and **Ctrl −** (⌘ on a Mac), and **Ctrl 0** sets it back.

## Movement

- When the computer asks for reduced motion (Windows: Settings → Accessibility → Visual effects → *Animation effects* off; macOS: System Settings → Accessibility → Display → *Reduce motion*), the app's animations and transitions stop.
- **Settings → General → Visual effects: Lite** does the same, whatever the computer is set to. *Standard* uses short fades; *Rich* adds a brighter glow.
- Nothing flashes, and nothing moves on its own for more than a moment.

## Known gaps

These are being worked on and are listed in the release plan:
- The older screens built before Level 4 (Settings → General, the email templates editor, the assistant) still mix their own colours with the app's; their text meets the contrast level, but their look differs.
- Charts on Reports show their figures as a table only on hover; a table view for each chart is planned.
