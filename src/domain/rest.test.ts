import { describe, expect, it } from 'vitest'
import { adjustRest, executionOrder, isPassed, isRestOver, isStaleRest, lastDone, nextUndone, remainingSeconds, restSecondsFor, startRest, upNext } from './rest'
import type { Session, SessionEntry, SetLog } from './types'

const set = (p: Partial<SetLog> = {}): SetLog => ({ kind: 'normal', done: false, ...p })
const entry = (id: string, nSets: number, p: Partial<SessionEntry> = {}): SessionEntry => ({
  exerciseId: id, nameSnapshot: id, type: 'weight_reps', sets: Array.from({ length: nSets }, () => set()), ...p,
})
const session = (entries: SessionEntry[], groups: Session['groups'] = []): Session => ({
  id: 's', startedAt: '2026-10-14T10:00:00Z', status: 'active', entries, groups, notes: '',
})

describe('durata del recupero', () => {
  it('usa il recupero dell\'esercizio o quello predefinito', () => {
    const s = session([entry('a', 3, { restSeconds: 120 }), entry('b', 3)])
    expect(restSecondsFor(s, 0, 0, 90)).toBe(120)
    expect(restSecondsFor(s, 1, 0, 90)).toBe(90)
  })
  it('nessun timer dopo il riscaldamento né per il cardio', () => {
    const s = session([entry('a', 1, { restSeconds: 120 }), entry('c', 1, { type: 'cardio', restSeconds: 60 })])
    s.entries[0].sets[0].kind = 'warmup'
    expect(restSecondsFor(s, 0, 0, 90)).toBe(0)
    expect(restSecondsFor(s, 1, 0, 90)).toBe(0)
  })
  it('nei gruppi il recupero scatta solo dopo l\'ultimo esercizio, con il tempo del gruppo', () => {
    const s = session([entry('a', 2, { groupId: 'g' }), entry('b', 2, { groupId: 'g' }), entry('c', 2)], [{ id: 'g', kind: 'superset', restAfterGroup: 75 }])
    expect(restSecondsFor(s, 0, 0, 90)).toBe(0)
    expect(restSecondsFor(s, 1, 0, 90)).toBe(75)
    expect(restSecondsFor(s, 2, 0, 90)).toBe(90)
  })
  it('nessun timer se la serie successiva è un drop', () => {
    const s = session([entry('a', 3, { restSeconds: 120 })])
    s.entries[0].sets[1].kind = 'drop'
    expect(restSecondsFor(s, 0, 0, 90)).toBe(0)
    expect(restSecondsFor(s, 0, 1, 90)).toBe(120)
  })
  it('indici non validi', () => {
    expect(restSecondsFor(session([entry('a', 1)]), 3, 0, 90)).toBe(0)
  })
})

describe('timer basato sull\'orario di fine', () => {
  const t0 = 1_000_000
  it('calcola il tempo rimanente dal timestamp', () => {
    const r = startRest(90, t0)
    expect(remainingSeconds(r, t0)).toBe(90)
    expect(remainingSeconds(r, t0 + 30_000)).toBe(60)
    expect(remainingSeconds(r, t0 + 89_100)).toBe(1) // arrotonda per eccesso
  })
  it('resta corretto dopo un salto di tempo (app in background)', () => {
    const r = startRest(90, t0)
    expect(remainingSeconds(r, t0 + 10 * 60_000)).toBe(0)
    expect(isRestOver(r, t0 + 10 * 60_000)).toBe(true)
    expect(isRestOver(r, t0 + 1000)).toBe(false)
  })
  it('±15 secondi', () => {
    const r = startRest(90, t0)
    expect(remainingSeconds(adjustRest(r, 15, t0 + 10_000), t0 + 10_000)).toBe(95)
    expect(remainingSeconds(adjustRest(r, -15, t0 + 10_000), t0 + 10_000)).toBe(65)
  })
  it('togliere più del rimanente lo conclude subito', () => {
    const r = adjustRest(startRest(90, t0), -15, t0 + 85_000)
    expect(remainingSeconds(r, t0 + 85_000)).toBe(0)
    expect(r.durationSeconds).toBe(75)
  })
  it('un recupero finito da molto è "vecchio"', () => {
    const r = startRest(90, t0)
    expect(isStaleRest(r, t0 + 90_000 + 60_000)).toBe(false)
    expect(isStaleRest(r, t0 + 90_000 + 10 * 60_000)).toBe(true)
  })
})

describe('ordine di esecuzione', () => {
  const s = session([entry('a', 2), entry('b', 2, { groupId: 'g' }), entry('c', 2, { groupId: 'g' }), entry('d', 1)], [{ id: 'g', kind: 'superset', restAfterGroup: 60 }])
  it('alterna i membri del gruppo giro per giro', () => {
    expect(executionOrder(s).map((r) => `${s.entries[r.entryIndex].exerciseId}${r.setIndex + 1}`)).toEqual(['a1', 'a2', 'b1', 'c1', 'b2', 'c2', 'd1'])
  })
  it('trova la prossima serie da fare', () => {
    s.entries[0].sets[0].done = true
    expect(nextUndone(s)).toEqual({ entryIndex: 0, setIndex: 1 })
    expect(nextUndone(s, { entryIndex: 0, setIndex: 1 })).toEqual({ entryIndex: 1, setIndex: 0 })
    expect(nextUndone(s, { entryIndex: 1, setIndex: 0 })).toEqual({ entryIndex: 2, setIndex: 0 })
  })
  it('dopo l\'ultima riparte da quelle rimaste indietro, oppure null se è tutto fatto', () => {
    const t = session([entry('a', 2), entry('b', 1)])
    t.entries[0].sets[1].done = true
    t.entries[1].sets[0].done = true
    expect(nextUndone(t, { entryIndex: 1, setIndex: 0 })).toEqual({ entryIndex: 0, setIndex: 0 })
    t.entries[0].sets[0].done = true
    expect(nextUndone(t)).toBeNull()
  })
})

describe('serie da fare adesso', () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 10, min)).toISOString()
  it('saltare una serie non riporta indietro: si prosegue dopo l\'ultima completata', () => {
    const t = session([entry('a', 3), entry('b', 2)])
    t.entries[0].sets[0] = { ...t.entries[0].sets[0], done: true, doneAt: at(1) }
    t.entries[0].sets[1] = { ...t.entries[0].sets[1], done: true, doneAt: at(3) }
    t.entries[1].sets[0] = { ...t.entries[1].sets[0], done: true, doneAt: at(6) }
    expect(lastDone(t)).toEqual({ entryIndex: 1, setIndex: 0 })
    expect(upNext(t)).toEqual({ entryIndex: 1, setIndex: 1 })
    expect(isPassed(t, 0, upNext(t))).toBe(true)
    expect(isPassed(t, 1, upNext(t))).toBe(false)
  })
  it('finito il giro torna alle serie rimaste indietro', () => {
    const t = session([entry('a', 2), entry('b', 1)])
    t.entries[0].sets[0] = { ...t.entries[0].sets[0], done: true, doneAt: at(1) }
    t.entries[1].sets[0] = { ...t.entries[1].sets[0], done: true, doneAt: at(4) }
    expect(upNext(t)).toEqual({ entryIndex: 0, setIndex: 1 })
    expect(isPassed(t, 0, upNext(t))).toBe(false)
  })
  it('senza serie completate parte dalla prima', () => {
    expect(upNext(session([entry('a', 2)]))).toEqual({ entryIndex: 0, setIndex: 0 })
  })
})
