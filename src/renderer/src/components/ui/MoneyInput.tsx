import { useState, type InputHTMLAttributes } from 'react'
import { formatPenceNoSymbol, parsePounds, penceToPounds } from '@shared/domain/money'
import { TextInput } from './TextInput'

/**
 * An amount in pounds, held as whole pence. Typing '1,250' or '£1250.5' is
 * read with the shared money rules; the box tidies to '1,250.00' when you
 * leave it. A typing mistake is reported through `onValidityChange` (put it
 * in the Field's error) and `onChange` isn't called until it's fixed.
 *
 * @prop value            Pence, or null for no amount.
 * @prop onChange         Called with pence (or null when emptied) whenever the text is a valid amount.
 * @prop allowNegative    Accept amounts below zero (credits).
 * @prop label            How the amount is named in its error ('The fee'); defaults to 'The amount'.
 * @prop onValidityChange Called with an error sentence, or null when the text is valid.
 * @prop invalid          Marks it invalid.
 */
export interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'size'> {
  value: number | null
  onChange: (pence: number | null) => void
  allowNegative?: boolean
  label?: string
  onValidityChange?: (error: string | null) => void
  invalid?: boolean
}

export function MoneyInput({ value, onChange, allowNegative = false, label, onValidityChange, invalid, onBlur, onFocus, ...rest }: MoneyInputProps): JSX.Element {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // While typing (or while the text has a mistake) the box shows what was typed; otherwise the tidy amount.
  const shown = editing || error !== null ? text : value === null ? '' : formatPenceNoSymbol(value)

  const read = (next: string): void => {
    setText(next)
    const parsed = parsePounds(next, { allowNegative, label })
    const message = parsed.ok ? null : parsed.error
    setError(message)
    onValidityChange?.(message)
    if (parsed.ok) onChange(parsed.pence)
  }

  return (
    <TextInput
      inputMode="decimal"
      autoComplete="off"
      {...rest}
      value={shown}
      invalid={invalid ?? (error !== null || undefined)}
      leading={<span aria-hidden>£</span>}
      onFocus={(e) => {
        if (error === null) setText(value === null ? '' : penceToPounds(value))
        setEditing(true)
        onFocus?.(e)
      }}
      onChange={(e) => read(e.target.value)}
      onBlur={(e) => {
        setEditing(false)
        onBlur?.(e)
      }}
    />
  )
}
