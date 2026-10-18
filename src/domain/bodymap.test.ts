import { describe, expect, it } from 'vitest'
import muscles from '../data/muscles.json'
import { ALL_SHAPES, BACK, FRONT } from '../ui/bodyMapShapes'
import { heatLevel } from './bodymap'

describe('livelli di intensità', () => {
  it('zero o dati non validi: nessun colore', () => {
    expect(heatLevel(0, 10)).toBe(0)
    expect(heatLevel(5, 0)).toBe(0)
    expect(heatLevel(-1, 10)).toBe(0)
    expect(heatLevel(NaN, 10)).toBe(0)
  })
  it('da poco a tanto in quattro livelli, il massimo è sempre 4', () => {
    expect(heatLevel(0.5, 10)).toBe(1)
    expect(heatLevel(2.5, 10)).toBe(1)
    expect(heatLevel(2.6, 10)).toBe(2)
    expect(heatLevel(5, 10)).toBe(2)
    expect(heatLevel(7.5, 10)).toBe(3)
    expect(heatLevel(10, 10)).toBe(4)
    expect(heatLevel(3, 3)).toBe(4)
  })
})

describe('sagoma del corpo', () => {
  it('ogni muscolo del database compare in almeno una vista (e nessuno è inventato)', () => {
    const drawn = new Set(ALL_SHAPES.map((s) => s.muscle))
    for (const key of Object.keys(muscles)) expect(drawn.has(key), key).toBe(true)
    for (const key of drawn) expect(key in muscles, key).toBe(true)
  })
  it('nessun muscolo ripetuto nella stessa vista', () => {
    for (const view of [FRONT, BACK]) expect(new Set(view.map((s) => s.muscle)).size).toBe(view.length)
  })
  it('le forme stanno nella metà sinistra (x ≤ 100), così lo specchio è corretto', () => {
    for (const { muscle, d } of ALL_SHAPES) {
      const xs = [...d.matchAll(/[MLC]?\s*(-?\d+(?:\.\d+)?)\s+-?\d+(?:\.\d+)?/g)].map((m) => Number(m[1]))
      expect(Math.max(...xs), muscle).toBeLessThanOrEqual(100)
    }
  })
})
