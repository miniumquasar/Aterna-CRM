import type { Client } from '@shared/types'
import { formatPence } from '@shared/money'

/** The firm's own details for {firm_name} and {firm_phone}; read once. */
let firm: Promise<{ name: string; phone: string }> | null = null
function firmDetails(): Promise<{ name: string; phone: string }> {
  firm ??= window.api
    .getFirmData()
    .then((f) => ({ name: f?.name ?? '', phone: f?.phone ?? '' }))
    .catch(() => ({ name: '', phone: '' }))
  return firm
}

const longDate = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** What each placeholder becomes for this client. Ones that depend on the job ({deadline_date}, {tax_year}…) are left for the person. */
export async function placeholderValues(client: Client | null, yourName?: string | null): Promise<Record<string, string>> {
  const f = await firmDetails()
  const values: Record<string, string> = {
    firm_name: f.name,
    firm_phone: f.phone,
    your_name: yourName ?? '',
    today: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  if (client) {
    Object.assign(values, {
      client_name: client.client_name || '',
      contact_name: client.contact_name || client.director || client.client_name || '',
      email: client.email || '',
      phone: client.phone || '',
      ref: client.ref || '',
      reg_no: client.reg_no || '',
      utr: client.utr || '',
      ct_ref: client.ct_ref || '',
      vat_no: client.vat_no || '',
      vat_scheme: client.vat_scheme || '',
      paye_ref: client.paye_ref || '',
      no_employees: client.no_employees != null ? String(client.no_employees) : '',
      assigned_to: client.assigned_to || '',
      accounts_due: longDate(client.accounts_due),
      ct_due: longDate(client.ct_next_due),
      vat_due: longDate(client.vat_due),
      annual_fee: client.annual_fee_pence != null ? formatPence(client.annual_fee_pence) : ''
    })
  }
  return values
}

const BRACKETS: Record<string, string> = { '[Your Name]': 'your_name', '[Firm Name]': 'firm_name', '[Phone]': 'firm_phone' }

/**
 * Fills the placeholders it knows — {client_name} and the like, and the
 * [Your Name], [Firm Name] and [Phone] of the built-in templates. Blank values
 * stay as placeholders, so nothing goes out empty.
 */
export function fill(text: string, values: Record<string, string>): string {
  return text
    .replace(/\{([a-z_]+)\}/g, (whole, key: string) => (values[key] ? values[key] : whole))
    .replace(/\[(Your Name|Firm Name|Phone)\]/g, (whole) => values[BRACKETS[whole]] || whole)
}

/** Blanks still in a message, e.g. ["{deadline_date}", "[date]"]. */
export const unfilled = (text: string): string[] => [...new Set(text.match(/\{[a-z_]+\}|\[[A-Za-z][A-Za-z ]{1,30}\]/g) ?? [])]
