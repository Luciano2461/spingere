import { describe, expect, it } from 'vitest'
import { exerciseHistory } from './history'
import {
  bucketRange, exerciseList, exerciseSeries, fmtPerWeek, metricsFor, muscleSets, periodStart, periodSummary, recentRecords, sessionsSince, summarySentence,
  type MuscleInfo,
} from './progress'
import type { Session, SessionEntry, SetLog } from './types'

const set = (p: Partial<SetLog> = {}): SetLog => ({ kind: 'normal', done: true, weight: 50, reps: 10, ...p })
const entry = (exerciseId: string, sets: SetLog[], type: SessionEntry['type'] = 'weight_reps'): SessionEntry => ({ exerciseId, nameSnapshot: exerciseId, type, sets })
const local = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString()
const session = (id: string, startedAt: string, entries: SessionEntry[]): Session => ({ id, startedAt, endedAt: startedAt, status: 'done', entries, groups: [], notes: '' })

describe('periodi', () => {
  const now = new Date(2026, 9, 14, 15) // 14 ott 2026
  it('inizio periodo a mezzanotte locale', () => {
    expect(periodStart('4w', now)).toEqual(new Date(2026, 8, 17))
    expect(periodStart('3m', now)).toEqual(new Date(2026, 6, 14))
    expect(periodStart('1y', now)).toEqual(new Date(2025, 9, 14))
    expect(periodStart('all', now)).toBeNull()
  })
  it('filtra le sessioni dal giorno di inizio incluso', () => {
    const a = session('a', local(2026, 9, 17, 0), [])
    const b = session('b', local(2026, 9, 16), [])
    expect(sessionsSince([a, b], periodStart('4w', now)).map((s) => s.id)).toEqual(['a'])
  })
  it('riepilogo: serie di lavoro e volume, senza riscaldamento', () => {
    const s = session('a', local(2026, 10, 1), [entry('x', [set({ weight: 100, reps: 5 }), set({ kind: 'warmup' }), set({ done: false })])])
    expect(periodSummary([s])).toEqual({ workouts: 1, sets: 1, volume: 500 })
  })
})

describe('intervalli settimana/mese', () => {
  const now = new Date(2026, 9, 14, 15) // mercoledì
  it('settimana da lunedì a lunedì', () => {
    expect(bucketRange('week', now)).toEqual({ from: new Date(2026, 9, 12), to: new Date(2026, 9, 19) })
    expect(bucketRange('week', now, -1)).toEqual({ from: new Date(2026, 9, 5), to: new Date(2026, 9, 12) })
  })
  it('domenica appartiene alla settimana che finisce', () => {
    expect(bucketRange('week', new Date(2026, 9, 18)).from).toEqual(new Date(2026, 9, 12))
  })
  it('mese corrente e precedente', () => {
    expect(bucketRange('month', now)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) })
    expect(bucketRange('month', now, -1).from).toEqual(new Date(2026, 8, 1))
  })
})

describe('serie per muscolo', () => {
  const muscles = new Map<string, MuscleInfo>([
    ['panca', { primary: ['chest'], secondary: ['triceps', 'shoulders'] }],
    ['custom', { primary: [], secondary: [] }],
  ])
  const from = new Date(2026, 9, 1)
  const to = new Date(2026, 10, 1)
  it('principali per intero, secondari a metà, riscaldamento escluso', () => {
    const s = session('a', local(2026, 10, 5), [entry('panca', [set(), set(), set({ kind: 'warmup' })])])
    const { totals, unknownSets } = muscleSets([s], muscles, from, to)
    expect(totals).toEqual([
      { muscle: 'chest', sets: 2 },
      { muscle: 'shoulders', sets: 1 },
      { muscle: 'triceps', sets: 1 },
    ])
    expect(unknownSets).toBe(0)
  })
  it('conta a parte gli esercizi senza muscoli e quelli sconosciuti; ignora le sessioni fuori intervallo', () => {
    const s = session('a', local(2026, 10, 5), [entry('custom', [set()]), entry('sconosciuto', [set(), set()])])
    const old = session('b', local(2026, 9, 5), [entry('panca', [set()])])
    expect(muscleSets([s, old], muscles, from, to)).toEqual({ totals: [], unknownSets: 3 })
  })
})

describe('serie temporali', () => {
  const a = session('a', local(2026, 1, 1), [entry('x', [set({ weight: 100, reps: 5 }), set({ weight: 90, reps: 8 }), set({ kind: 'warmup', weight: 200, reps: 1 })])])
  const b = session('b', local(2026, 2, 1), [entry('x', [set({ weight: 80, reps: 15 })])])
  const items = exerciseHistory([b, a], 'x')
  it('carico massimo e volume per sessione, in ordine cronologico', () => {
    expect(exerciseSeries(items, 'weight').points.map((p) => p.value)).toEqual([100, 80])
    expect(exerciseSeries(items, 'volume').points.map((p) => p.value)).toEqual([500 + 720, 1200])
  })
  it('massimale stimato: oltre 10 ripetizioni la sessione non ha punto e la serie è segnalata', () => {
    const r = exerciseSeries(items, 'e1rm')
    expect(r.points).toHaveLength(1)
    expect(r.points[0].value).toBeCloseTo(100 * (1 + 5 / 30))
    expect(r.excludedSets).toBe(1)
  })
  it('metriche per tipo di esercizio', () => {
    expect(metricsFor('weight_reps')).toEqual(['weight', 'volume', 'e1rm'])
    expect(metricsFor('timed')).toEqual(['seconds'])
  })
  it('corpo libero: ripetizioni massime', () => {
    const s = session('c', local(2026, 3, 1), [entry('t', [{ kind: 'normal', done: true, reps: 12 }, { kind: 'normal', done: true, reps: 15 }], 'bodyweight')])
    expect(exerciseSeries(exerciseHistory([s], 't'), 'reps').points[0].value).toBe(15)
  })
})

describe('elenchi', () => {
  it('esercizi dal più recente, con conteggio sessioni', () => {
    const a = session('a', local(2026, 1, 1), [entry('x', [set()]), entry('y', [set()])])
    const b = session('b', local(2026, 2, 1), [entry('x', [set()])])
    expect(exerciseList([a, b]).map((e) => [e.exerciseId, e.sessions])).toEqual([['x', 2], ['y', 1]])
  })
  it('record recenti: uno per esercizio e sessione, con più tipi uniti', () => {
    const a = session('a', local(2026, 1, 1), [entry('x', [set({ weight: 60, reps: 8 })])])
    const b = session('b', local(2026, 2, 1), [entry('x', [set({ weight: 80, reps: 8 })])])
    const r = recentRecords([a, b])
    expect(r).toHaveLength(1)
    expect(r[0].session.id).toBe('b')
    expect(r[0].kinds).toContain('weight')
  })
})

describe('testi delle statistiche', () => {
  it('frase di riepilogo con singolari', () => {
    expect(summarySentence('3m', 12, 140)).toBe('Negli ultimi 3 mesi hai fatto 12 allenamenti e 140 serie.')
    expect(summarySentence('4w', 1, 1)).toBe('Nelle ultime 4 settimane hai fatto 1 allenamento e 1 serie.')
    expect(summarySentence('all', 0, 0)).toMatch(/non hai ancora/)
  })
  it('frequenza: «meno di 1» sotto una a settimana', () => {
    expect(fmtPerWeek(0)).toBe('0')
    expect(fmtPerWeek(0.2)).toBe('meno di 1')
    expect(fmtPerWeek(2.34)).toBe('2,3')
  })
})
