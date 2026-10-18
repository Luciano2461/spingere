import { epley1RM } from './stats'
import type { ExerciseType, SetLog } from './types'

export type RecordKind = 'weight' | 'e1rm' | 'reps_at_weight' | 'volume' | 'reps' | 'seconds'

export const RECORD_LABELS: Record<RecordKind, string> = {
  weight: 'Carico massimo',
  e1rm: 'Massimale stimato',
  reps_at_weight: 'Ripetizioni a questo carico',
  volume: 'Volume della serie',
  reps: 'Ripetizioni massime',
  seconds: 'Tempo massimo',
}

const counts = (s: SetLog) => s.done && s.kind !== 'warmup'
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : -Infinity)

/**
 * Record battuti da `set` rispetto alle serie precedenti dello stesso esercizio (storico + serie già fatte nella sessione).
 * Senza serie precedenti non c'è un punto di confronto: nessun record. Le serie di riscaldamento non contano.
 */
export function recordsFor(type: ExerciseType, previous: SetLog[], set: SetLog): RecordKind[] {
  if (!counts(set)) return []
  const prev = previous.filter(counts)
  if (prev.length === 0) return []
  const out: RecordKind[] = []

  if (type === 'weight_reps' || type === 'weighted_bodyweight') {
    const w = set.weight
    const r = set.reps
    if (w === undefined || !r || r < 1) return []
    const prevWeights = prev.filter((s) => s.weight !== undefined && s.reps).map((s) => s.weight!)
    if (w > max(prevWeights)) out.push('weight')
    const e = epley1RM(w, r)
    if (e !== null) {
      const prevE = prev.map((s) => (s.weight !== undefined && s.reps ? epley1RM(s.weight, s.reps) : null)).filter((x): x is number => x !== null)
      if (e > max(prevE) + 1e-9) out.push('e1rm')
    }
    const sameWeight = prev.filter((s) => s.weight === w && s.reps).map((s) => s.reps!)
    if (sameWeight.length && r > max(sameWeight)) out.push('reps_at_weight')
    if (w > 0 && w * r > max(prev.filter((s) => (s.weight ?? 0) > 0 && s.reps).map((s) => s.weight! * s.reps!))) out.push('volume')
  } else if (type === 'bodyweight') {
    if (set.reps && set.reps > max(prev.map((s) => s.reps ?? 0))) out.push('reps')
  } else if (type === 'timed') {
    if (set.seconds && set.seconds > max(prev.map((s) => s.seconds ?? 0))) out.push('seconds')
  }
  return out
}
