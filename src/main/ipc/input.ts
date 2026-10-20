/**
 * Checking what a screen sent before using it. Each helper returns the clean
 * value or throws an 'invalid' UserFacingError naming the field, in words a
 * person can act on:
 *
 *   const body = record(req)
 *   const name = requiredText(body.name, 'name', 'The client’s name', { max: 200 })
 *   const yearEnd = optionalDate(body.year_end, 'year_end', 'The year end')
 */
import { isCivilDate, type CivilDate } from '@shared/domain/dates'
import { isPence } from '@shared/domain/money'
import { invalid } from './errors'

/** The request as an object with named fields. */
export function record(req: unknown): Record<string, unknown> {
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw invalid('Nothing was sent to save.')
  return req as Record<string, unknown>
}

export interface TextRules {
  /** Longest allowed, after trimming. Defaults to 2,000 characters. */
  max?: number
  /** Shortest allowed, after trimming. */
  min?: number
}

export function optionalText(value: unknown, field: string, label: string, rules: TextRules = {}): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' && typeof value !== 'number') throw invalid(`${label} must be text.`, field)
  const text = String(value).trim()
  if (text === '') return null
  const max = rules.max ?? 2000
  if (text.length > max) throw invalid(`${label} can be at most ${max.toLocaleString('en-GB')} characters.`, field)
  if (rules.min !== undefined && text.length < rules.min) throw invalid(`${label} must be at least ${rules.min} characters.`, field)
  return text
}

export function requiredText(value: unknown, field: string, label: string, rules: TextRules = {}): string {
  const text = optionalText(value, field, label, rules)
  if (text === null) throw invalid(`Enter ${label.charAt(0).toLowerCase()}${label.slice(1)}.`, field)
  return text
}

export interface NumberRules {
  min?: number
  max?: number
}

export function optionalInteger(value: unknown, field: string, label: string, rules: NumberRules = {}): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? Number(value.trim()) : value
  if (typeof n !== 'number' || !Number.isInteger(n)) throw invalid(`${label} must be a whole number.`, field)
  if (rules.min !== undefined && n < rules.min) throw invalid(`${label} must be ${rules.min} or more.`, field)
  if (rules.max !== undefined && n > rules.max) throw invalid(`${label} must be ${rules.max} or less.`, field)
  return n
}

export function requiredInteger(value: unknown, field: string, label: string, rules: NumberRules = {}): number {
  const n = optionalInteger(value, field, label, rules)
  if (n === null) throw invalid(`Enter ${label.charAt(0).toLowerCase()}${label.slice(1)}.`, field)
  return n
}

/** A record id: a whole number from 1 up. */
export function requiredId(value: unknown, field = 'id', label = 'The record'): number {
  const n = optionalInteger(value, field, label, { min: 1 })
  if (n === null) throw invalid(`${label} wasn’t given.`, field)
  return n
}

export function optionalBoolean(value: unknown, field: string, label: string): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (value === 0 || value === 1) return value === 1
  throw invalid(`${label} must be yes or no.`, field)
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, label: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw invalid(`${label} isn’t one of the choices.`, field)
}

export function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, label: string): T | null {
  if (value === null || value === undefined || value === '') return null
  return oneOf(value, allowed, field, label)
}

export function optionalDate(value: unknown, field: string, label: string): CivilDate | null {
  if (value === null || value === undefined || value === '') return null
  if (!isCivilDate(value)) throw invalid(`${label} isn’t a real date.`, field)
  return value
}

export function requiredDate(value: unknown, field: string, label: string): CivilDate {
  const d = optionalDate(value, field, label)
  if (d === null) throw invalid(`Enter ${label.charAt(0).toLowerCase()}${label.slice(1)}.`, field)
  return d
}

/** Whole pence, as the screens send money. */
export function optionalPence(value: unknown, field: string, label: string, allowNegative = false): number | null {
  if (value === null || value === undefined) return null
  if (!isPence(value, true)) throw invalid(`${label} must be an amount in pounds and pence.`, field)
  if (!allowNegative && value < 0) throw invalid(`${label} can’t be below zero.`, field)
  return value
}
