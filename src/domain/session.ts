import { newPlanExercise } from './plan'
import { recordsFor, type RecordKind } from './records'
import { restSecondsFor, startRest, upNext } from './rest'
import { totalVolume } from './stats'
import type { Exercise, ExerciseType, Plan, PlanDay, PlanExercise, Session, SessionEntry, SetKind, SetLog } from './types'

const uuid = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export interface LastTime {
  entry: SessionEntry
  startedAt: string
}

/** Ultima volta che l'esercizio è stato fatto (sessioni concluse, con almeno una serie completata). */
export function lastTime(history: Session[], exerciseId: string): LastTime | null {
  const sorted = [...history].filter((s) => s.status === 'done').sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const s of sorted) {
    const entry = s.entries.find((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.done))
    if (entry) return { entry, startedAt: s.startedAt }
  }
  return null
}

/** Tutte le serie completate dell'esercizio nello storico (per i record). */
export function historySets(history: Session[], exerciseId: string): SetLog[] {
  return history
    .filter((s) => s.status === 'done')
    .flatMap((s) => s.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets))
}

function blankSet(type: ExerciseType, v: Partial<SetLog>): SetLog {
  const set: SetLog = { kind: 'normal', done: false }
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight':
      if (v.weight !== undefined) set.weight = v.weight
      if (v.reps !== undefined) set.reps = v.reps
      break
    case 'bodyweight':
      if (v.reps !== undefined) set.reps = v.reps
      break
    case 'timed':
      if (v.seconds !== undefined) set.seconds = v.seconds
      break
    case 'cardio':
      if (v.seconds !== undefined) set.seconds = v.seconds
      if (v.distance !== undefined) set.distance = v.distance
      break
  }
  return set
}

/** Serie iniziali: i valori dell'ultima volta (serie per serie, solo serie normali e a cedimento: riscaldamento e drop hanno carichi diversi), altrimenti gli obiettivi della scheda. */
export function prefillSets(type: ExerciseType, target: Pick<PlanExercise, 'targetSets' | 'targetReps' | 'targetSeconds' | 'targetWeight'>, last: SessionEntry | null): SetLog[] {
  const work = (last?.sets ?? []).filter((s) => s.done && (s.kind === 'normal' || s.kind === 'failure'))
  const fallback: Partial<SetLog> = { weight: target.targetWeight, reps: target.targetReps, seconds: target.targetSeconds }
  return Array.from({ length: Math.max(1, target.targetSets) }, (_, i) => {
    const src = work[i] ?? work[work.length - 1]
    return blankSet(type, src ? { ...fallback, ...stripUndefined(src) } : fallback)
  })
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

export function newFreeSession(): Session {
  return { id: uuid(), startedAt: nowIso(), status: 'active', entries: [], groups: [], notes: '' }
}

/** Avvia una sessione da un giorno della scheda. Lo storico riceve una copia: nessun riferimento alla scheda. */
export function newSessionFromDay(plan: Plan, day: PlanDay, history: Session[], types: Map<string, ExerciseType>): Session {
  return {
    id: uuid(),
    planName: plan.name,
    dayName: day.name,
    startedAt: nowIso(),
    status: 'active',
    notes: '',
    groups: structuredClone(day.groups),
    entries: day.exercises.map((pe) => {
      const type = types.get(pe.exerciseId) ?? 'weight_reps'
      return {
        exerciseId: pe.exerciseId,
        nameSnapshot: pe.nameSnapshot,
        type,
        ...(pe.groupId ? { groupId: pe.groupId } : {}),
        restSeconds: pe.restSeconds,
        sets: prefillSets(type, pe, lastTime(history, pe.exerciseId)?.entry ?? null),
      }
    }),
  }
}

/** Aggiunge un esercizio (fuori scheda) alla sessione. */
export function addEntry(session: Session, exercise: Exercise, history: Session[], defaultRest = 90): Session {
  const target = newPlanExercise(exercise, defaultRest)
  const entry: SessionEntry = {
    exerciseId: exercise.id,
    nameSnapshot: exercise.name,
    type: exercise.type,
    restSeconds: target.restSeconds,
    sets: prefillSets(exercise.type, target, lastTime(history, exercise.id)?.entry ?? null),
  }
  return { ...session, entries: [...session.entries, entry] }
}

export function removeEntry(session: Session, index: number): Session {
  const entries = session.entries.filter((_, i) => i !== index)
  const used = new Set(entries.map((e) => e.groupId).filter(Boolean))
  return { ...session, entries, groups: session.groups.filter((g) => used.has(g.id)) }
}

const replaceEntry = (s: Session, i: number, fn: (e: SessionEntry) => SessionEntry): Session => ({
  ...s,
  entries: s.entries.map((e, k) => (k === i ? fn(e) : e)),
})

export function updateSet(s: Session, entryIndex: number, setIndex: number, patch: Partial<SetLog>): Session {
  return replaceEntry(s, entryIndex, (e) => ({ ...e, sets: e.sets.map((x, k) => (k === setIndex ? { ...x, ...patch } : x)) }))
}

const PROPAGATED_FIELDS = ['weight', 'reps', 'seconds', 'distance'] as const

/**
 * Modifica una serie e, per i campi numerici, la «passa» alle serie successive dello stesso esercizio che la stavano seguendo:
 * non ancora completate, non di riscaldamento e con lo stesso valore che la serie modificata aveva prima.
 * Le serie che l'utente aveva già cambiato a mano (valore diverso) non vengono toccate.
 */
export function updateSetAndFollowers(s: Session, entryIndex: number, setIndex: number, patch: Partial<SetLog>): Session {
  const before = s.entries[entryIndex]?.sets[setIndex]
  if (!before) return s
  let next = updateSet(s, entryIndex, setIndex, patch)
  if (before.kind === 'warmup' || before.done) return next
  const sets = next.entries[entryIndex].sets.map((x, k) => {
    if (k <= setIndex || x.done || x.kind === 'warmup') return x
    const changes: Partial<SetLog> = {}
    for (const f of PROPAGATED_FIELDS) {
      const to = patch[f]
      if (f in patch && to !== undefined && x[f] === before[f]) changes[f] = to
    }
    return Object.keys(changes).length ? { ...x, ...changes } : x
  })
  next = { ...next, entries: next.entries.map((e, i) => (i === entryIndex ? { ...e, sets } : e)) }
  return next
}

/** Serie corrente: la prossima non completata dopo l'ultima fatta (nelle superserie si alterna A1 B1 A2 B2), come «Prossimo» nella barra del recupero. */
export function currentSet(s: Session): { entryIndex: number; setIndex: number } | null {
  return upNext(s)
}

/** Segna la serie come completata/da fare. */
export function toggleDone(s: Session, entryIndex: number, setIndex: number): Session {
  const cur = s.entries[entryIndex]?.sets[setIndex]
  if (!cur) return s
  return updateSet(s, entryIndex, setIndex, cur.done ? { done: false, doneAt: undefined } : { done: true, doneAt: nowIso() })
}

/** Completa (o annulla) una serie; completandola fa partire il recupero previsto per quell'esercizio. */
export function completeSet(s: Session, entryIndex: number, setIndex: number, defaultRest: number, now = Date.now()): Session {
  const wasDone = s.entries[entryIndex]?.sets[setIndex]?.done
  const next = toggleDone(s, entryIndex, setIndex)
  if (wasDone) return next
  const seconds = restSecondsFor(next, entryIndex, setIndex, defaultRest)
  return seconds > 0 ? { ...next, rest: startRest(seconds, now) } : next
}

/** Nuova serie: copia i valori dell'ultima serie (non di riscaldamento). */
export function addSet(s: Session, entryIndex: number): Session {
  return replaceEntry(s, entryIndex, (e) => {
    const base = [...e.sets].reverse().find((x) => x.kind !== 'warmup') ?? e.sets[e.sets.length - 1]
    return { ...e, sets: [...e.sets, blankSet(e.type, base ?? {})] }
  })
}

export function removeSet(s: Session, entryIndex: number, setIndex: number): Session {
  return replaceEntry(s, entryIndex, (e) => ({ ...e, sets: e.sets.filter((_, k) => k !== setIndex) }))
}

const KIND_ORDER: SetKind[] = ['normal', 'warmup', 'drop', 'failure']
export const nextKind = (k: SetKind): SetKind => KIND_ORDER[(KIND_ORDER.indexOf(k) + 1) % KIND_ORDER.length]
export const KIND_LABELS: Record<SetKind, string> = { normal: 'Normale', warmup: 'Riscaldamento', drop: 'Drop set', failure: 'Cedimento' }

export function sessionHasDoneSets(s: Session): boolean {
  return s.entries.some((e) => e.sets.some((x) => x.done))
}

export function countUndone(s: Session): number {
  return s.entries.reduce((n, e) => n + e.sets.filter((x) => !x.done).length, 0)
}

/** Conclude la sessione registrando solo ciò che è stato completato (serie e esercizi non fatti vengono tolti). */
export function finishSession(s: Session, endedAt = nowIso()): Session {
  const entries = s.entries.map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) })).filter((e) => e.sets.length > 0)
  const used = new Set(entries.map((e) => e.groupId).filter(Boolean))
  const { rest: _rest, ...withoutRest } = s
  return { ...withoutRest, entries, groups: s.groups.filter((g) => used.has(g.id)), status: 'done', endedAt, updatedAt: endedAt }
}

export interface SetRecord {
  entryIndex: number
  setIndex: number
  name: string
  kinds: RecordKind[]
}

/** Record battuti in ogni serie della sessione, nell'ordine in cui sono state fatte (storico + serie precedenti della sessione). */
export function sessionRecords(session: Session, history: Session[]): SetRecord[] {
  const out: SetRecord[] = []
  const seen = new Map<string, SetLog[]>() // serie già valutate in questa sessione, per esercizio
  session.entries.forEach((entry, entryIndex) => {
    const earlier = seen.get(entry.exerciseId) ?? []
    const base = historySets(history, entry.exerciseId)
    entry.sets.forEach((set, setIndex) => {
      const kinds = recordsFor(entry.type, [...base, ...earlier], set)
      if (kinds.length) out.push({ entryIndex, setIndex, name: entry.nameSnapshot, kinds })
      earlier.push(set)
    })
    seen.set(entry.exerciseId, earlier)
  })
  return out
}

export function sessionVolume(session: Session): number {
  return session.entries.reduce((sum, e) => sum + totalVolume(e.sets), 0)
}
