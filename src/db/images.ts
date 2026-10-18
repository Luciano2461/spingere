import type { SpingereDB } from './db'

/** Usa per l'esercizio un'immagine inclusa nell'app (anche di un altro esercizio). */
export async function setBuiltinImage(db: SpingereDB, exerciseId: string, path: string): Promise<void> {
  await db.transaction('rw', db.imageChoices, db.photos, async () => {
    await db.photos.where('exerciseId').equals(exerciseId).delete()
    await db.imageChoices.put({ exerciseId, kind: 'builtin', path })
  })
}

/** Usa per l'esercizio una foto personale (sostituisce l'eventuale foto precedente). */
export async function setPhoto(db: SpingereDB, exerciseId: string, blob: Blob): Promise<void> {
  const photoId = crypto.randomUUID()
  await db.transaction('rw', db.imageChoices, db.photos, async () => {
    await db.photos.where('exerciseId').equals(exerciseId).delete()
    await db.photos.add({ id: photoId, exerciseId, blob })
    await db.imageChoices.put({ exerciseId, kind: 'photo', photoId })
  })
}

/** Torna alle immagini originali dell'esercizio. */
export async function resetImage(db: SpingereDB, exerciseId: string): Promise<void> {
  await db.transaction('rw', db.imageChoices, db.photos, async () => {
    await db.photos.where('exerciseId').equals(exerciseId).delete()
    await db.imageChoices.delete(exerciseId)
  })
}
