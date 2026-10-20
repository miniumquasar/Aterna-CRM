import { forwardRef } from 'react'
import { Search, X } from 'lucide-react'
import { TextInput } from './TextInput'
import { Kbd } from './Kbd'

/**
 * A search box: a magnifier, a clear button once something is typed, and
 * Escape to clear.
 *
 * @prop value        What is typed.
 * @prop onChange     Called as the person types.
 * @prop label        Its accessible name ('Search clients').
 * @prop placeholder  Example text ('Name, code or company number').
 * @prop onSubmit     Called on Enter.
 * @prop shortcut     A key hint shown at the right ('/', 'Ctrl K').
 * @prop size         'sm' | 'md' (default).
 */
export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  onSubmit?: (value: string) => void
  shortcut?: string
  size?: 'sm' | 'md'
  autoFocus?: boolean
  className?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, label, placeholder, onSubmit, shortcut, size = 'md', autoFocus, className },
  ref
) {
  return (
    <TextInput
      ref={ref}
      type="search"
      role="searchbox"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      size={size}
      autoFocus={autoFocus}
      className={className}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && value) {
          e.preventDefault()
          e.stopPropagation()
          onChange('')
        } else if (e.key === 'Enter') onSubmit?.(value)
      }}
      leading={<Search size={15} aria-hidden />}
      trailing={
        value ? (
          <button type="button" aria-label="Clear the search" onClick={() => onChange('')} className="rounded p-0.5 text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
            <X size={14} aria-hidden />
          </button>
        ) : shortcut ? (
          <Kbd>{shortcut}</Kbd>
        ) : undefined
      }
    />
  )
})
