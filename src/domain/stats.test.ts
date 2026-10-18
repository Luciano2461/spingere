import { describe, expect, it } from 'vitest'
import { epley1RM, setVolume, totalVolume } from './stats'
import type { SetLog } from './types'

const s = (p: Partial<SetLog>): SetLog => ({ kind: 'normal', done: true, ...p })

describe('volume', () => {
  it('peso × ripetizioni per serie completate', () => {
    expect(setVolume(s({ weight: 100, reps: 5 }))).toBe(500)
  })
  it('esclude riscaldamento e serie non completate', () => {
    expect(setVolume(s({ kind: 'warmup', weight: 40, reps: 10 }))).toBe(0)
    expect(setVolume(s({ done: false, weight: 100, reps: 5 }))).toBe(0)
  })
  it('l\'assistenza (peso negativo) conta 0', () => {
    expect(setVolume(s({ weight: -20, reps: 8 }))).toBe(0)
  })
  it('somma il totale', () => {
    expect(totalVolume([s({ weight: 50, reps: 10 }), s({ weight: 60, reps: 8 }), s({ kind: 'warmup', weight: 20, reps: 10 })])).toBe(980)
  })
})

describe('Epley', () => {
  it('1 ripetizione = il carico stesso', () => expect(epley1RM(100, 1)).toBe(100))
  it('formula w(1 + r/30)', () => expect(epley1RM(100, 6)).toBeCloseTo(120))
  it('oltre 10 ripetizioni non è affidabile', () => expect(epley1RM(60, 15)).toBeNull())
  it('input non validi', () => {
    expect(epley1RM(0, 5)).toBeNull()
    expect(epley1RM(80, 0)).toBeNull()
  })
})
