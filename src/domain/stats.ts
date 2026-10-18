import type { SetLog } from './types'

/** Una serie conta per volume e record solo se completata e non di riscaldamento. */
export function countsForStats(set: SetLog): boolean {
  return set.done && set.kind !== 'warmup'
}

export function setVolume(set: SetLog): number {
  if (!countsForStats(set)) return 0
  // con l'assistenza (peso negativo) il carico sollevato non è misurabile: conta 0, non toglie volume
  return Math.max(0, set.weight ?? 0) * (set.reps ?? 0)
}

export function totalVolume(sets: SetLog[]): number {
  return sets.reduce((sum, s) => sum + setVolume(s), 0)
}

export const EPLEY_MAX_REPS = 10

/** Massimale stimato (Epley). Affidabile solo fino a 10 ripetizioni: oltre restituisce null. */
export function epley1RM(weight: number, reps: number): number | null {
  if (!(weight > 0) || !Number.isInteger(reps) || reps < 1 || reps > EPLEY_MAX_REPS) return null
  return reps === 1 ? weight : weight * (1 + reps / 30)
}
