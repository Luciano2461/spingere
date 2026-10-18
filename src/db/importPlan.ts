import type { SpingereDB } from './db'
import type { BuiltImport } from '../domain/importPlan'

/** Salva schede importate, esercizi personalizzati e nomi personali in un'unica transazione: o tutto o niente. */
export async function applyImport(db: SpingereDB, built: BuiltImport): Promise<void> {
  await db.transaction('rw', db.plans, db.exercises, db.aliases, async () => {
    if (built.customExercises.length) await db.exercises.bulkAdd(built.customExercises)
    await db.plans.bulkAdd(built.plans)
    if (built.aliases.length) await db.aliases.bulkAdd(built.aliases)
  })
}
