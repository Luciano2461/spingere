import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { SpingereDB } from './db'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../domain/types'

describe('SpingereDB', () => {
  it('crea le tabelle e i valori iniziali', async () => {
    const db = new SpingereDB('test-init')
    await db.open()
    expect(await db.settings.get('settings')).toEqual(DEFAULT_SETTINGS)
    expect((await db.meta.get('meta'))?.schemaVersion).toBe(SCHEMA_VERSION)
    db.close()
  })

  it('salva una sessione come copia autonoma dalla scheda', async () => {
    const db = new SpingereDB('test-session')
    await db.open()
    await db.sessions.add({
      id: 's1', startedAt: '2026-10-14T10:00:00+02:00', status: 'active', notes: '', groups: [],
      entries: [{ exerciseId: 'b:bench-press', nameSnapshot: 'Panca piana', type: 'weight_reps', sets: [{ kind: 'normal', done: true, weight: 80, reps: 8 }] }],
    })
    const s = await db.sessions.get('s1')
    expect(s?.entries[0].nameSnapshot).toBe('Panca piana')
    db.close()
  })
})

describe('migrazione schema v1 → v2', () => {
  it('conserva i dati esistenti e aggiunge la tabella aliases', async () => {
    const { default: Dexie } = await import('dexie')
    const name = 'test-migrate'
    // DB creato come nella v1 (senza tabella aliases)
    const old = new Dexie(name)
    old.version(1).stores({
      exercises: 'id, source, name, type', plans: 'id, name, updatedAt', sessions: 'id, status, startedAt',
      photos: 'id, exerciseId', settings: 'id', meta: 'id',
    })
    await old.open()
    await old.table('meta').add({ id: 'meta', schemaVersion: 1 })
    await old.table('settings').add(DEFAULT_SETTINGS)
    await old.table('sessions').add({ id: 's1', startedAt: '2026-10-14T10:00:00+02:00', status: 'done', notes: '', groups: [], entries: [] })
    old.close()

    const db = new SpingereDB(name)
    await db.open()
    expect((await db.meta.get('meta'))?.schemaVersion).toBe(2)
    expect((await db.sessions.get('s1'))?.status).toBe('done')
    await db.aliases.add({ id: 'a1', exerciseId: 'b:x', text: 'panca del lunedì' })
    expect(await db.aliases.where('exerciseId').equals('b:x').count()).toBe(1)
    db.close()
  })
})
