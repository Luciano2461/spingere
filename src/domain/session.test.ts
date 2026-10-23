import { describe, expect, it } from 'vitest'
import { fmtDuration, fmtNumber, fmtSet } from './format'
import { newDay, newPlan, newPlanExercise, addExercise, toggleLink } from './plan'
import { recordsFor } from './records'
import {
  addEntry, addSet, completeSet, countUndone, currentSet, updateSetAndFollowers, finishSession, historySets, lastTime, newFreeSession, newSessionFromDay, nextKind,
  prefillSets, removeEntry, removeSet, sessionRecords, sessionVolume, toggleDone, updateSet,
} from './session'
import type { Exercise, Session, SessionEntry, SetLog } from './types'

const set = (p: Partial<SetLog> = {}): SetLog => ({ kind: 'normal', done: true, ...p })
const ex = (id: string, type: Exercise['type'] = 'weight_reps'): Exercise => ({
  id, source: 'builtin', name: id.toUpperCase(), type, equipment: 'barbell', primaryMuscles: [], secondaryMuscles: [], images: [],
})
const entry = (exerciseId: string, sets: SetLog[], type: Exercise['type'] = 'weight_reps'): SessionEntry => ({ exerciseId, nameSnapshot: exerciseId, type, sets })
const done = (startedAt: string, entries: SessionEntry[]): Session => ({ id: startedAt, startedAt, status: 'done', entries, groups: [], notes: '' })

describe('ultima volta', () => {
  const h = [
    done('2026-10-01T10:00:00Z', [entry('a', [set({ weight: 60, reps: 10 })])]),
    done('2026-10-08T10:00:00Z', [entry('a', [set({ weight: 70, reps: 8 }), set({ weight: 70, reps: 7 })])]),
    done('2026-10-09T10:00:00Z', [entry('a', [set({ done: false, weight: 99, reps: 1 })])]),
  ]
  it('prende la sessione più recente con serie completate', () => {
    expect(lastTime(h, 'a')?.startedAt).toBe('2026-10-08T10:00:00Z')
    expect(lastTime(h, 'zzz')).toBeNull()
  })
  it('ignora le sessioni in corso', () => {
    expect(lastTime([{ ...h[1], status: 'active' }], 'a')).toBeNull()
  })
  it('raccoglie le serie dello storico', () => {
    expect(historySets(h, 'a')).toHaveLength(4)
  })
})

describe('precompilazione', () => {
  const last = entry('a', [set({ weight: 80, reps: 8 }), set({ kind: 'warmup', weight: 40, reps: 10 }), set({ weight: 77.5, reps: 8 })])
  it('usa le serie di lavoro dell\'ultima volta, ripetendo l\'ultima se servono più serie', () => {
    const s = prefillSets('weight_reps', { targetSets: 4, targetReps: 10, targetWeight: 50 }, last)
    expect(s.map((x) => [x.weight, x.reps])).toEqual([[80, 8], [77.5, 8], [77.5, 8], [77.5, 8]])
    expect(s.every((x) => !x.done && x.kind === 'normal')).toBe(true)
  })
  it('ignora le serie drop dell\'ultima volta', () => {
    const last: SessionEntry = { exerciseId: 'a', nameSnapshot: 'A', type: 'weight_reps', sets: [set({ weight: 80, reps: 8 }), set({ kind: 'drop', weight: 50, reps: 10 })] }
    expect(prefillSets('weight_reps', { targetSets: 2, targetReps: 10 }, last).map((x) => x.weight)).toEqual([80, 80])
  })
  it('senza storico usa gli obiettivi della scheda', () => {
    expect(prefillSets('weight_reps', { targetSets: 2, targetReps: 10, targetWeight: 50 }, null).map((x) => [x.weight, x.reps])).toEqual([[50, 10], [50, 10]])
  })
  it('tiene solo i campi del tipo', () => {
    expect(prefillSets('bodyweight', { targetSets: 1, targetReps: 12, targetWeight: 9 }, null)[0]).toEqual({ kind: 'normal', done: false, reps: 12 })
    expect(prefillSets('timed', { targetSets: 1, targetSeconds: 30 }, null)[0]).toEqual({ kind: 'normal', done: false, seconds: 30 })
  })
})

describe('sessione da un giorno della scheda', () => {
  it('copia nomi e gruppi senza riferimenti alla scheda', () => {
    let day = newDay('Push')
    day = addExercise(addExercise(day, { ...newPlanExercise(ex('a'), 90), nameSnapshot: 'Il mio A' }), newPlanExercise(ex('b'), 90))
    day = toggleLink(day, 0)
    const plan = { ...newPlan('Scheda'), days: [day] }
    const s = newSessionFromDay(plan, day, [], new Map([['a', 'weight_reps'], ['b', 'weight_reps']]))
    expect(s).toMatchObject({ planName: 'Scheda', dayName: 'Push', status: 'active' })
    expect(s.entries.map((e) => e.nameSnapshot)).toEqual(['Il mio A', 'B'])
    expect(s.entries[0].groupId).toBe(s.groups[0].id)
    // modificare la scheda dopo non cambia la sessione
    day.exercises[0].nameSnapshot = 'Cambiato'
    day.groups[0].restAfterGroup = 5
    expect(s.entries[0].nameSnapshot).toBe('Il mio A')
    expect(s.groups[0].restAfterGroup).toBe(90)
  })
})

describe('modifica della sessione', () => {
  const base = (): Session => ({ ...newFreeSession(), entries: [entry('a', [set({ done: false, weight: 50, reps: 10 })])] })
  it('segna e toglie il completamento', () => {
    let s = toggleDone(base(), 0, 0)
    expect(s.entries[0].sets[0].done).toBe(true)
    expect(s.entries[0].sets[0].doneAt).toBeTruthy()
    s = toggleDone(s, 0, 0)
    expect(s.entries[0].sets[0].done).toBe(false)
  })
  it('aggiunge una serie copiando l\'ultima di lavoro', () => {
    let s = updateSet(base(), 0, 0, { weight: 55, reps: 9 })
    s = addSet(s, 0)
    expect(s.entries[0].sets[1]).toEqual({ kind: 'normal', done: false, weight: 55, reps: 9 })
  })
  it('rimuove serie ed esercizi', () => {
    expect(removeSet(base(), 0, 0).entries[0].sets).toHaveLength(0)
    expect(removeEntry(base(), 0).entries).toHaveLength(0)
  })
  it('aggiunge un esercizio fuori scheda con i valori dell\'ultima volta', () => {
    const hist = [done('2026-10-01T10:00:00Z', [entry('b', [set({ weight: 30, reps: 12 })])])]
    const s = addEntry(newFreeSession(), ex('b'), hist)
    expect(s.entries[0].sets[0]).toMatchObject({ weight: 30, reps: 12, done: false })
  })
  it('cicla il tipo di serie', () => {
    expect(nextKind('normal')).toBe('warmup')
    expect(nextKind('failure')).toBe('normal')
  })
  it('conclude tenendo solo il fatto', () => {
    const s: Session = {
      ...newFreeSession(),
      entries: [entry('a', [set({ weight: 50, reps: 10 }), set({ done: false })]), entry('b', [set({ done: false })])],
    }
    expect(countUndone(s)).toBe(2)
    const f = finishSession(s, '2026-10-14T11:00:00Z')
    expect(f.status).toBe('done')
    expect(f.endedAt).toBe('2026-10-14T11:00:00Z')
    expect(f.updatedAt).toBe('2026-10-14T11:00:00Z')
    expect(f.entries).toHaveLength(1)
    expect(f.entries[0].sets).toHaveLength(1)
  })
  it('volume della sessione esclude riscaldamento e serie non fatte', () => {
    const s: Session = { ...newFreeSession(), entries: [entry('a', [set({ weight: 100, reps: 5 }), set({ kind: 'warmup', weight: 50, reps: 10 }), set({ done: false, weight: 100, reps: 5 })])] }
    expect(sessionVolume(s)).toBe(500)
  })
})

describe('record personali', () => {
  const prev = [set({ weight: 80, reps: 8 }), set({ weight: 80, reps: 6 }), set({ kind: 'warmup', weight: 100, reps: 1 })]
  it('nessun record senza serie precedenti', () => {
    expect(recordsFor('weight_reps', [], set({ weight: 200, reps: 5 }))).toEqual([])
  })
  it('carico massimo (il riscaldamento non conta)', () => {
    expect(recordsFor('weight_reps', prev, set({ weight: 82.5, reps: 5 }))).toContain('weight')
    expect(recordsFor('weight_reps', prev, set({ weight: 90, reps: 1 }))).toContain('weight')
    expect(recordsFor('weight_reps', prev, set({ weight: 80, reps: 5 }))).not.toContain('weight')
  })
  it('ripetizioni massime a parità di carico', () => {
    expect(recordsFor('weight_reps', prev, set({ weight: 80, reps: 9 }))).toContain('reps_at_weight')
    expect(recordsFor('weight_reps', prev, set({ weight: 80, reps: 7 }))).not.toContain('reps_at_weight')
    expect(recordsFor('weight_reps', prev, set({ weight: 75, reps: 20 }))).not.toContain('reps_at_weight') // carico mai usato
  })
  it('massimale stimato e volume', () => {
    const r = recordsFor('weight_reps', prev, set({ weight: 80, reps: 10 }))
    expect(r).toContain('e1rm')
    expect(r).toContain('volume')
  })
  it('serie non completate e riscaldamento non sono record', () => {
    expect(recordsFor('weight_reps', prev, set({ done: false, weight: 200, reps: 5 }))).toEqual([])
    expect(recordsFor('weight_reps', prev, set({ kind: 'warmup', weight: 200, reps: 5 }))).toEqual([])
  })
  it('corpo libero e a tempo', () => {
    expect(recordsFor('bodyweight', [set({ reps: 10 })], set({ reps: 11 }))).toEqual(['reps'])
    expect(recordsFor('timed', [set({ seconds: 30 })], set({ seconds: 45 }))).toEqual(['seconds'])
    expect(recordsFor('cardio', [set({ seconds: 600 })], set({ seconds: 900 }))).toEqual([])
  })
  it('zavorra con peso negativo (assistenza): meno assistenza = carico maggiore', () => {
    expect(recordsFor('weighted_bodyweight', [set({ weight: -20, reps: 8 })], set({ weight: -15, reps: 8 }))).toContain('weight')
  })
  it('record di sessione: valuta in ordine, un solo record per progresso', () => {
    const hist = [done('2026-10-01T10:00:00Z', [entry('a', [set({ weight: 80, reps: 8 })])])]
    const s: Session = { ...newFreeSession(), entries: [entry('a', [set({ weight: 85, reps: 5 }), set({ weight: 85, reps: 5 })])] }
    const recs = sessionRecords(s, hist)
    expect(recs.map((r) => r.setIndex)).toEqual([0]) // la seconda serie uguale non batte il record appena fatto
    expect(recs[0].kinds).toContain('weight')
  })
})

describe('formattazione', () => {
  it('numeri e durate', () => {
    expect(fmtNumber(77.5)).toBe('77,5')
    expect(fmtNumber(80)).toBe('80')
    expect(fmtNumber(999)).toBe('999')
    expect(fmtNumber(1264)).toBe('1.264')
    expect(fmtNumber(49916)).toBe('49.916')
    expect(fmtNumber(101264)).toBe('101.264')
    expect(fmtNumber(1234567.891)).toBe('1.234.567,89')
    expect(fmtNumber(-2500.5)).toBe('-2.500,5')
    expect(fmtNumber(-7.5)).toBe('-7,5')
    expect(fmtNumber(-0.001)).toBe('0')
    expect(fmtNumber(0)).toBe('0')
    expect(fmtDuration(125)).toBe('2:05')
    expect(fmtDuration(3725)).toBe('1:02:05')
  })
  it('serie per tipo', () => {
    expect(fmtSet('weight_reps', set({ weight: 77.5, reps: 8 }))).toBe('77,5×8')
    expect(fmtSet('timed', set({ seconds: 45 }))).toBe('45 s')
    expect(fmtSet('cardio', set({ seconds: 900, distance: 2.5 }))).toBe('15 min · 2,5 km')
  })
})

describe('completare una serie e recupero', () => {
  const base = (): Session => ({
    ...newFreeSession(),
    entries: [{ ...entry('a', [set({ done: false, weight: 50, reps: 10 }), set({ done: false, weight: 50, reps: 10 })]), restSeconds: 120 }],
  })
  it('completando una serie parte il recupero dell\'esercizio', () => {
    const s = completeSet(base(), 0, 0, 90, 1_000_000)
    expect(s.entries[0].sets[0].done).toBe(true)
    expect(s.rest?.durationSeconds).toBe(120)
    expect(new Date(s.rest!.endsAt).getTime()).toBe(1_000_000 + 120_000)
  })
  it('annullando una serie il recupero non riparte', () => {
    const done = completeSet(base(), 0, 0, 90, 1_000_000)
    const undone = completeSet({ ...done, rest: undefined }, 0, 0, 90, 2_000_000)
    expect(undone.entries[0].sets[0].done).toBe(false)
    expect(undone.rest).toBeUndefined()
  })
  it('riscaldamento: nessun recupero', () => {
    const s = base()
    s.entries[0].sets[0].kind = 'warmup'
    expect(completeSet(s, 0, 0, 90).rest).toBeUndefined()
  })
  it('la scheda passa il recupero alla sessione e la conclusione toglie il timer', () => {
    const day = addExercise(newDay('G'), { ...newPlanExercise(ex('a'), 150) })
    const s = newSessionFromDay(newPlan('P'), day, [], new Map([['a', 'weight_reps']]))
    expect(s.entries[0].restSeconds).toBe(150)
    const withRest = completeSet(s, 0, 0, 90)
    expect(withRest.rest).toBeDefined()
    expect(finishSession(withRest).rest).toBeUndefined()
  })
})

describe('modifiche che seguono le serie successive', () => {
  const base = (): Session => ({
    ...newFreeSession(),
    entries: [entry('a', [set({ done: false, weight: 60, reps: 10 }), set({ done: false, weight: 60, reps: 10 }), set({ done: false, weight: 65, reps: 10 })])],
  })
  it('passa il nuovo carico alle serie successive che avevano lo stesso valore', () => {
    const r = updateSetAndFollowers(base(), 0, 0, { weight: 70 })
    expect(r.entries[0].sets.map((x) => x.weight)).toEqual([70, 70, 65])
  })
  it('non tocca serie già completate, di riscaldamento o precedenti', () => {
    const s = base()
    s.entries[0].sets[1] = set({ weight: 60, reps: 10 }) // fatta
    s.entries[0].sets.push(set({ done: false, kind: 'warmup', weight: 60, reps: 10 }))
    const r = updateSetAndFollowers(s, 0, 0, { weight: 70 })
    expect(r.entries[0].sets.map((x) => x.weight)).toEqual([70, 60, 65, 60])
    const back = updateSetAndFollowers(base(), 0, 1, { weight: 80 })
    expect(back.entries[0].sets[0].weight).toBe(60)
  })
  it('propaga anche le ripetizioni, indipendentemente dal carico', () => {
    const r = updateSetAndFollowers(base(), 0, 0, { reps: 8 })
    expect(r.entries[0].sets.map((x) => x.reps)).toEqual([8, 8, 8])
    expect(r.entries[0].sets.map((x) => x.weight)).toEqual([60, 60, 65])
  })
  it('modificare una serie di riscaldamento o già completata non propaga', () => {
    const s = base()
    s.entries[0].sets[0] = { ...s.entries[0].sets[0], kind: 'warmup' }
    expect(updateSetAndFollowers(s, 0, 0, { weight: 30 }).entries[0].sets.map((x) => x.weight)).toEqual([30, 60, 65])
  })
  it('cambiare il tipo non propaga', () => {
    expect(updateSetAndFollowers(base(), 0, 0, { kind: 'drop' }).entries[0].sets.map((x) => x.kind)).toEqual(['drop', 'normal', 'normal'])
  })
})

describe('serie corrente', () => {
  it('è la prima non completata, in ordine', () => {
    const s: Session = { ...newFreeSession(), entries: [entry('a', [set(), set({ done: false })]), entry('b', [set({ done: false })])] }
    expect(currentSet(s)).toEqual({ entryIndex: 0, setIndex: 1 })
  })
  it('nelle superserie segue l\'alternanza A1 B1 A2 B2', () => {
    const s: Session = {
      ...newFreeSession(),
      entries: [{ ...entry('a', [set(), set({ done: false })]), groupId: 'g' }, { ...entry('b', [set({ done: false }), set({ done: false })]), groupId: 'g' }],
    }
    expect(currentSet(s)).toEqual({ entryIndex: 1, setIndex: 0 })
  })
  it('null se tutte completate o sessione vuota', () => {
    expect(currentSet({ ...newFreeSession(), entries: [entry('a', [set()])] })).toBeNull()
    expect(currentSet(newFreeSession())).toBeNull()
  })
})
