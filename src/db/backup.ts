import type { SpingereDB } from './db'
import { DEFAULT_SETTINGS } from '../domain/types'
import {
  buildBackup, planImport, countData, sessionStamp,
  type BackupCounts, type BackupFile, type BackupPhoto, type ExistingData, type ImportMode, type ImportPlan,
} from '../domain/backup'

// --- base64 <-> Blob (funziona nel browser e in Node) ---

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// --- Esportazione ---

export async function collectBackup(db: SpingereDB, appVersion: string): Promise<BackupFile> {
  const [plans, sessions, exercises, aliases, imageChoices, photoRows, settings] = await Promise.all([
    db.plans.toArray(), db.sessions.toArray(), db.exercises.where('source').equals('custom').toArray(),
    db.aliases.toArray(), db.imageChoices.toArray(), db.photos.toArray(), db.settings.get('settings'),
  ])
  const photos: BackupPhoto[] = await Promise.all(
    photoRows.map(async (p) => ({ id: p.id, exerciseId: p.exerciseId, mime: p.blob.type || 'image/jpeg', data: await blobToBase64(p.blob) })),
  )
  return buildBackup({ plans, sessions, exercises, aliases, imageChoices, photos, settings }, appVersion)
}

// --- Importazione ---

async function readExisting(db: SpingereDB): Promise<ExistingData> {
  const [plans, sessions, exerciseIds, aliasIds, imageChoiceIds, photoIds] = await Promise.all([
    db.plans.toArray(),
    db.sessions.toArray(),
    db.exercises.where('source').equals('custom').primaryKeys(),
    db.aliases.toCollection().primaryKeys(),
    db.imageChoices.toCollection().primaryKeys(),
    db.photos.toCollection().primaryKeys(),
  ])
  return {
    plans,
    sessions: new Map(sessions.map((s) => [s.id, s.status === 'active' ? null : sessionStamp(s)])),
    exerciseIds: new Set(exerciseIds as string[]),
    aliasIds: new Set(aliasIds as string[]),
    imageChoiceIds: new Set(imageChoiceIds as string[]),
    photoIds: new Set(photoIds as string[]),
  }
}

export interface ImportPreview {
  plan: ImportPlan
  file: BackupCounts
  /** Dati dell'utente oggi sul dispositivo (verrebbero cancellati dalla sostituzione). */
  local: { plans: number; sessions: number }
  activeSession: boolean
}

export async function previewImport(db: SpingereDB, backup: BackupFile, mode: ImportMode): Promise<ImportPreview> {
  const existing = await readExisting(db)
  const activeSession = (await db.sessions.where('status').equals('active').count()) > 0
  const doneIds = await db.sessions.where('status').equals('done').count()
  return {
    plan: planImport(existing, backup, mode),
    file: countData(backup.data),
    local: { plans: existing.plans.length, sessions: doneIds },
    activeSession,
  }
}

/** Applica l'importazione in un'unica transazione: o riesce tutto o non cambia niente. */
/** `backup` deve essere un oggetto semplice (non un proxy reattivo): IndexedDB non può salvare i proxy. */
export async function applyImport(db: SpingereDB, backup: BackupFile, mode: ImportMode): Promise<ImportPlan> {
  const { plan, activeSession } = await previewImport(db, backup, mode)
  if (mode === 'replace' && activeSession) throw new Error('C\'è un allenamento in corso: concludilo o annullalo prima di sostituire i dati.')
  await db.transaction('rw', [db.plans, db.sessions, db.exercises, db.aliases, db.imageChoices, db.photos, db.settings], async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.plans.clear(), db.sessions.clear(), db.aliases.clear(), db.imageChoices.clear(), db.photos.clear(),
        db.exercises.where('source').equals('custom').delete(),
      ])
    }
    await db.plans.bulkPut(plan.plans)
    await db.sessions.bulkPut(plan.sessions)
    await db.exercises.bulkPut(plan.customExercises)
    await db.aliases.bulkPut(plan.aliases)
    await db.photos.bulkPut(plan.photos.map((p) => ({ id: p.id, exerciseId: p.exerciseId, blob: base64ToBlob(p.data, p.mime) })))
    await db.imageChoices.bulkPut(plan.imageChoices)
    if (plan.replaceSettings) {
      const local = await db.settings.get('settings')
      // le impostazioni mancanti nel file prendono il valore predefinito
      await db.settings.put({ ...DEFAULT_SETTINGS, ...backup.data.settings, id: 'settings', ...(local?.lastBackupAt ? { lastBackupAt: local.lastBackupAt } : {}) })
    }
  })
  return plan
}
