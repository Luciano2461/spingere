import { fmtNumber } from './format'
import { historyBefore, type ExerciseHistoryItem } from './history'
import type { RecordKind } from './records'
import { sessionRecords } from './session'
import { countsForStats, epley1RM, totalVolume } from './stats'
import type { ExerciseType, Session } from './types'

// ---------- Periodi ----------

export type Period = '4w' | '3m' | '1y' | 'all'
export const PERIOD_LABELS: Record<Period, string> = { '4w': '4 sett.', '3m': '3 mesi', '1y': '1 anno', all: 'Tutto' }

/** Inizio del periodo (ora locale, mezzanotte), o null per «tutto». */
export function periodStart(period: Period, now = new Date()): Date | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (period) {
    case '4w': return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27)
    case '3m': return new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
    case '1y': return new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
    case 'all': return null
  }
}

export function sessionsSince(sessions: Session[], from: Date | null): Session[] {
  return sessions.filter((s) => s.status === 'done' && (!from || new Date(s.startedAt) >= from))
}

const PERIOD_LEAD: Record<Period, string> = { '4w': 'Nelle ultime 4 settimane', '3m': 'Negli ultimi 3 mesi', '1y': 'Nell\'ultimo anno', all: 'In totale' }

/** Frase in italiano che riassume il periodo, es. «Negli ultimi 3 mesi hai fatto 12 allenamenti e 140 serie.» */
export function summarySentence(period: Period, workouts: number, sets: number): string {
  if (workouts === 0) return `${PERIOD_LEAD[period]} non hai ancora fatto allenamenti.`
  const w = workouts === 1 ? '1 allenamento' : `${workouts} allenamenti`
  const s = sets === 1 ? '1 serie' : `${sets} serie`
  return `${PERIOD_LEAD[period]} hai fatto ${w} e ${s}.`
}

/** Frequenza leggibile: sotto 1 a settimana non si mostrano decimali poco chiari come «0,2». */
export function fmtPerWeek(perWeek: number): string {
  if (perWeek <= 0) return '0'
  if (perWeek < 1) return 'meno di 1'
  return fmtNumber(Math.round(perWeek * 10) / 10)
}

export interface PeriodSummary {
  workouts: number
  sets: number
  volume: number
}

export function periodSummary(sessions: Session[]): PeriodSummary {
  return {
    workouts: sessions.length,
    sets: sessions.reduce((n, s) => n + s.entries.reduce((k, e) => k + e.sets.filter(countsForStats).length, 0), 0),
    volume: sessions.reduce((n, s) => n + s.entries.reduce((v, e) => v + totalVolume(e.sets), 0), 0),
  }
}

// ---------- Volume per gruppo muscolare ----------

export type BucketUnit = 'week' | 'month'

/** Intervallo [from, to) della settimana (da lunedì) o del mese che contiene `now`, spostato di `offset` unità. */
export function bucketRange(unit: BucketUnit, now = new Date(), offset = 0): { from: Date; to: Date } {
  if (unit === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth() + offset, 1), to: new Date(now.getFullYear(), now.getMonth() + offset + 1, 1) }
  }
  const monday = now.getDate() - ((now.getDay() + 6) % 7)
  return { from: new Date(now.getFullYear(), now.getMonth(), monday + 7 * offset), to: new Date(now.getFullYear(), now.getMonth(), monday + 7 * offset + 7) }
}

export interface MuscleInfo {
  primary: string[]
  secondary: string[]
}

export interface MuscleTotal {
  muscle: string
  sets: number
}

/**
 * Serie di lavoro per muscolo nell'intervallo: i muscoli principali contano per intero, i secondari a metà.
 * Si contano le serie (non i kg) così muscoli grandi e piccoli, o esercizi a corpo libero, restano confrontabili.
 * Gli esercizi senza informazioni sui muscoli (es. personalizzati) sono contati in `unknownSets`.
 */
export function muscleSets(sessions: Session[], muscles: Map<string, MuscleInfo>, from: Date, to: Date): { totals: MuscleTotal[]; unknownSets: number } {
  const acc = new Map<string, number>()
  let unknownSets = 0
  for (const s of sessions) {
    const t = new Date(s.startedAt)
    if (s.status !== 'done' || t < from || t >= to) continue
    for (const e of s.entries) {
      const n = e.sets.filter(countsForStats).length
      if (!n) continue
      const info = muscles.get(e.exerciseId)
      if (!info || (info.primary.length === 0 && info.secondary.length === 0)) {
        unknownSets += n
        continue
      }
      for (const m of info.primary) acc.set(m, (acc.get(m) ?? 0) + n)
      for (const m of info.secondary) acc.set(m, (acc.get(m) ?? 0) + n / 2)
    }
  }
  const totals = [...acc.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle))
  return { totals, unknownSets }
}

// ---------- Progressione per esercizio ----------

export type Metric = 'weight' | 'volume' | 'e1rm' | 'reps' | 'seconds' | 'distance'

export const METRIC_LABELS: Record<Metric, string> = {
  weight: 'Carico massimo',
  volume: 'Volume',
  e1rm: 'Massimale stimato',
  reps: 'Ripetizioni massime',
  seconds: 'Tempo massimo',
  distance: 'Distanza',
}

export function metricsFor(type: ExerciseType): Metric[] {
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight': return ['weight', 'volume', 'e1rm']
    case 'bodyweight': return ['reps']
    case 'timed': return ['seconds']
    case 'cardio': return ['distance', 'seconds']
  }
}

export function metricUnit(metric: Metric): string {
  return { weight: 'kg', volume: 'kg', e1rm: 'kg', reps: 'rip.', seconds: 's', distance: 'km' }[metric]
}

export interface SeriesPoint {
  startedAt: string
  value: number
}

export interface Series {
  points: SeriesPoint[]
  /** Solo per il massimale stimato: serie con più di 10 ripetizioni, escluse perché non affidabili. */
  excludedSets: number
}

/** Un punto per sessione (in ordine cronologico). Conta solo serie completate e non di riscaldamento. */
export function exerciseSeries(items: ExerciseHistoryItem[], metric: Metric): Series {
  const points: SeriesPoint[] = []
  let excludedSets = 0
  for (const { session, entry } of [...items].reverse()) {
    const sets = entry.sets.filter(countsForStats)
    let value: number | null = null
    const best = (xs: (number | null | undefined)[]) => {
      const ok = xs.filter((x): x is number => typeof x === 'number' && x > 0)
      return ok.length ? Math.max(...ok) : null
    }
    switch (metric) {
      case 'weight': value = best(sets.filter((s) => s.reps).map((s) => s.weight)); break
      case 'volume': {
        const v = totalVolume(sets)
        value = v > 0 ? v : null
        break
      }
      case 'e1rm':
        for (const s of sets) if (s.weight && s.reps && epley1RM(s.weight, s.reps) === null && s.weight > 0) excludedSets++
        value = best(sets.map((s) => (s.weight && s.reps ? epley1RM(s.weight, s.reps) : null)))
        break
      case 'reps': value = best(sets.map((s) => s.reps)); break
      case 'seconds': value = best(sets.map((s) => s.seconds)); break
      case 'distance': value = best(sets.map((s) => s.distance)); break
    }
    if (value !== null) points.push({ startedAt: session.startedAt, value })
  }
  return { points, excludedSets }
}

// ---------- Elenchi ----------

export interface ExerciseSummary {
  exerciseId: string
  name: string
  sessions: number
  lastAt: string
}

/** Esercizi presenti nello storico, dal più recente. Il nome è quello dell'ultima sessione. */
export function exerciseList(sessions: Session[]): ExerciseSummary[] {
  const map = new Map<string, ExerciseSummary>()
  for (const s of [...sessions].filter((x) => x.status === 'done').sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    for (const e of s.entries) {
      if (!e.sets.length) continue
      const cur = map.get(e.exerciseId)
      if (cur) cur.sessions++
      else map.set(e.exerciseId, { exerciseId: e.exerciseId, name: e.nameSnapshot, sessions: 1, lastAt: s.startedAt })
    }
  }
  return [...map.values()]
}

export interface RecentRecord {
  session: Session
  name: string
  kinds: RecordKind[]
}

/** Ultime serie con record, dalla sessione più recente (record calcolati rispetto alle sole sessioni precedenti). */
export function recentRecords(sessions: Session[], limit = 8): RecentRecord[] {
  const done = sessions.filter((s) => s.status === 'done')
  const out: RecentRecord[] = []
  for (const session of [...done].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    const perExercise = new Map<string, RecentRecord>()
    for (const r of sessionRecords(session, historyBefore(done, session))) {
      const cur = perExercise.get(r.name)
      if (cur) cur.kinds = [...new Set([...cur.kinds, ...r.kinds])]
      else perExercise.set(r.name, { session, name: r.name, kinds: [...r.kinds] })
    }
    out.push(...perExercise.values())
    if (out.length >= limit) break
  }
  return out.slice(0, limit)
}
