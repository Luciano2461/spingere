import { migrateData, type RawData } from './migrations'
import type { Alias, Exercise, ImageChoice, Plan, Session, Settings } from './types'
import { SCHEMA_VERSION } from './types'

// Formato del backup JSON di Spingere. Documentato in BACKUP_FORMAT.md (condiviso con la futura app Swift).
// Ogni modifica a questo file o allo schema dati va riportata lì.

export const BACKUP_FORMAT = 'spingere-backup'

export interface BackupPhoto {
  id: string
  exerciseId: string
  mime: string
  data: string // base64 (senza prefisso data:)
}

export type BackupSettings = Omit<Settings, 'id' | 'lastBackupAt'>

export interface BackupData {
  plans: Plan[]
  sessions: Session[] // solo allenamenti conclusi
  customExercises: Exercise[]
  aliases: Alias[]
  imageChoices: ImageChoice[]
  photos: BackupPhoto[]
  settings: BackupSettings
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  schemaVersion: number
  exportedAt: string
  app: { name: string; version: string }
  data: BackupData
}

export class BackupError extends Error {}

// --- Costruzione ---

export interface BackupSource {
  plans: Plan[]
  sessions: Session[]
  exercises: Exercise[]
  aliases: Alias[]
  imageChoices: ImageChoice[]
  photos: BackupPhoto[]
  settings: Settings | undefined
}

export function buildBackup(src: BackupSource, appVersion: string, exportedAt = new Date().toISOString()): BackupFile {
  const { id: _id, lastBackupAt: _last, ...settings } = src.settings ?? ({} as Settings)
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    app: { name: 'Spingere', version: appVersion },
    data: {
      plans: src.plans,
      // l'allenamento in corso non fa parte del backup (e il suo timer di recupero ancora meno)
      sessions: src.sessions.filter((s) => s.status === 'done').map(({ rest: _rest, ...s }) => s as Session),
      customExercises: src.exercises.filter((e) => e.source === 'custom'),
      aliases: src.aliases,
      imageChoices: src.imageChoices,
      photos: src.photos,
      settings: settings as BackupSettings,
    },
  }
}

// --- Lettura e validazione ---

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const arr = (v: unknown, name: string): unknown[] => {
  if (!Array.isArray(v)) throw new BackupError(`Il file non è un backup valido: manca l'elenco «${name}».`)
  return v
}

function check(ok: boolean, what: string): asserts ok {
  if (!ok) throw new BackupError(`Il file non è un backup valido: ${what}.`)
}

/** Data ISO normalizzata in UTC («Z»), così i confronti tra stringhe funzionano anche con file scritti con un altro fuso (es. «+02:00»). */
const toIso = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v)) return v // già in UTC: lasciata com'è
  const t = Date.parse(v)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

const SET_KINDS = ['normal', 'warmup', 'drop', 'failure']
const NUMERIC_SET_FIELDS = ['weight', 'reps', 'seconds', 'distance']

/** Un allenamento importato è sempre concluso (mai un secondo allenamento «in corso»), con i campi mancanti completati e i numeri non validi tolti. */
function normalizeSession(s: Record<string, unknown>): void {
  delete s.rest // il timer di recupero non fa parte del backup, anche se presente per errore
  s.startedAt = toIso(s.startedAt)
  s.endedAt = toIso(s.endedAt) ?? s.startedAt
  const updated = toIso(s.updatedAt)
  if (updated) s.updatedAt = updated
  else delete s.updatedAt
  s.status = 'done'
  if (!Array.isArray(s.groups)) s.groups = []
  if (typeof s.notes !== 'string') s.notes = ''
  for (const e of s.entries as Record<string, unknown>[]) {
    e.sets = (e.sets as unknown[]).filter(isObj).map((set) => {
      const out: Record<string, unknown> = { ...set, kind: SET_KINDS.includes(set.kind as string) ? set.kind : 'normal', done: set.done !== false }
      for (const f of NUMERIC_SET_FIELDS) if (f in out && (typeof out[f] !== 'number' || !Number.isFinite(out[f]))) delete out[f]
      return out
    })
  }
}

function validateData(d: RawData): BackupData {
  const plans = arr(d.plans, 'plans')
  plans.forEach((p, i) => {
    check(isObj(p) && isStr(p.id) && typeof p.name === 'string' && Array.isArray(p.days), `scheda n. ${i + 1} malformata`)
    ;(p.days as unknown[]).forEach((day) => {
      check(isObj(day) && isStr(day.id) && Array.isArray(day.exercises) && Array.isArray(day.groups), `giorno malformato nella scheda «${p.name}»`)
    })
  })
  const sessions = arr(d.sessions, 'sessions')
  sessions.forEach((s, i) => {
    check(isObj(s) && isStr(s.id) && toIso(s.startedAt) !== undefined && Array.isArray(s.entries), `allenamento n. ${i + 1} malformato`)
    ;(s.entries as unknown[]).forEach((e) => check(isObj(e) && isStr(e.exerciseId) && Array.isArray(e.sets), `esercizio malformato nell'allenamento del ${s.startedAt}`))
  })
  const custom = arr(d.customExercises, 'customExercises')
  custom.forEach((e, i) => check(isObj(e) && isStr(e.id) && (e.id as string).startsWith('c:') && isStr(e.name), `esercizio personalizzato n. ${i + 1} malformato`))
  arr(d.aliases, 'aliases').forEach((a, i) => check(isObj(a) && isStr(a.id) && isStr(a.exerciseId) && isStr(a.text), `nome personale n. ${i + 1} malformato`))
  arr(d.imageChoices, 'imageChoices').forEach((c, i) => check(isObj(c) && isStr(c.exerciseId) && (c.kind === 'builtin' || c.kind === 'photo'), `immagine scelta n. ${i + 1} malformata`))
  arr(d.photos, 'photos').forEach((p, i) => check(isObj(p) && isStr(p.id) && isStr(p.exerciseId) && isStr(p.mime) && isStr(p.data), `foto n. ${i + 1} malformata`))
  check(isObj(d.settings), 'mancano le impostazioni')
  ;(d.sessions as Record<string, unknown>[]).forEach(normalizeSession)
  for (const p of plans as Record<string, unknown>[]) {
    p.createdAt = toIso(p.createdAt) ?? p.createdAt
    p.updatedAt = toIso(p.updatedAt) ?? p.updatedAt
  }
  return d as unknown as BackupData
}

/** Legge, valida e porta alla versione corrente un file di backup. Lancia BackupError con un messaggio comprensibile. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('Il file non è un backup di Spingere: non è un JSON leggibile.')
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new BackupError('Il file non è un backup di Spingere.')
  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new BackupError('Il backup non indica una versione valida.')
  if (version > SCHEMA_VERSION) throw new BackupError(`Questo backup è stato fatto con una versione più recente di Spingere (formato ${version}). Aggiorna l'app e riprova.`)
  if (!isObj(raw.data)) throw new BackupError('Il file non è un backup valido: mancano i dati.')
  const migrated = migrateData(raw.data, version)
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    app: isObj(raw.app) ? { name: String(raw.app.name ?? ''), version: String(raw.app.version ?? '') } : { name: '', version: '' },
    data: validateData(migrated),
  }
}

export interface BackupCounts {
  plans: number
  sessions: number
  customExercises: number
  aliases: number
  imageChoices: number
  photos: number
}

export const countData = (d: BackupData): BackupCounts => ({
  plans: d.plans.length,
  sessions: d.sessions.length,
  customExercises: d.customExercises.length,
  aliases: d.aliases.length,
  imageChoices: d.imageChoices.length,
  photos: d.photos.length,
})

// --- Importazione ---

export type ImportMode = 'merge' | 'replace'

/** Momento dell'ultima modifica di un allenamento (per i file senza `updatedAt`: la fine, altrimenti l'inizio). */
export const sessionStamp = (s: Pick<Session, 'updatedAt' | 'endedAt' | 'startedAt'>) => s.updatedAt ?? s.endedAt ?? s.startedAt

export interface ExistingData {
  plans: Plan[]
  /** Allenamenti sul dispositivo: id → ultima modifica, `null` per quello in corso (mai sovrascritto). */
  sessions: Map<string, string | null>
  exerciseIds: Set<string> // esercizi personalizzati presenti
  aliasIds: Set<string>
  imageChoiceIds: Set<string> // exerciseId
  photoIds: Set<string>
}

export interface ImportPlan {
  mode: ImportMode
  /** Elementi da scrivere. */
  plans: Plan[]
  sessions: Session[]
  customExercises: Exercise[]
  aliases: Alias[]
  imageChoices: ImageChoice[]
  photos: BackupPhoto[]
  replaceSettings: boolean
  /** Quanti elementi del file non vengono importati perché già presenti o più vecchi (solo unione). */
  skipped: BackupCounts
  warnings: string[]
}

const zero = (): BackupCounts => ({ plans: 0, sessions: 0, customExercises: 0, aliases: 0, imageChoices: 0, photos: 0 })

/**
 * Decide cosa scrivere.
 * - unione: aggiunge ciò che manca; una scheda o un allenamento già presenti vengono aggiornati solo se quelli del file sono più recenti
 *   (l'allenamento in corso non si tocca mai); nomi, immagini scelte e foto già presenti non si toccano; le impostazioni locali restano.
 * - sostituzione: cancella i dati dell'utente sul dispositivo e importa tutto il file (impostazioni comprese).
 */
export function planImport(existing: ExistingData, backup: BackupFile, mode: ImportMode): ImportPlan {
  const d = backup.data
  const skipped = zero()
  const warnings: string[] = []
  const merge = mode === 'merge'

  const plans = merge
    ? d.plans.filter((p) => {
        const local = existing.plans.find((x) => x.id === p.id)
        const take = !local || p.updatedAt > local.updatedAt
        if (!take) skipped.plans++
        return take
      })
    : d.plans
  const only = <T>(list: T[], key: (x: T) => string, have: Set<string>, field: keyof BackupCounts): T[] =>
    merge
      ? list.filter((x) => {
          const dup = have.has(key(x))
          if (dup) skipped[field]++
          return !dup
        })
      : list

  const sessions = merge
    ? d.sessions.filter((s) => {
        const local = existing.sessions.get(s.id)
        const take = local === undefined || (local !== null && sessionStamp(s) > local)
        if (!take) skipped.sessions++
        return take
      })
    : d.sessions
  const customExercises = only(d.customExercises, (e) => e.id, existing.exerciseIds, 'customExercises')
  const aliases = only(d.aliases, (a) => a.id, existing.aliasIds, 'aliases')
  const photos = only(d.photos, (p) => p.id, existing.photoIds, 'photos')
  let imageChoices = only(d.imageChoices, (c) => c.exerciseId, existing.imageChoiceIds, 'imageChoices')

  // una scelta «foto» è valida solo se la foto esiste (nel file o già sul dispositivo)
  const availablePhotos = new Set([...d.photos.map((p) => p.id), ...(merge ? existing.photoIds : [])])
  const before = imageChoices.length
  imageChoices = imageChoices.filter((c) => c.kind !== 'photo' || (c.photoId && availablePhotos.has(c.photoId)))
  if (imageChoices.length < before) warnings.push(`${before - imageChoices.length} immagine/i scelta/e ignorata/e perché la foto non è nel backup.`)

  return { mode, plans, sessions, customExercises, aliases, imageChoices, photos, replaceSettings: !merge, skipped, warnings }
}

// --- Promemoria ---

export interface ReminderInput {
  backupReminderDays: number // 0 = disattivato
  lastBackupAt?: string
  /** Data del dato più vecchio dell'utente (scheda creata o allenamento fatto), se esiste. */
  oldestDataAt?: string
}

/** Quando ricordare il backup: ci sono dati e dall'ultimo backup (o dai primi dati, se non ne esiste uno) sono passati i giorni scelti. */
export function backupReminder(r: ReminderInput, now = Date.now()): { due: boolean; daysSince: number | null } {
  const base = r.lastBackupAt ?? r.oldestDataAt
  if (!r.backupReminderDays || !base) return { due: false, daysSince: null }
  const days = Math.floor((now - new Date(base).getTime()) / 86_400_000)
  return { due: days >= r.backupReminderDays, daysSince: r.lastBackupAt ? days : null }
}
