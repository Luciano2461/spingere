import { addExercise, newDay, newPlan, newPlanExercise } from './plan'
import type { Exercise, Plan } from './types'

/** Scheda di esempio per chi inizia: full body in due giorni, con esercizi del database (ID stabili). */
export const SAMPLE_PLAN_NAME = 'Scheda di esempio (full body)'

export const SAMPLE_DAYS: { name: string; exerciseIds: string[] }[] = [
  { name: 'Full body A', exerciseIds: ['b:barbell-squat', 'b:barbell-bench-press-medium-grip', 'b:bent-over-barbell-row', 'b:standing-military-press', 'b:plank'] },
  { name: 'Full body B', exerciseIds: ['b:romanian-deadlift', 'b:incline-dumbbell-press', 'b:wide-grip-lat-pulldown', 'b:side-lateral-raise', 'b:crunches'] },
]

/** Costruisce la scheda saltando gli esercizi non presenti nel database; null se non ne resta nessuno. */
export function buildSamplePlan(exercises: Exercise[], defaultRestSeconds: number): Plan | null {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const days = SAMPLE_DAYS.map((d) => {
    let day = newDay(d.name)
    for (const id of d.exerciseIds) {
      const ex = byId.get(id)
      if (ex) day = addExercise(day, newPlanExercise(ex, defaultRestSeconds))
    }
    return day
  }).filter((d) => d.exercises.length > 0)
  if (days.length === 0) return null
  return { ...newPlan(SAMPLE_PLAN_NAME), days }
}
