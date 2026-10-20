/**
 * CSV files the practice opens in Excel, written the same way by the screens
 * and the main process. A value that starts with = + - @ (or a tab or carriage
 * return) is kept as text with a leading apostrophe, so a client's name or note
 * can never run as a formula when the file is opened. Plain numbers, negative
 * ones included, stay numbers.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const csvText = (header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string =>
  [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n')

/** A byte-order mark, so Excel reads £ and accented names correctly. */
export const CSV_BOM = '﻿'
