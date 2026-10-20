/** Joins class names, skipping the falsy ones: cx('a', on && 'b', null) → 'a b'. */
export type ClassValue = string | false | null | undefined | 0

export function cx(...values: ClassValue[]): string {
  let out = ''
  for (const v of values) if (v) out = out ? `${out} ${v}` : v
  return out
}
