import type { ExerciseType, SetLog } from './types'

/** 77.5 → "77,5" (formato italiano, senza zeri inutili). */
export function fmtNumber(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

/** 3725 → "1:02:05", 125 → "2:05". */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** "80×8", "12 rip." , "45 s", "10 min · 2,5 km" a seconda del tipo. */
export function fmtSet(type: ExerciseType, set: SetLog): string {
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight':
      return `${set.weight !== undefined ? fmtNumber(set.weight) : '–'}×${set.reps ?? '–'}`
    case 'bodyweight':
      return `${set.reps ?? '–'} rip.`
    case 'timed':
      return `${set.seconds ?? '–'} s`
    case 'cardio':
      return [set.seconds !== undefined ? `${fmtNumber(set.seconds / 60)} min` : '', set.distance !== undefined ? `${fmtNumber(set.distance)} km` : '']
        .filter(Boolean)
        .join(' · ') || '–'
  }
}

/** Serie consecutive uguali accorpate: "3 × 8 a 50 kg · 1 × 6 a 50 kg" invece di «50×8 · 50×8 · 50×8 · 50×6». */
export function fmtSetsGrouped(type: ExerciseType, sets: SetLog[]): string {
  const parts: { text: string; set: SetLog; n: number }[] = []
  for (const set of sets) {
    const text = fmtSet(type, set)
    const prev = parts[parts.length - 1]
    if (prev && prev.text === text) prev.n++
    else parts.push({ text, set, n: 1 })
  }
  const weighted = type === 'weight_reps' || type === 'weighted_bodyweight'
  return parts
    .map(({ text, set, n }) => {
      if (weighted && set.weight !== undefined && set.reps !== undefined) return `${n} × ${set.reps} a ${fmtNumber(set.weight)} kg`
      return n > 1 ? `${n} × ${text}` : text
    })
    .join(' · ')
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
