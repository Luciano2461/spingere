import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrateData } from './migrations'

describe('migrateData', () => {
  const steps = {
    1: (d: Record<string, unknown>) => ({ ...d, a: 1 }),
    2: (d: Record<string, unknown>) => ({ ...d, b: 2 }),
  }
  it('applica le migrazioni in sequenza', () => {
    expect(migrateData({}, 1, 3, steps)).toEqual({ a: 1, b: 2 })
  })
  it('non fa nulla se già aggiornato', () => {
    expect(migrateData({ x: 1 }, 3, 3, steps)).toEqual({ x: 1 })
  })
  it('rifiuta dati più recenti dell\'app', () => {
    expect(() => migrateData({}, 4, 3, steps)).toThrow(/più recente/)
  })
  it('segnala migrazioni mancanti', () => {
    expect(() => migrateData({}, 1, 3, { 1: steps[1] })).toThrow(/Manca la migrazione/)
  })
  it('rifiuta versioni non valide', () => {
    expect(() => migrateData({}, 0, 3, steps)).toThrow()
  })
})

describe('migrazioni reali', () => {
  it('v1 → v2 aggiunge aliases e imageChoices senza toccare il resto', () => {
    expect(migrateData({ sessions: [1] }, 1, 2, MIGRATIONS)).toEqual({ sessions: [1], aliases: [], imageChoices: [] })
  })
  it('v1 → v2 non sovrascrive aliases già presenti', () => {
    expect(migrateData({ aliases: [{ id: 'a' }] }, 1, 2, MIGRATIONS)).toEqual({ aliases: [{ id: 'a' }], imageChoices: [] })
  })
})
