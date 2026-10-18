import 'fake-indexeddb/auto'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SpingereDB } from './db'
import { seedExercises, type ExerciseDataset } from './seed'
import type { Exercise } from '../domain/types'
import dataset from '../data/exercises.json'

const base: Omit<Exercise, 'id' | 'name'> = { source: 'builtin', type: 'weight_reps', equipment: 'barbell', primaryMuscles: [], secondaryMuscles: [], images: [] }

describe('seedExercises', () => {
  it('carica gli esercizi una sola volta per versione', async () => {
    const db = new SpingereDB('seed-1')
    await db.open()
    const data: ExerciseDataset = { datasetVersion: 1, exercises: [{ ...base, id: 'b:a', name: 'A' }] }
    expect(await seedExercises(db, data)).toBe(true)
    expect(await seedExercises(db, data)).toBe(false)
    expect(await db.exercises.count()).toBe(1)
    db.close()
  })

  it('aggiornando la versione non tocca gli esercizi personalizzati', async () => {
    const db = new SpingereDB('seed-2')
    await db.open()
    await seedExercises(db, { datasetVersion: 1, exercises: [{ ...base, id: 'b:a', name: 'Vecchio' }] })
    await db.exercises.add({ ...base, source: 'custom', id: 'c:1', name: 'Mio' })
    await seedExercises(db, { datasetVersion: 2, exercises: [{ ...base, id: 'b:a', name: 'Nuovo' }] })
    expect((await db.exercises.get('b:a'))?.name).toBe('Nuovo')
    expect((await db.exercises.get('c:1'))?.name).toBe('Mio')
    db.close()
  })

  it('il database incluso è coerente', () => {
    const list = (dataset as unknown as ExerciseDataset).exercises
    expect(list.length).toBeGreaterThan(800)
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length)
    expect(list.every((e) => e.id.startsWith('b:') && e.name && e.source === 'builtin')).toBe(true)
    // alcuni esercizi della fonte non hanno immagini; quelle indicate devono esistere su disco
    const missing = list.flatMap((e) => e.images).filter((img) => !existsSync(`public/exercises/${img}`))
    expect(missing).toEqual([])
    expect(list.some((e) => e.needsTranslation)).toBe(false)
  })
})
