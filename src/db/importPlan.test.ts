import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { applyImport } from './importPlan'
import { SpingereDB } from './db'
import { newPlan } from '../domain/plan'
import type { Exercise } from '../domain/types'

const custom: Exercise = { id: 'c:1', source: 'custom', name: 'Mio', type: 'weight_reps', equipment: 'other', primaryMuscles: [], secondaryMuscles: [], images: [] }

describe('applicazione dell\'import', () => {
  it('salva schede, esercizi personalizzati e nomi personali', async () => {
    const db = new SpingereDB('imp-1')
    await db.open()
    const plan = newPlan('Importata')
    await applyImport(db, { plans: [plan], customExercises: [custom], aliases: [{ id: 'a1', exerciseId: 'c:1', text: 'Il mio' }] })
    expect((await db.plans.toArray()).map((p) => p.name)).toEqual(['Importata'])
    expect((await db.exercises.get('c:1'))?.name).toBe('Mio')
    expect(await db.aliases.count()).toBe(1)
    db.close()
  })
  it('se qualcosa fallisce non salva nulla', async () => {
    const db = new SpingereDB('imp-2')
    await db.open()
    await db.exercises.add(custom)
    const plan = newPlan('Non deve restare')
    await expect(applyImport(db, { plans: [plan], customExercises: [custom], aliases: [] })).rejects.toThrow()
    expect(await db.plans.count()).toBe(0)
    db.close()
  })
})
