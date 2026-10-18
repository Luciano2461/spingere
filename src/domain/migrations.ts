import { SCHEMA_VERSION } from './types'

/** Dati di un backup/DB come oggetto generico, prima di essere validati per la versione corrente. */
export type RawData = Record<string, unknown>

/** migrations[n] porta i dati dalla versione n alla n+1. */
export type Migration = (data: RawData) => RawData
export const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: aggiunta di nomi alternativi (aliases) e immagini scelte (imageChoices)
  1: (data) => ({
    ...data,
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    imageChoices: Array.isArray(data.imageChoices) ? data.imageChoices : [],
  }),
}

export function migrateData(
  data: RawData,
  fromVersion: number,
  toVersion: number = SCHEMA_VERSION,
  migrations: Record<number, Migration> = MIGRATIONS,
): RawData {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) throw new Error(`Versione dati non valida: ${fromVersion}`)
  if (fromVersion > toVersion) throw new Error(`I dati sono della versione ${fromVersion}, più recente dell'app (${toVersion}). Aggiorna l'app.`)
  let current = data
  for (let v = fromVersion; v < toVersion; v++) {
    const step = migrations[v]
    if (!step) throw new Error(`Manca la migrazione dalla versione ${v} alla ${v + 1}`)
    current = step(current)
  }
  return current
}
