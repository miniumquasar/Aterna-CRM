/**
 * The only places a link may open outside the app: gov.uk services (HMRC,
 * Companies House), the assistant's installer, the vendor's site, Microsoft's
 * sign-in page (for the optional Microsoft 365 email setting), email and
 * WhatsApp. Everything else is refused. Each host also allows its subdomains.
 */
const ALLOWED_HOSTS: readonly string[] = ['gov.uk', 'ollama.com', 'bitopi.co.uk', 'login.microsoftonline.com']

/** True for a URL the app may hand to the operating system. */
export function isAllowedExternalUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol === 'mailto:') return true
  if (url.protocol !== 'https:') return false
  if (url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  if (host === 'wa.me') return true
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}
