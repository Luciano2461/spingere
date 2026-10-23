// Modello dati — schema v2 (v2: tabelle Alias e ImageChoice). Documentato in docs/ARCHITETTURA.md (e BACKUP_FORMAT.md allo step 5).
// Regole: ID = UUID (esercizi builtin: "b:<slug>", custom: "c:<uuid>"), date ISO 8601, pesi in kg.

export const SCHEMA_VERSION = 2

export type ExerciseType = 'weight_reps' | 'bodyweight' | 'weighted_bodyweight' | 'timed' | 'cardio'
export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure'
export type GroupKind = 'superset' | 'circuit'

export interface Exercise {
  id: string
  source: 'builtin' | 'custom'
  name: string
  nameOriginal?: string
  type: ExerciseType
  equipment: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  images: string[]
  photoId?: string
  needsTranslation?: boolean
  deleted?: boolean
}

export interface PlanExercise {
  exerciseId: string
  nameSnapshot: string
  targetSets: number
  targetReps?: number
  targetSeconds?: number
  targetWeight?: number
  restSeconds: number
  notes: string
  groupId?: string
}

export interface PlanGroup {
  id: string
  kind: GroupKind
  restAfterGroup: number
}

export interface PlanDay {
  id: string
  name: string
  groups: PlanGroup[]
  exercises: PlanExercise[] // l'ordine dell'array è l'ordine di esecuzione
}

export interface Plan {
  id: string
  name: string
  notes: string
  days: PlanDay[]
  createdAt: string
  updatedAt: string
}

export interface SetLog {
  kind: SetKind
  weight?: number
  reps?: number
  seconds?: number
  distance?: number
  rpe?: number
  rir?: number
  done: boolean
  doneAt?: string
}

export interface SessionEntry {
  exerciseId: string
  nameSnapshot: string
  type: ExerciseType
  groupId?: string
  restSeconds?: number // recupero dopo ogni serie (copiato dalla scheda); negli esercizi in gruppo conta quello del gruppo
  sets: SetLog[]
}

/** Recupero in corso: salvato come orario di fine, così resta corretto anche se l'app va in background o viene ricaricata. */
export interface RestTimer {
  endsAt: string // ISO 8601
  durationSeconds: number
}

// Lo storico è autonomo: nessun riferimento a Plan/PlanExercise.
export interface Session {
  id: string
  planName?: string
  dayName?: string
  startedAt: string
  endedAt?: string
  updatedAt?: string // ultima modifica di un allenamento concluso (fine o correzione successiva): l'unione dei backup tiene la più recente
  status: 'active' | 'done'
  entries: SessionEntry[]
  groups: PlanGroup[]
  notes: string
  rest?: RestTimer // solo mentre la sessione è in corso
}

/** Nome alternativo scelto dall'utente per un esercizio (cercabile; usato anche per riconoscere i nomi negli import). */
export interface Alias {
  id: string
  exerciseId: string
  text: string
}

/** Immagine scelta dall'utente per un esercizio (al posto di quelle di default). Separata dall'esercizio, che viene riscritto a ogni aggiornamento del database. */
export interface ImageChoice {
  exerciseId: string
  kind: 'builtin' | 'photo'
  path?: string // kind 'builtin': immagine inclusa nell'app (anche di un altro esercizio)
  photoId?: string // kind 'photo': foto personale (tabella photos)
}

export interface PersonalPhoto {
  id: string
  exerciseId: string
  blob: Blob
}

export type RestSoundStyle = 'classic' | 'gong' | 'triple'
export type RestVolume = 'low' | 'medium' | 'high'

export interface Settings {
  id: 'settings'
  increments: number[]
  defaultRestSeconds: number
  backupReminderDays: number
  theme: 'system' | 'light' | 'dark'
  restSound?: boolean // suono a fine recupero (se assente: sì)
  restSoundStyle?: RestSoundStyle // se assente: classic
  restVolume?: RestVolume // se assente: high
  restCountdown?: boolean // preavviso a 10 s e 3-2-1 (se assente: sì)
  restIgnoreSilent?: boolean // suona anche con l'interruttore Silenzioso, dove iOS lo permette (se assente: no)
  weightStep?: number // passo dei pulsanti −/+ del carico (se assente: 2,5 kg)
  lastBackupAt?: string
}

export interface Meta {
  id: 'meta'
  schemaVersion: number
  exercisesDatasetVersion?: number // versione del database esercizi incluso nell'app (non fa parte del backup)
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  increments: [1.25, 2.5, 5],
  defaultRestSeconds: 90,
  backupReminderDays: 14,
  theme: 'system',
}
