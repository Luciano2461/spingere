import { describe, expect, it } from 'vitest'
import { dismiss, isDismissed, type KeyValueStore } from './dismissals'

const memory = (): KeyValueStore => {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
const DAY = 86_400_000

describe('banner chiusi', () => {
  it('non è chiuso se mai chiuso', () => expect(isDismissed('install', 1000, memory())).toBe(false))
  it('resta chiuso per i giorni indicati e poi ricompare', () => {
    const s = memory()
    dismiss('install', 7, 0, s)
    expect(isDismissed('install', 6 * DAY, s)).toBe(true)
    expect(isDismissed('install', 7 * DAY + 1, s)).toBe(false)
  })
  it('chiavi indipendenti', () => {
    const s = memory()
    dismiss('backup', 3, 0, s)
    expect(isDismissed('install', 1, s)).toBe(false)
  })
  it('senza storage o con storage che lancia non si rompe', () => {
    expect(isDismissed('x', 0, null)).toBe(false)
    expect(() => dismiss('x', 1, 0, null)).not.toThrow()
    const bad: KeyValueStore = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } }
    expect(isDismissed('x', 0, bad)).toBe(false)
    expect(() => dismiss('x', 1, 0, bad)).not.toThrow()
  })
})
