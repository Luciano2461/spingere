import { normalize } from './search'
import type { Exercise, ExerciseType } from './types'

// Esercizi personalizzati: creazione, modifica, controlli. Funzioni pure; la scrittura nel database sta in db/exercises.ts.

export const MAX_NAME_LENGTH = 80

export interface ExerciseForm {
  name: string
  type: ExerciseType
  equipment: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
}

export const EMPTY_FORM: ExerciseForm = { name: '', type: 'weight_reps', equipment: 'other', primaryMuscles: [], secondaryMuscles: [] }

export function formFromExercise(e: Exercise): ExerciseForm {
  return { name: e.name, type: e.type, equipment: e.equipment, primaryMuscles: [...e.primaryMuscles], secondaryMuscles: [...e.secondaryMuscles] }
}

/** Errore sul nome (null se va bene): obbligatorio, non troppo lungo, non uguale a un altro esercizio (esclusi quelli eliminati e l'esercizio stesso). */
export function validateName(name: string, all: Exercise[], selfId?: string): string | null {
  const n = name.trim()
  if (!n) return 'Scrivi il nome dell\'esercizio.'
  if (n.length > MAX_NAME_LENGTH) return `Il nome è troppo lungo (massimo ${MAX_NAME_LENGTH} caratteri).`
  const key = normalize(n)
  if (all.some((e) => !e.deleted && e.id !== selfId && normalize(e.name) === key)) return 'Esiste già un esercizio con questo nome.'
  return null
}

const unique = (xs: string[]) => [...new Set(xs)]

/** Muscoli puliti: senza doppioni e i secondari non ripetono i principali. */
export function cleanMuscles(primary: string[], secondary: string[]): { primaryMuscles: string[]; secondaryMuscles: string[] } {
  const primaryMuscles = unique(primary)
  return { primaryMuscles, secondaryMuscles: unique(secondary).filter((m) => !primaryMuscles.includes(m)) }
}

/** Nuovo esercizio personalizzato (ID `c:<uuid>`, distinguibile da quelli del database). */
export function newCustomExercise(form: ExerciseForm, id = `c:${crypto.randomUUID()}`): Exercise {
  return {
    id,
    source: 'custom',
    name: form.name.trim(),
    type: form.type,
    equipment: form.equipment || 'other',
    ...cleanMuscles(form.primaryMuscles, form.secondaryMuscles),
    images: [],
  }
}

/** Esercizio personalizzato con i campi modificati. Gli ID e le foto non cambiano; lo storico resta con la sua copia del nome. */
export function applyForm(exercise: Exercise, form: ExerciseForm): Exercise {
  return { ...exercise, name: form.name.trim(), type: form.type, equipment: form.equipment || 'other', ...cleanMuscles(form.primaryMuscles, form.secondaryMuscles) }
}

export const isCustom = (e: Pick<Exercise, 'id' | 'source'>) => e.source === 'custom' && e.id.startsWith('c:')
