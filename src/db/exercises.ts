import type { SpingereDB } from './db'
import { resetImage, setPhoto } from './images'
import type { Exercise } from '../domain/types'

export type PhotoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'set'; blob: Blob }

/** Salva un esercizio personalizzato (nuovo o modificato) e, se richiesto, la sua foto. */
export async function saveCustomExercise(db: SpingereDB, exercise: Exercise, photo: PhotoChange = { kind: 'keep' }): Promise<void> {
  if (exercise.source !== 'custom') throw new Error('Si possono modificare solo gli esercizi personalizzati')
  await db.exercises.put(exercise)
  if (photo.kind === 'set') await setPhoto(db, exercise.id, photo.blob)
  else if (photo.kind === 'remove') await resetImage(db, exercise.id)
}

/**
 * «Elimina» un esercizio personalizzato: viene nascosto (flag `deleted`), non cancellato.
 * Storico, record e schede conservano il nome salvato; anche foto e tipo restano disponibili.
 */
export async function deleteCustomExercise(db: SpingereDB, id: string): Promise<void> {
  const e = await db.exercises.get(id)
  if (!e || e.source !== 'custom') throw new Error('Esercizio non trovato')
  await db.exercises.update(id, { deleted: true })
}
