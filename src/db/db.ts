import Dexie, { type EntityTable } from 'dexie'
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type Alias,
  type Exercise,
  type ImageChoice,
  type Meta,
  type PersonalPhoto,
  type Plan,
  type Session,
  type Settings,
} from '../domain/types'

export class SpingereDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  plans!: EntityTable<Plan, 'id'>
  sessions!: EntityTable<Session, 'id'>
  photos!: EntityTable<PersonalPhoto, 'id'>
  aliases!: EntityTable<Alias, 'id'>
  imageChoices!: EntityTable<ImageChoice, 'exerciseId'>
  settings!: EntityTable<Settings, 'id'>
  meta!: EntityTable<Meta, 'id'>

  constructor(name = 'spingere') {
    super(name)
    // Versione Dexie = versione dello schema dati. Ogni cambio: nuova version(n) + .upgrade() + migrazione in migrations.ts.
    this.version(1).stores({
      exercises: 'id, source, name, type',
      plans: 'id, name, updatedAt',
      sessions: 'id, status, startedAt',
      photos: 'id, exerciseId',
      settings: 'id',
      meta: 'id',
    })
    // v2: nomi alternativi e immagini scelte dall'utente (separati dagli esercizi, che vengono riscritti a ogni aggiornamento del database).
    this.version(2)
      .stores({ aliases: 'id, exerciseId', imageChoices: 'exerciseId' })
      .upgrade((tx) => tx.table('meta').update('meta', { schemaVersion: 2 }))
    this.on('populate', (tx) => {
      tx.table('settings').add(DEFAULT_SETTINGS)
      tx.table('meta').add({ id: 'meta', schemaVersion: SCHEMA_VERSION } satisfies Meta)
    })
  }
}

export const db = new SpingereDB()
