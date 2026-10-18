import { describe, expect, it } from 'vitest'
import { fmtSetsGrouped } from './format'
import type { SetLog } from './types'

const s = (weight: number, reps: number): SetLog => ({ kind: 'normal', done: true, weight, reps })

describe('fmtSetsGrouped', () => {
  it('accorpa le serie consecutive uguali', () => {
    expect(fmtSetsGrouped('weight_reps', [s(50, 8), s(50, 8), s(50, 8), s(50, 6)])).toBe('3 × 8 a 50 kg · 1 × 6 a 50 kg')
  })
  it('non accorpa serie uguali separate da una diversa', () => {
    expect(fmtSetsGrouped('weight_reps', [s(50, 8), s(60, 5), s(50, 8)])).toBe('1 × 8 a 50 kg · 1 × 5 a 60 kg · 1 × 8 a 50 kg')
  })
  it('corpo libero e tempo', () => {
    const r = (reps: number): SetLog => ({ kind: 'normal', done: true, reps })
    expect(fmtSetsGrouped('bodyweight', [r(12), r(12)])).toBe('2 × 12 rip.')
    expect(fmtSetsGrouped('timed', [{ kind: 'normal', done: true, seconds: 45 }])).toBe('45 s')
  })
  it('vuoto', () => expect(fmtSetsGrouped('weight_reps', [])).toBe(''))
})
