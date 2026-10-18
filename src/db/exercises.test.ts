import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deleteCustomExercise, saveCustomExercise } from './exercises'
import { SpingereDB } from './db'
import { EMPTY_FORM, newCustomExercise } from '../domain/customExercise'

describe('esercizi personalizzati nel database', () => {
  it('salva, modifica con foto e poi elimina (nascondendo)', async () => {
    const db = new SpingereDB('cex-1')
    await db.open()
    const e = newCustomExercise({ ...EMPTY_FORM, name: 'Mio' })
    await saveCustomExercise(db, e)
    expect((await db.exercises.get(e.id))?.name).toBe('Mio')

    await saveCustomExercise(db, { ...e, name: 'Mio 2' }, { kind: 'set', blob: new Blob(['x'], { type: 'image/jpeg' }) })
    expect((await db.exercises.get(e.id))?.name).toBe('Mio 2')
    expect(await db.photos.where('exerciseId').equals(e.id).count()).toBe(1)
    expect((await db.imageChoices.get(e.id))?.kind).toBe('photo')

    await saveCustomExercise(db, e, { kind: 'remove' })
    expect(await db.photos.where('exerciseId').equals(e.id).count()).toBe(0)

    await deleteCustomExercise(db, e.id)
    expect((await db.exercises.get(e.id))?.deleted).toBe(true)
    db.close()
  })
  it('non tocca gli esercizi del database', async () => {
    const db = new SpingereDB('cex-2')
    await db.open()
    await db.exercises.add({ id: 'b:x', source: 'builtin', name: 'X', type: 'weight_reps', equipment: 'none', primaryMuscles: [], secondaryMuscles: [], images: [] })
    await expect(deleteCustomExercise(db, 'b:x')).rejects.toThrow()
    await expect(saveCustomExercise(db, (await db.exercises.get('b:x'))!)).rejects.toThrow()
    expect((await db.exercises.get('b:x'))?.deleted).toBeUndefined()
    db.close()
  })
})
