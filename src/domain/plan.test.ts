import { describe, expect, it } from 'vitest'
import {
  addExercise, arrayMove, blocks, duplicatePlan, isLinkedWithNext, moveBlock, moveInGroup, newDay, newPlan,
  isForgotten, newPlanExercise, normalize, removeExercise, suggestNextDay, toggleLink, updateExercise, updateGroup,
} from './plan'
import type { Exercise, Plan, PlanDay, Session } from './types'

const ex = (id: string, type: Exercise['type'] = 'weight_reps'): Exercise => ({
  id, source: 'builtin', name: id.toUpperCase(), type, equipment: 'barbell', primaryMuscles: [], secondaryMuscles: [], images: [],
})
const dayWith = (...ids: string[]): PlanDay => ids.reduce((d, id) => addExercise(d, newPlanExercise(ex(id), 90)), newDay('G'))
const order = (d: PlanDay) => d.exercises.map((e) => e.exerciseId)

describe('creazione', () => {
  it('nomi vuoti hanno un valore di default', () => {
    expect(newPlan('  ').name).toBe('Nuova scheda')
    expect(newDay('').name).toBe('Allenamento')
  })
  it('valori iniziali in base al tipo', () => {
    expect(newPlanExercise(ex('a', 'timed'), 60)).toMatchObject({ targetSeconds: 30, restSeconds: 60 })
    expect(newPlanExercise(ex('a', 'cardio'), 60)).toMatchObject({ targetSeconds: 600, restSeconds: 0 })
    expect(newPlanExercise(ex('a'), 90)).toMatchObject({ targetSets: 3, targetReps: 10 })
    expect(newPlanExercise(ex('a'), 90).nameSnapshot).toBe('A')
  })
})

describe('esercizi', () => {
  it('aggiorna e rimuove', () => {
    let d = dayWith('a', 'b', 'c')
    d = updateExercise(d, 1, { targetSets: 5, nameSnapshot: 'Il mio B' })
    expect(d.exercises[1]).toMatchObject({ targetSets: 5, nameSnapshot: 'Il mio B' })
    expect(order(removeExercise(d, 0))).toEqual(['b', 'c'])
  })
  it('arrayMove ignora indici non validi', () => {
    expect(arrayMove([1, 2, 3], 0, 2)).toEqual([2, 3, 1])
    expect(arrayMove([1, 2, 3], 0, 9)).toEqual([1, 2, 3])
  })
})

describe('superserie', () => {
  it('collega due esercizi adiacenti', () => {
    const d = toggleLink(dayWith('a', 'b', 'c'), 0)
    expect(isLinkedWithNext(d, 0)).toBe(true)
    expect(isLinkedWithNext(d, 1)).toBe(false)
    expect(d.groups).toHaveLength(1)
    expect(blocks(d).map((b) => b.length)).toEqual([2, 1])
  })
  it('estende un gruppo esistente', () => {
    let d = toggleLink(dayWith('a', 'b', 'c'), 0)
    d = toggleLink(d, 1)
    expect(blocks(d)).toHaveLength(1)
    expect(d.groups).toHaveLength(1)
  })
  it('unisce due gruppi vicini', () => {
    let d = dayWith('a', 'b', 'c', 'd')
    d = toggleLink(toggleLink(d, 0), 2)
    expect(d.groups).toHaveLength(2)
    d = toggleLink(d, 1)
    expect(d.groups).toHaveLength(1)
    expect(blocks(d)).toHaveLength(1)
  })
  it('scollegare dal successivo spezza il gruppo e dissolve i singoli', () => {
    let d = toggleLink(toggleLink(dayWith('a', 'b', 'c'), 0), 1) // a-b-c
    d = toggleLink(d, 0) // a | b-c
    expect(blocks(d).map((b) => b.length)).toEqual([1, 2])
    expect(d.groups).toHaveLength(1)
    d = toggleLink(d, 1) // a | b | c
    expect(d.groups).toHaveLength(0)
    expect(d.exercises.every((e) => !e.groupId)).toBe(true)
  })
  it('rimuovere un esercizio da una coppia dissolve il gruppo', () => {
    const d = removeExercise(toggleLink(dayWith('a', 'b', 'c'), 0), 0)
    expect(d.groups).toHaveLength(0)
    expect(order(d)).toEqual(['b', 'c'])
  })
  it('modifica tipo e recupero del gruppo', () => {
    let d = toggleLink(dayWith('a', 'b'), 0)
    d = updateGroup(d, d.groups[0].id, { kind: 'circuit', restAfterGroup: 120 })
    expect(d.groups[0]).toMatchObject({ kind: 'circuit', restAfterGroup: 120 })
  })
  it('normalize spezza i gruppi non contigui', () => {
    let d = toggleLink(dayWith('a', 'b', 'c'), 0)
    d = { ...d, exercises: [d.exercises[0], d.exercises[2], d.exercises[1]] } // a, c, b: il gruppo a-b non è più contiguo
    const n = normalize(d)
    expect(n.groups).toHaveLength(0)
  })
})

describe('ordine', () => {
  it('sposta un esercizio singolo', () => {
    expect(order(moveBlock(dayWith('a', 'b', 'c'), 0, 2))).toEqual(['b', 'c', 'a'])
  })
  it('sposta un gruppo intero senza romperlo', () => {
    const d = toggleLink(dayWith('a', 'b', 'c'), 0) // [a-b] [c]
    const moved = moveBlock(d, 0, 1)
    expect(order(moved)).toEqual(['c', 'a', 'b'])
    expect(isLinkedWithNext(moved, 1)).toBe(true)
  })
  it('scambia dentro un gruppo ma non fuori', () => {
    const d = toggleLink(dayWith('a', 'b', 'c'), 0)
    expect(order(moveInGroup(d, 0, 1))).toEqual(['b', 'a', 'c'])
    expect(order(moveInGroup(d, 1, 1))).toEqual(['a', 'b', 'c'])
  })
})

describe('duplicazione', () => {
  it('crea una copia indipendente con nuovi ID e gruppi coerenti', () => {
    let p = newPlan('Scheda A')
    p = { ...p, days: [toggleLink(dayWith('a', 'b'), 0)] }
    const copy = duplicatePlan(p)
    expect(copy.id).not.toBe(p.id)
    expect(copy.name).toBe('Scheda A (copia)')
    expect(copy.days[0].id).not.toBe(p.days[0].id)
    expect(copy.days[0].groups[0].id).not.toBe(p.days[0].groups[0].id)
    expect(copy.days[0].exercises[0].groupId).toBe(copy.days[0].groups[0].id)
    expect(p.days[0].exercises[0].groupId).toBe(p.days[0].groups[0].id)
  })
})

describe('giorno suggerito e allenamento dimenticato', () => {
  const ex = [{ exerciseId: 'x', nameSnapshot: 'x', restSeconds: 60, sets: 3 }] as unknown as PlanDay['exercises']
  const plan = { id: 'p', name: 'P', notes: '', createdAt: '', updatedAt: '', days: [{ id: 'a', name: 'A', exercises: ex }, { id: 'b', name: 'B', exercises: ex }, { id: 'c', name: 'C', exercises: [] }] } as unknown as Plan
  const done = (dayName: string, startedAt: string) => ({ id: dayName + startedAt, status: 'done', planName: 'P', dayName, startedAt, entries: [], groups: [], notes: '' }) as unknown as Session
  it('primo giorno mai fatto, altrimenti il meno recente', () => {
    expect(suggestNextDay(plan, [])).toBe('a')
    expect(suggestNextDay(plan, [done('A', '2026-03-01T10:00:00Z')])).toBe('b')
    expect(suggestNextDay(plan, [done('A', '2026-03-01T10:00:00Z'), done('B', '2026-03-03T10:00:00Z')])).toBe('a')
  })
  it('nessun suggerimento con un solo giorno allenabile', () => {
    expect(suggestNextDay({ ...plan, days: [plan.days[0], plan.days[2]] }, [])).toBeNull()
  })
  it('dimenticato solo oltre 6 ore, anche a cavallo della mezzanotte', () => {
    const now = new Date(2026, 2, 5, 20, 0)
    expect(isForgotten(new Date(2026, 2, 5, 15, 0).toISOString(), now)).toBe(false)
    expect(isForgotten(new Date(2026, 2, 5, 13, 0).toISOString(), now)).toBe(true)
    expect(isForgotten(new Date(2026, 2, 4, 23, 30).toISOString(), new Date(2026, 2, 5, 0, 20))).toBe(false)
    expect(isForgotten(new Date(2026, 2, 4, 23, 0).toISOString(), now)).toBe(true)
  })
})
