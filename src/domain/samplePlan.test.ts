import { describe, expect, it } from 'vitest'
import exercises from '../data/exercises.json'
import { SAMPLE_DAYS, buildSamplePlan } from './samplePlan'
import type { Exercise } from './types'

const all = exercises.exercises as Exercise[]

describe('scheda di esempio', () => {
  it('tutti gli esercizi indicati esistono nel database', () => {
    const ids = new Set(all.map((e) => e.id))
    for (const d of SAMPLE_DAYS) for (const id of d.exerciseIds) expect(ids.has(id), id).toBe(true)
  })
  it('costruisce due giorni con tutti gli esercizi e recupero predefinito', () => {
    const p = buildSamplePlan(all, 90)!
    expect(p.days.map((d) => d.exercises.length)).toEqual([5, 5])
    expect(p.days[0].exercises[0]).toMatchObject({ exerciseId: 'b:barbell-squat', targetSets: 3, restSeconds: 90 })
  })
  it('salta gli esercizi mancanti e restituisce null se non ne resta nessuno', () => {
    expect(buildSamplePlan(all.filter((e) => e.id !== 'b:plank'), 90)!.days[0].exercises).toHaveLength(4)
    expect(buildSamplePlan([], 90)).toBeNull()
  })
})
