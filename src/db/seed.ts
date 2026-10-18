import type { SpingereDB } from './db'
import type { Exercise } from '../domain/types'

export interface ExerciseDataset {
  datasetVersion: number
  exercises: Exercise[]
}

/** Carica nel DB gli esercizi inclusi nell'app. Aggiorna solo gli esercizi "builtin": quelli personalizzati non si toccano. */
export async function seedExercises(db: SpingereDB, data: ExerciseDataset): Promise<boolean> {
  const meta = await db.meta.get('meta')
  if (meta?.exercisesDatasetVersion === data.datasetVersion) return false
  await db.transaction('rw', db.exercises, db.meta, async () => {
    await db.exercises.bulkPut(data.exercises)
    await db.meta.update('meta', { exercisesDatasetVersion: data.datasetVersion })
  })
  return true
}

export async function ensureExercisesSeeded(db: SpingereDB): Promise<boolean> {
  const data = (await import('../data/exercises.json')).default as unknown as ExerciseDataset
  return seedExercises(db, data)
}
