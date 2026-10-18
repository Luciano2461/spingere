import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { applyImport, base64ToBlob, blobToBase64, collectBackup, previewImport } from './backup'
import { SpingereDB } from './db'
import { parseBackup } from '../domain/backup'
import { newDay, newPlan } from '../domain/plan'
import type { Session } from '../domain/types'

const done = (id: string): Session => ({
  id, startedAt: '2026-10-01T10:00:00Z', endedAt: '2026-10-01T11:00:00Z', status: 'done', groups: [], notes: 'n',
  entries: [{ exerciseId: 'b:x', nameSnapshot: 'X', type: 'weight_reps', sets: [{ kind: 'normal', done: true, weight: 60, reps: 10 }] }],
})

let n = 0
const fresh = async () => {
  const db = new SpingereDB(`bk-${++n}`)
  await db.open()
  return db
}

async function populated() {
  const db = await fresh()
  const plan = { ...newPlan('Scheda A'), days: [newDay('Push')] }
  await db.plans.add(plan)
  await db.sessions.bulkAdd([done('s1'), { ...done('s-active'), status: 'active', endedAt: undefined }])
  await db.aliases.add({ id: 'a1', exerciseId: 'b:x', text: 'panca del lunedì' })
  await db.photos.add({ id: 'p1', exerciseId: 'b:x', blob: new Blob([new Uint8Array([1, 2, 3, 250, 255])], { type: 'image/jpeg' }) })
  await db.imageChoices.add({ exerciseId: 'b:x', kind: 'photo', photoId: 'p1' })
  await db.exercises.add({ id: 'c:1', source: 'custom', name: 'Mio', type: 'weight_reps', equipment: 'other', primaryMuscles: [], secondaryMuscles: [], images: [] })
  await db.exercises.add({ id: 'b:x', source: 'builtin', name: 'X', type: 'weight_reps', equipment: 'other', primaryMuscles: [], secondaryMuscles: [], images: [] })
  await db.settings.update('settings', { defaultRestSeconds: 120, lastBackupAt: '2026-09-01T00:00:00Z' })
  return { db, plan }
}

describe('base64', () => {
  it('andata e ritorno senza perdere byte', async () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256) // più di un blocco da 32 KB
    const back = base64ToBlob(await blobToBase64(new Blob([bytes])), 'image/jpeg')
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes)
    expect(back.type).toBe('image/jpeg')
  })
})

describe('esportazione e ripristino', () => {
  it('esporta → importa su un dispositivo vuoto restituisce gli stessi dati', async () => {
    const { db, plan } = await populated()
    const text = JSON.stringify(await collectBackup(db, '0.1.0'))
    expect(text).not.toContain('s-active')
    const target = await fresh()
    await applyImport(target, parseBackup(text), 'replace')
    expect(await target.plans.get(plan.id)).toEqual(plan)
    expect((await target.sessions.toArray()).map((s) => s.id)).toEqual(['s1'])
    expect((await target.sessions.get('s1'))?.entries[0].sets[0].weight).toBe(60)
    expect((await target.aliases.get('a1'))?.text).toBe('panca del lunedì')
    expect((await target.exercises.toArray()).map((e) => e.id)).toEqual(['c:1']) // il database interno non fa parte del backup
    expect(await target.imageChoices.get('b:x')).toMatchObject({ kind: 'photo', photoId: 'p1' })
    const photo = await target.photos.get('p1')
    expect(new Uint8Array(await photo!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250, 255]))
    expect(photo!.blob.type).toBe('image/jpeg')
    expect((await target.settings.get('settings'))?.defaultRestSeconds).toBe(120)
  })

  it('la sostituzione cancella i dati locali ma conserva la data dell\'ultimo backup locale', async () => {
    const { db } = await populated()
    const backup = parseBackup(JSON.stringify(await collectBackup(db, '0.1.0')))
    const target = await fresh()
    await target.plans.add(newPlan('Da cancellare'))
    await target.sessions.add(done('vecchia'))
    await target.settings.update('settings', { lastBackupAt: '2026-10-10T00:00:00Z' })
    await applyImport(target, backup, 'replace')
    expect((await target.plans.toArray()).map((p) => p.name)).toEqual(['Scheda A'])
    expect((await target.sessions.toArray()).map((s) => s.id)).toEqual(['s1'])
    expect((await target.settings.get('settings'))?.lastBackupAt).toBe('2026-10-10T00:00:00Z')
  })

  it('la sostituzione è rifiutata se c\'è un allenamento in corso', async () => {
    const { db } = await populated()
    const backup = parseBackup(JSON.stringify(await collectBackup(db, '0.1.0')))
    await expect(applyImport(db, backup, 'replace')).rejects.toThrow(/in corso/)
    expect(await db.plans.count()).toBe(1) // niente è cambiato
  })

  it('l\'unione è idempotente e non tocca ciò che c\'è già', async () => {
    const { db } = await populated()
    const backup = parseBackup(JSON.stringify(await collectBackup(db, '0.1.0')))
    const target = await fresh()
    await target.sessions.add({ ...done('locale'), startedAt: '2026-10-05T10:00:00Z' })
    await applyImport(target, backup, 'merge')
    await applyImport(target, backup, 'merge')
    expect((await target.sessions.toArray()).map((s) => s.id).sort()).toEqual(['locale', 's1'])
    expect(await target.plans.count()).toBe(1)
    expect(await target.photos.count()).toBe(1)
    const again = await previewImport(target, backup, 'merge')
    expect(again.plan.skipped).toMatchObject({ plans: 1, sessions: 1, aliases: 1, photos: 1 })
  })

  it('l\'unione aggiorna una scheda solo se quella nel file è più recente', async () => {
    const { db, plan } = await populated()
    await db.plans.update(plan.id, { name: 'Rinominata', updatedAt: '2999-01-01T00:00:00Z' })
    const backup = parseBackup(JSON.stringify(await collectBackup(db, '0.1.0')))
    const target = await fresh()
    await target.plans.add({ ...plan, name: 'Vecchia', updatedAt: '2000-01-01T00:00:00Z' })
    await applyImport(target, backup, 'merge')
    expect((await target.plans.get(plan.id))?.name).toBe('Rinominata')
    await target.plans.update(plan.id, { name: 'Mia più nuova', updatedAt: '3000-01-01T00:00:00Z' })
    await applyImport(target, backup, 'merge')
    expect((await target.plans.get(plan.id))?.name).toBe('Mia più nuova')
  })

  it('un file malformato non cambia nulla', async () => {
    const { db } = await populated()
    expect(() => parseBackup('{"format":"spingere-backup","schemaVersion":2,"data":{"plans":1}}')).toThrow()
    expect(await db.plans.count()).toBe(1)
  })
})
