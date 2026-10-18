import { describe, expect, it } from 'vitest'
import { BackupError, backupReminder, buildBackup, countData, parseBackup, planImport, type BackupSource, type ExistingData } from './backup'
import { newDay, newPlan } from './plan'
import type { Exercise, Session } from './types'
import { DEFAULT_SETTINGS } from './types'

const done = (id: string): Session => ({ id, startedAt: '2026-10-01T10:00:00Z', endedAt: '2026-10-01T11:00:00Z', status: 'done', entries: [], groups: [], notes: '' })
const custom: Exercise = { id: 'c:1', source: 'custom', name: 'Mio', type: 'weight_reps', equipment: 'other', primaryMuscles: [], secondaryMuscles: [], images: [] }
const builtin: Exercise = { ...custom, id: 'b:x', source: 'builtin' }

const source = (over: Partial<BackupSource> = {}): BackupSource => ({
  plans: [{ ...newPlan('A'), days: [newDay('Push')] }],
  sessions: [done('s1'), { ...done('s2'), status: 'active', rest: { endsAt: '2026-10-14T10:00:00Z', durationSeconds: 90 } }],
  exercises: [custom, builtin],
  aliases: [{ id: 'a1', exerciseId: 'b:x', text: 'panca' }],
  imageChoices: [{ exerciseId: 'b:x', kind: 'builtin', path: 'y/0.webp' }],
  photos: [],
  settings: { ...DEFAULT_SETTINGS, lastBackupAt: '2026-09-01T00:00:00Z' },
  ...over,
})
const file = (s = source()) => buildBackup(s, '0.1.0', '2026-10-14T12:00:00Z')

describe('buildBackup', () => {
  it('include solo allenamenti conclusi, esercizi personalizzati e impostazioni senza id/lastBackupAt', () => {
    const b = file()
    expect(b.format).toBe('spingere-backup')
    expect(b.schemaVersion).toBe(2)
    expect(b.data.sessions.map((s) => s.id)).toEqual(['s1'])
    expect(b.data.customExercises.map((e) => e.id)).toEqual(['c:1'])
    expect(b.data.settings).not.toHaveProperty('id')
    expect(b.data.settings).not.toHaveProperty('lastBackupAt')
  })
  it('non contiene mai il timer di recupero', () => {
    expect(JSON.stringify(file())).not.toContain('"rest"')
  })
})

describe('parseBackup', () => {
  const text = (o: unknown) => JSON.stringify(o)
  it('rilegge ciò che ha scritto', () => {
    const b = file()
    expect(parseBackup(text(b)).data).toEqual(b.data)
    expect(countData(parseBackup(text(b)).data)).toMatchObject({ plans: 1, sessions: 1, customExercises: 1, aliases: 1, imageChoices: 1 })
  })
  it('rifiuta file che non sono backup, con messaggi chiari', () => {
    expect(() => parseBackup('non json')).toThrow(/JSON leggibile/)
    expect(() => parseBackup(text({ foo: 1 }))).toThrow(/non è un backup di Spingere/)
    expect(() => parseBackup(text({ ...file(), schemaVersion: 'x' }))).toThrow(/versione valida/)
    expect(() => parseBackup(text({ ...file(), schemaVersion: 99 }))).toThrow(/più recente/)
    expect(() => parseBackup(text({ ...file(), data: null }))).toThrow(BackupError)
  })
  it('rifiuta dati malformati indicando cosa manca', () => {
    const b = file()
    expect(() => parseBackup(text({ ...b, data: { ...b.data, plans: 'no' } }))).toThrow(/«plans»/)
    expect(() => parseBackup(text({ ...b, data: { ...b.data, sessions: [{ id: 'x' }] } }))).toThrow(/allenamento n\. 1/)
    expect(() => parseBackup(text({ ...b, data: { ...b.data, customExercises: [{ ...custom, id: 'b:no' }] } }))).toThrow(/personalizzato/)
  })
  it('porta un backup v1 alla versione corrente', () => {
    const b = file()
    const { aliases: _a, imageChoices: _i, ...v1data } = b.data
    const parsed = parseBackup(text({ ...b, schemaVersion: 1, data: v1data }))
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.data.aliases).toEqual([])
    expect(parsed.data.imageChoices).toEqual([])
  })
  it('un allenamento del file è sempre concluso, con campi completati e numeri validi', () => {
    const b = file()
    const raw = {
      ...b,
      data: {
        ...b.data,
        sessions: [{
          id: 'x', startedAt: '2026-10-01T12:00:00+02:00', status: 'active',
          entries: [{ exerciseId: 'b:x', nameSnapshot: 'X', type: 'weight_reps', sets: [{ kind: 'boh', weight: 'tanti', reps: 8 }] }],
        }],
      },
    }
    const s = parseBackup(text(raw)).data.sessions[0]
    expect(s).toMatchObject({ status: 'done', startedAt: '2026-10-01T10:00:00.000Z', endedAt: '2026-10-01T10:00:00.000Z', groups: [], notes: '' })
    expect(s.entries[0].sets[0]).toEqual({ kind: 'normal', done: true, reps: 8 })
    expect(() => parseBackup(text({ ...b, data: { ...b.data, sessions: [{ id: 'y', startedAt: 'ieri', entries: [] }] } }))).toThrow(/allenamento n\. 1/)
  })
  it('scarta un timer di recupero finito per errore nel file', () => {
    const b = file()
    const withRest = { ...b, data: { ...b.data, sessions: [{ ...b.data.sessions[0], rest: { endsAt: 'x', durationSeconds: 1 } }] } }
    expect(parseBackup(text(withRest)).data.sessions[0]).not.toHaveProperty('rest')
  })
})

describe('planImport', () => {
  const none: ExistingData = { plans: [], sessions: new Map(), exerciseIds: new Set(), aliasIds: new Set(), imageChoiceIds: new Set(), photoIds: new Set() }
  it('unione su dispositivo vuoto importa tutto', () => {
    const p = planImport(none, file(), 'merge')
    expect(p.plans).toHaveLength(1)
    expect(p.sessions).toHaveLength(1)
    expect(p.skipped).toEqual({ plans: 0, sessions: 0, customExercises: 0, aliases: 0, imageChoices: 0, photos: 0 })
    expect(p.replaceSettings).toBe(false)
  })
  it('unione salta ciò che c\'è già e aggiorna solo le schede più recenti', () => {
    const b = file()
    const plan = b.data.plans[0]
    const sameOld: ExistingData = { ...none, plans: [{ ...plan, updatedAt: '2999-01-01T00:00:00Z' }], sessions: new Map([['s1', '2026-10-01T11:00:00Z']]), aliasIds: new Set(['a1']) }
    const p = planImport(sameOld, b, 'merge')
    expect(p.plans).toHaveLength(0)
    expect(p.sessions).toHaveLength(0)
    expect(p.aliases).toHaveLength(0)
    expect(p.skipped).toMatchObject({ plans: 1, sessions: 1, aliases: 1 })
    const localOlder: ExistingData = { ...none, plans: [{ ...plan, updatedAt: '2000-01-01T00:00:00Z' }] }
    expect(planImport(localOlder, b, 'merge').plans).toHaveLength(1)
  })
  it('unione aggiorna un allenamento corretto più di recente, mai quello in corso', () => {
    const b = file(source({ sessions: [{ ...done('s1'), updatedAt: '2026-10-05T09:00:00Z' }] }))
    expect(planImport({ ...none, sessions: new Map([['s1', '2026-10-01T11:00:00Z']]) }, b, 'merge').sessions).toHaveLength(1)
    expect(planImport({ ...none, sessions: new Map([['s1', '2026-10-06T00:00:00Z']]) }, b, 'merge').sessions).toHaveLength(0)
    expect(planImport({ ...none, sessions: new Map([['s1', null]]) }, b, 'merge').sessions).toHaveLength(0)
  })
  it('sostituzione importa tutto e sostituisce le impostazioni', () => {
    const p = planImport({ ...none, sessions: new Map([['s1', '2026-10-01T11:00:00Z']]) }, file(), 'replace')
    expect(p.sessions).toHaveLength(1)
    expect(p.replaceSettings).toBe(true)
    expect(p.skipped.sessions).toBe(0)
  })
  it('ignora le immagini «foto» senza foto', () => {
    const b = file(source({ imageChoices: [{ exerciseId: 'b:x', kind: 'photo', photoId: 'nope' }] }))
    const p = planImport(none, b, 'merge')
    expect(p.imageChoices).toHaveLength(0)
    expect(p.warnings[0]).toMatch(/foto non è nel backup/)
  })
})

describe('promemoria', () => {
  const now = new Date('2026-10-30T12:00:00Z').getTime()
  it('scatta dopo i giorni scelti dall\'ultimo backup', () => {
    expect(backupReminder({ backupReminderDays: 14, lastBackupAt: '2026-10-10T12:00:00Z' }, now)).toEqual({ due: true, daysSince: 20 })
    expect(backupReminder({ backupReminderDays: 14, lastBackupAt: '2026-10-25T12:00:00Z' }, now).due).toBe(false)
  })
  it('senza backup parte dai primi dati; senza dati non scatta', () => {
    expect(backupReminder({ backupReminderDays: 14, oldestDataAt: '2026-10-01T00:00:00Z' }, now)).toEqual({ due: true, daysSince: null })
    expect(backupReminder({ backupReminderDays: 14, oldestDataAt: '2026-10-28T00:00:00Z' }, now).due).toBe(false)
    expect(backupReminder({ backupReminderDays: 14 }, now).due).toBe(false)
  })
  it('0 = disattivato', () => {
    expect(backupReminder({ backupReminderDays: 0, oldestDataAt: '2020-01-01T00:00:00Z' }, now).due).toBe(false)
  })
})
