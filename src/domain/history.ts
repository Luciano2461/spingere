import { fmtNumber } from './format'
import { removeSet } from './session'
import { countsForStats, epley1RM, totalVolume } from './stats'
import type { Session, SessionEntry, SetLog } from './types'

/** Giorno locale "YYYY-MM-DD" di un istante ISO: una sessione a cavallo della mezzanotte cade nel giorno in cui è iniziata. */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const byStart = (a: Session, b: Session) => a.startedAt.localeCompare(b.startedAt)

/** Sessioni concluse raggruppate per giorno locale; dentro il giorno in ordine cronologico. */
export function groupByDay(sessions: Session[]): Map<string, Session[]> {
  const out = new Map<string, Session[]>()
  for (const s of [...sessions].filter((x) => x.status === 'done').sort(byStart)) {
    const k = dayKey(s.startedAt)
    out.set(k, [...(out.get(k) ?? []), s])
  }
  return out
}

export interface GridCell {
  key: string
  day: number
  inMonth: boolean
}

/** Celle del mese (month 0-11) con settimane da lunedì, complete di giorni dei mesi adiacenti. */
export function monthGrid(year: number, month: number): GridCell[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // lunedì = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const total = Math.ceil((offset + daysInMonth) / 7) * 7
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(year, month, 1 - offset + i)
    return { key: dayKey(d.toISOString()), day: d.getDate(), inMonth: d.getMonth() === month }
  })
}

export function sessionDuration(s: Session): number | null {
  if (!s.endedAt) return null
  const sec = (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000
  return sec >= 0 ? sec : null
}

export const sessionSetCount = (s: Session) => s.entries.reduce((n, e) => n + e.sets.length, 0)

export interface MonthSummary {
  workouts: number
  trainingDays: number
  seconds: number
  volume: number
}

export function monthSummary(sessions: Session[], year: number, month: number): MonthSummary {
  const inMonth = sessions.filter((s) => {
    if (s.status !== 'done') return false
    const d = new Date(s.startedAt)
    return d.getFullYear() === year && d.getMonth() === month
  })
  return {
    workouts: inMonth.length,
    trainingDays: new Set(inMonth.map((s) => dayKey(s.startedAt))).size,
    seconds: inMonth.reduce((n, s) => n + (sessionDuration(s) ?? 0), 0),
    volume: inMonth.reduce((n, s) => n + s.entries.reduce((v, e) => v + totalVolume(e.sets), 0), 0),
  }
}

export interface ExerciseHistoryItem {
  session: Session
  entry: SessionEntry
}

/** Sessioni concluse in cui compare l'esercizio (per ID stabile), dalla più recente. */
export function exerciseHistory(sessions: Session[], exerciseId: string): ExerciseHistoryItem[] {
  return [...sessions]
    .filter((s) => s.status === 'done')
    .sort((a, b) => byStart(b, a))
    .flatMap((session) => session.entries.filter((e) => e.exerciseId === exerciseId && e.sets.length).map((entry) => ({ session, entry })))
}

/** Sessioni precedenti a `session`, da usare come storico per ricalcolarne i record. */
export function historyBefore(sessions: Session[], session: Session): Session[] {
  return sessions.filter((s) => s.status === 'done' && s.id !== session.id && s.startedAt < session.startedAt)
}

/** Nuova serie in una sessione conclusa: copia l'ultima e nasce già completata. */
export function addDoneSet(s: Session, entryIndex: number): Session {
  const entry = s.entries[entryIndex]
  if (!entry) return s
  const base = [...entry.sets].reverse().find((x) => x.kind !== 'warmup') ?? entry.sets[entry.sets.length - 1]
  const { doneAt: _d, ...rest } = base ?? { kind: 'normal' as const, done: true }
  const sets = [...entry.sets, { ...rest, done: true, doneAt: s.endedAt ?? s.startedAt }]
  return { ...s, entries: s.entries.map((e, i) => (i === entryIndex ? { ...e, sets } : e)) }
}

/** Toglie una serie; se l'esercizio resta senza serie viene tolto anche lui (e i gruppi rimasti vuoti). */
export function removeDoneSet(s: Session, entryIndex: number, setIndex: number): Session {
  const next = removeSet(s, entryIndex, setIndex)
  const entries = next.entries.filter((e) => e.sets.length > 0)
  const used = new Set(entries.map((e) => e.groupId).filter(Boolean))
  return { ...next, entries, groups: next.groups.filter((g) => used.has(g.id)) }
}

/** ISO → valore per <input type="datetime-local"> in ora locale. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Valore di <input type="datetime-local"> → ISO 8601, o null se non valido. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Errore da mostrare se le date di una sessione non sono coerenti, altrimenti null. */
export function validateTimes(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt) return 'Inserisci la data e l\'ora di inizio.'
  if (!endedAt) return 'Inserisci la data e l\'ora di fine.'
  if (endedAt < startedAt) return 'La fine non può essere prima dell\'inizio.'
  return null
}

export interface Best {
  label: string
  value: string
  startedAt: string
}

/** Migliori valori di un esercizio nello storico (solo serie completate e non di riscaldamento). */
export function exerciseBests(items: ExerciseHistoryItem[]): Best[] {
  const top = (label: string, pick: (s: SetLog) => number | null, fmt: (n: number) => string): Best | null => {
    let best: { v: number; at: string } | null = null
    for (const { session, entry } of items) {
      for (const set of entry.sets) {
        if (!countsForStats(set)) continue
        const v = pick(set)
        if (v !== null && v > 0 && (!best || v > best.v)) best = { v, at: session.startedAt }
      }
    }
    return best ? { label, value: fmt(best.v), startedAt: best.at } : null
  }
  const kg = (n: number) => `${fmtNumber(n)} kg`
  const type = items[0]?.entry.type
  const list: (Best | null)[] = []
  if (type === 'weight_reps' || type === 'weighted_bodyweight') {
    list.push(
      top('Carico massimo', (s) => (s.reps ? (s.weight ?? null) : null), kg),
      top('Massimale stimato', (s) => (s.weight && s.reps ? epley1RM(s.weight, s.reps) : null), kg),
      top('Volume di una serie', (s) => (s.weight && s.reps ? s.weight * s.reps : null), kg),
    )
  } else if (type === 'bodyweight') {
    list.push(top('Ripetizioni massime', (s) => s.reps ?? null, (n) => `${n}`))
  } else if (type === 'timed') {
    list.push(top('Tempo massimo', (s) => s.seconds ?? null, (n) => `${n} s`))
  } else if (type === 'cardio') {
    list.push(top('Distanza massima', (s) => s.distance ?? null, (n) => `${fmtNumber(n)} km`), top('Durata massima', (s) => s.seconds ?? null, (n) => `${fmtNumber(n / 60)} min`))
  }
  return list.filter((b): b is Best => b !== null)
}
