import { describe, expect, it } from 'vitest'
import {
  addDoneSet, dayKey, exerciseBests, exerciseHistory, fromLocalInput, groupByDay, historyBefore, monthGrid, monthSummary,
  removeDoneSet, sessionDuration, toLocalInput, validateTimes,
} from './history'
import type { Session, SessionEntry, SetLog } from './types'

const set = (p: Partial<SetLog> = {}): SetLog => ({ kind: 'normal', done: true, weight: 50, reps: 10, ...p })
const entry = (exerciseId: string, sets: SetLog[]): SessionEntry => ({ exerciseId, nameSnapshot: exerciseId, type: 'weight_reps', sets })
const session = (id: string, startedAt: string, entries: SessionEntry[] = [], p: Partial<Session> = {}): Session => ({
  id, startedAt, endedAt: new Date(new Date(startedAt).getTime() + 3600_000).toISOString(), status: 'done', entries, groups: [], notes: '', ...p,
})
// Orari costruiti in locale, così i test non dipendono dal fuso della macchina.
const local = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

describe('giorni', () => {
  it('usa il giorno locale', () => {
    expect(dayKey(local(2026, 3, 5, 23, 50))).toBe('2026-03-05')
    expect(dayKey(local(2026, 3, 6, 0, 10))).toBe('2026-03-06')
  })
  it('raggruppa le sessioni concluse per giorno in ordine cronologico, ignorando quella in corso', () => {
    const a = session('a', local(2026, 3, 5, 18))
    const b = session('b', local(2026, 3, 5, 8))
    const c = session('c', local(2026, 3, 6), [], { status: 'active' })
    const g = groupByDay([a, b, c])
    expect([...g.keys()]).toEqual(['2026-03-05'])
    expect(g.get('2026-03-05')!.map((s) => s.id)).toEqual(['b', 'a'])
  })
})

describe('griglia del mese', () => {
  it('parte da lunedì e riempie le settimane', () => {
    const g = monthGrid(2026, 2) // marzo 2026: il 1° è domenica
    expect(g.length % 7).toBe(0)
    expect(g[0]).toEqual({ key: '2026-02-23', day: 23, inMonth: false })
    expect(g[6]).toEqual({ key: '2026-03-01', day: 1, inMonth: true })
    expect(g.filter((c) => c.inMonth)).toHaveLength(31)
  })
  it('febbraio che inizia di lunedì e dura 4 settimane esatte', () => {
    const g = monthGrid(2027, 1) // 1 feb 2027 = lunedì, 28 giorni
    expect(g).toHaveLength(28)
    expect(g.every((c) => c.inMonth)).toBe(true)
  })
})

describe('riepilogo del mese', () => {
  it('conta allenamenti, giorni, durata e volume (solo sessioni concluse del mese)', () => {
    const s1 = session('1', local(2026, 3, 5), [entry('x', [set({ weight: 100, reps: 5 }), set({ kind: 'warmup', weight: 40, reps: 10 })])])
    const s2 = session('2', local(2026, 3, 5, 19), [entry('x', [set({ weight: 50, reps: 10 })])])
    const other = session('3', local(2026, 4, 1), [entry('x', [set()])])
    const r = monthSummary([s1, s2, other], 2026, 2)
    expect(r).toEqual({ workouts: 2, trainingDays: 1, seconds: 7200, volume: 1000 })
  })
})

describe('durata', () => {
  it('differenza tra fine e inizio, null se manca o è incoerente', () => {
    expect(sessionDuration(session('a', local(2026, 3, 5)))).toBe(3600)
    expect(sessionDuration(session('a', local(2026, 3, 5), [], { endedAt: undefined }))).toBeNull()
    expect(sessionDuration(session('a', local(2026, 3, 5), [], { endedAt: local(2026, 3, 4) }))).toBeNull()
  })
})

describe('storico per esercizio', () => {
  it('trova le sessioni per ID, dalla più recente', () => {
    const old = session('old', local(2026, 1, 1), [entry('panca', [set()])])
    const mid = session('mid', local(2026, 2, 1), [entry('squat', [set()])])
    const recent = session('new', local(2026, 3, 1), [entry('squat', [set()]), entry('panca', [set()])])
    expect(exerciseHistory([old, mid, recent], 'panca').map((h) => h.session.id)).toEqual(['new', 'old'])
  })
  it('historyBefore esclude la sessione stessa e quelle successive', () => {
    const a = session('a', local(2026, 1, 1))
    const b = session('b', local(2026, 2, 1))
    const c = session('c', local(2026, 3, 1))
    expect(historyBefore([a, b, c], b).map((s) => s.id)).toEqual(['a'])
  })
})

describe('modifica serie di una sessione conclusa', () => {
  const base = session('s', local(2026, 3, 5), [entry('x', [set({ weight: 60, reps: 8 })])])
  it('la nuova serie copia l’ultima e nasce completata', () => {
    const next = addDoneSet(base, 0)
    expect(next.entries[0].sets).toHaveLength(2)
    expect(next.entries[0].sets[1]).toMatchObject({ weight: 60, reps: 8, done: true })
  })
  it('togliendo l’ultima serie sparisce l’esercizio e il suo gruppo', () => {
    const grouped = { ...base, groups: [{ id: 'g', kind: 'superset' as const, restAfterGroup: 60 }], entries: [{ ...base.entries[0], groupId: 'g' }] }
    const next = removeDoneSet(grouped, 0, 0)
    expect(next.entries).toHaveLength(0)
    expect(next.groups).toHaveLength(0)
  })
  it('non muta l’originale', () => {
    addDoneSet(base, 0)
    expect(base.entries[0].sets).toHaveLength(1)
  })
})

describe('date nei campi di modifica', () => {
  it('andata e ritorno ISO ↔ datetime-local', () => {
    const iso = local(2026, 3, 5, 18, 30)
    expect(toLocalInput(iso)).toBe('2026-03-05T18:30')
    expect(fromLocalInput('2026-03-05T18:30')).toBe(iso)
  })
  it('valore vuoto o non valido', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('xx')).toBeNull()
  })
  it('valida l’ordine inizio/fine', () => {
    expect(validateTimes(local(2026, 3, 5, 10), local(2026, 3, 5, 11))).toBeNull()
    expect(validateTimes(local(2026, 3, 5, 11), local(2026, 3, 5, 10))).toMatch(/prima/)
    expect(validateTimes(null, 'x')).toMatch(/inizio/)
    expect(validateTimes('x', null)).toMatch(/fine/)
  })
})

describe('migliori valori per esercizio', () => {
  it('carico, massimale stimato e volume; ignora riscaldamento e serie non fatte', () => {
    const a = session('a', local(2026, 1, 1), [entry('x', [set({ weight: 100, reps: 5 }), set({ kind: 'warmup', weight: 200, reps: 1 })])])
    const b = session('b', local(2026, 2, 1), [entry('x', [set({ weight: 80, reps: 10 }), set({ done: false, weight: 300, reps: 1 })])])
    const bests = exerciseBests(exerciseHistory([a, b], 'x'))
    expect(bests.find((x) => x.label === 'Carico massimo')).toMatchObject({ value: '100 kg', startedAt: a.startedAt })
    expect(bests.find((x) => x.label === 'Massimale stimato')?.value).toBe('116,67 kg')
    expect(bests.find((x) => x.label === 'Volume di una serie')?.value).toBe('800 kg')
  })
  it('vuoto senza storico', () => expect(exerciseBests([])).toEqual([]))
})
