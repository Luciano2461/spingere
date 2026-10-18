import muscles from './muscles.json'
import equipment from './equipment.json'
import type { ExerciseType } from '../domain/types'

export const MUSCLE_LABELS = muscles as Record<string, string>
export const EQUIPMENT_LABELS = equipment as Record<string, string>

export const TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: 'Carico × ripetizioni',
  bodyweight: 'Corpo libero',
  weighted_bodyweight: 'Corpo libero (zavorra/assistenza)',
  timed: 'A tempo',
  cardio: 'Cardio',
}

export const muscleLabel = (key: string) => MUSCLE_LABELS[key] ?? key
export const equipmentLabel = (key: string) => EQUIPMENT_LABELS[key] ?? key
