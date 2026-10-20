# Email — how messages to clients go out

By default an email opens in the computer's own mail app, ready to check and send from there. A partner or manager can instead have AETERNA CRM send it directly through an SMTP server, Microsoft 365 or Resend. Those three are off until one is set up in Settings → Email.

## 1. The four ways

| Way | What happens when someone presses the button | Set-up |
|---|---|---|
| **Your mail app** (default) | The message opens in Outlook, Apple Mail or whichever mail app the computer uses. The person checks it and sends it there. | None |
| **SMTP server** | The app shows the message to check, then sends it through the practice's mail provider. | Server, port, username, password (usually an app password) |
| **Microsoft 365** | The same, sent from the practice's Microsoft 365 mailbox. A copy goes in its Sent Items. | A one-off app registration, then a sign-in |
| **Resend** | The same, sent through Resend. | An API key and a verified sending domain |

Communications, the email templates on a client's page and the template editor all send the same way. Before anything is sent from the app, a dialog shows who it comes from, who it goes to and the whole message. Every field can still be changed there. Blanks still to fill in are listed, such as `{deadline_date}` or `[date]`.

The client's details are filled into a template first: name, contact, codes, due dates, the fee, the firm's name and your name. Anything that depends on the job, such as the deadline or the tax year, is left for you. The exception is *Suggest one* in Communications: it fills in the deadline, period or amount that led to the suggestion.

A message too long for a `mailto:` link opens in the mail app with a one-line note, and the whole message goes on the clipboard to paste in.

## 2. What is recorded

Every email to a client goes in the client's conversation (Clients → Communications):

| Recorded | |
|---|---|
| Who sent it, and when | The signed-in person, whatever the screen sends |
| Who it went to | The To and Cc addresses |
| How | Mail app, SMTP, Microsoft 365 or Resend |
| The whole message | As sent, as well as a preview |
| What happened | **Sent** (with the mail service's message id), **Not sent** (with why), **Opened in mail app**, or **Sending** |

When sending from the app, the message is recorded as "Sending" before it goes. It then becomes "Sent" or "Not sent", so a crash part-way still leaves a record. Each step is in the audit log too.

Staff can send only to their own clients. Sending counts as a change, so it stops when the app is read-only (an expired licence).

## 3. Setting up

### SMTP server
Settings → Email → **SMTP server**:
- **Server, port and security.** STARTTLS on port 587, or TLS on port 465.
- **Username and password.** Gmail, iCloud, Yahoo and most other providers need an *app password* made in the account's security settings, not the account password. With Gmail, 2-Step Verification must be on first.
- **The address emails come from.**

Save, then **Send a test**.

The connection must be encrypted, and the server's certificate must be one the computer trusts. Otherwise nothing is sent.

**Microsoft 365 mailboxes: use the Microsoft 365 option, not SMTP.** Microsoft is retiring password sign-in ("Basic authentication") for SMTP in Exchange Online. It is due to be off by default for existing tenants from the end of December 2026, with a final removal date to be announced in the second half of 2027 ([MC786329](https://mc.merill.net/message/MC786329), [summary](https://www.captaindns.com/en/blog/microsoft-exchange-basic-auth-smtp-end)).

### Microsoft 365
This sends through Microsoft Graph with OAuth: no password is stored, and multi-factor sign-in applies. It needs one app registration in the practice's own Microsoft 365, made once by an administrator:

1. Sign in to the Microsoft Entra admin centre (entra.microsoft.com) as an administrator.
2. **App registrations → New registration.** Name it AETERNA CRM, and choose *Accounts in this organisational directory only*.
3. Under **Redirect URI**, choose *Public client/native (mobile & desktop)* and enter `http://localhost`. Register.
4. **Authentication → Advanced settings → Allow public client flows: Yes.** Save.
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions:** add *Mail.Send* and *User.Read*. Then choose **Grant admin consent**.
6. From **Overview**, copy the *Directory (tenant) ID* and the *Application (client) ID*.

Then in Settings → Email → **Microsoft 365**:
1. Enter the two IDs and choose **Sign in to Microsoft 365…**.
2. A browser opens. Sign in with the mailbox the practice sends from, such as `office@…`.
3. Once signed in, emails are sent through Microsoft 365. **Send a test** to check.

**What is kept:** the sign-in is encrypted with the practice key.
- It renews itself as it is used.
- After a password change, withdrawn access, or about 90 days without sending, the app asks for the sign-in again.
- **Sign out** forgets it and goes back to the mail app.

**If the sign-in fails**, the app says why in plain words:

| The message mentions | Fix |
|---|---|
| The application (client) ID isn't registered | Wrong ID, or the app is in another organisation |
| The redirect URI | Step 3 above |
| Public client flows | Step 4 above |
| Consent | Step 5's *Grant admin consent* |
| The organisation's access rules | A Conditional Access policy; ask the Microsoft 365 administrator |

### Resend
Settings → Email → **Resend**:
1. Enter an API key from resend.com (sending access is enough).
2. Enter the address emails come from. It must be on a domain verified in Resend.
3. Save, then **Send a test**.

## 4. Security

- **Secrets:** SMTP passwords, Resend keys and the Microsoft 365 sign-in are encrypted with the practice key, the same key that encrypts the database. They are never shown again; type a new one to replace one. The audit log records that a secret was replaced, never its value.
- **No added headers:** addresses must be plain addresses, and line breaks are taken out of subjects, so a message can't be given extra recipients or headers.
- **No attachments:** nothing is attached, and the mail library is set never to read a file from a path or a URL.
- **Proxies:** requests to Microsoft 365 and Resend go through the computer's own network settings, including any proxy. SMTP connects straight to the mail server.
- **The Microsoft 365 sign-in:**
  - only Microsoft's sign-in page can be opened from it;
  - the reply is taken only on this computer (127.0.0.1), only once, and only with the code this sign-in asked for (PKCE and a random state).

## 5. What's tested automatically

`npm test` covers:
- the address and subject checks, and the `mailto:` link with its clipboard fallback;
- SMTP against a real local mail server:
  - sent over STARTTLS with the username and password;
  - a wrong password explained;
  - nothing sent when the server offers no encryption, or its certificate isn't trusted;
- Resend: the request sent, and refusals explained;
- Microsoft 365, against a stand-in for Microsoft:
  - the browser sign-in with PKCE;
  - a cancelled sign-in, and a reply that isn't for this sign-in;
  - sending through Graph;
  - renewing an expired token, and asking to sign in again when renewal stops working;
- the message log for the mail app, SMTP sent and SMTP failed;
- staff limited to their own clients;
- secrets never appearing in settings, the database or the audit log.
