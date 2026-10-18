import type { Exercise, GroupKind, Plan, PlanDay, PlanExercise, Session } from './types'

// Funzioni pure (immutabili) per modificare schede e giorni. L'ordine dell'array `exercises` è l'ordine di esecuzione;
// gli esercizi di uno stesso gruppo (superserie/circuito) sono sempre contigui.

const uuid = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export function newPlan(name: string): Plan {
  const t = nowIso()
  return { id: uuid(), name: name.trim() || 'Nuova scheda', notes: '', days: [], createdAt: t, updatedAt: t }
}

export function newDay(name: string): PlanDay {
  return { id: uuid(), name: name.trim() || 'Allenamento', groups: [], exercises: [] }
}

/** Valori iniziali sensati in base al tipo di esercizio. */
export function newPlanExercise(exercise: Exercise, restSeconds: number): PlanExercise {
  const base = { exerciseId: exercise.id, nameSnapshot: exercise.name, restSeconds, notes: '' }
  switch (exercise.type) {
    case 'timed':
      return { ...base, targetSets: 3, targetSeconds: 30 }
    case 'cardio':
      return { ...base, targetSets: 1, targetSeconds: 600, restSeconds: 0 }
    case 'weight_reps':
      return { ...base, targetSets: 3, targetReps: 10, targetWeight: 0 }
    default:
      return { ...base, targetSets: 3, targetReps: 10 }
  }
}

export function touch(plan: Plan): Plan {
  return { ...plan, updatedAt: nowIso() }
}

export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export function duplicatePlan(plan: Plan, name = `${plan.name} (copia)`): Plan {
  const t = nowIso()
  return {
    ...structuredClone(plan),
    id: uuid(),
    name,
    createdAt: t,
    updatedAt: t,
    days: plan.days.map((d) => {
      const groupIds = new Map(d.groups.map((g) => [g.id, uuid()]))
      return {
        ...structuredClone(d),
        id: uuid(),
        groups: d.groups.map((g) => ({ ...g, id: groupIds.get(g.id)! })),
        exercises: d.exercises.map((e) => ({ ...structuredClone(e), groupId: e.groupId ? groupIds.get(e.groupId) : undefined })),
      }
    }),
  }
}

// --- Blocchi: un esercizio singolo, oppure un gruppo di esercizi contigui ---

export interface Block {
  groupId?: string
  start: number
  length: number
}

/** Raggruppa in blocchi una lista di elementi con `groupId` (esercizi di una scheda o di una sessione). */
export function blocksOf(items: { groupId?: string }[]): Block[] {
  const out: Block[] = []
  items.forEach((e, i) => {
    const last = out[out.length - 1]
    if (e.groupId && last && last.groupId === e.groupId) last.length++
    else out.push({ groupId: e.groupId, start: i, length: 1 })
  })
  return out
}

export const blocks = (day: PlanDay): Block[] => blocksOf(day.exercises)

/** Rimuove i gruppi vuoti o con un solo esercizio e quelli non contigui (li spezza). */
export function normalize(day: PlanDay): PlanDay {
  const bl = blocks(day)
  const count = new Map<string, number>()
  for (const b of bl) if (b.groupId) count.set(b.groupId, (count.get(b.groupId) ?? 0) + 1)
  // un gruppo è valido solo se forma un unico blocco contiguo di almeno 2 esercizi
  const valid = new Set(bl.filter((b) => b.groupId && b.length >= 2 && count.get(b.groupId) === 1).map((b) => b.groupId))
  const exercises = day.exercises.map((e) => (e.groupId && !valid.has(e.groupId) ? { ...e, groupId: undefined } : e))
  const used = new Set(exercises.map((e) => e.groupId).filter(Boolean))
  return { ...day, exercises, groups: day.groups.filter((g) => used.has(g.id)) }
}

export function addExercise(day: PlanDay, pe: PlanExercise): PlanDay {
  return { ...day, exercises: [...day.exercises, pe] }
}

export function updateExercise(day: PlanDay, index: number, patch: Partial<PlanExercise>): PlanDay {
  return { ...day, exercises: day.exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)) }
}

export function removeExercise(day: PlanDay, index: number): PlanDay {
  return normalize({ ...day, exercises: day.exercises.filter((_, i) => i !== index) })
}

/** Sposta un blocco (esercizio singolo o intero gruppo) da una posizione all'altra della lista dei blocchi. */
export function moveBlock(day: PlanDay, from: number, to: number): PlanDay {
  const bl = blocks(day)
  if (from === to || from < 0 || to < 0 || from >= bl.length || to >= bl.length) return day
  const chunks = bl.map((b) => day.exercises.slice(b.start, b.start + b.length))
  return { ...day, exercises: arrayMove(chunks, from, to).flat() }
}

/** Scambia un esercizio con il vicino dentro lo stesso gruppo. */
export function moveInGroup(day: PlanDay, index: number, delta: -1 | 1): PlanDay {
  const other = index + delta
  const a = day.exercises[index]
  const b = day.exercises[other]
  if (!a || !b || !a.groupId || a.groupId !== b.groupId) return day
  return { ...day, exercises: arrayMove(day.exercises, index, other) }
}

export function isLinkedWithNext(day: PlanDay, index: number): boolean {
  const a = day.exercises[index]
  const b = day.exercises[index + 1]
  return !!a?.groupId && a.groupId === b?.groupId
}

/** Collega/scollega l'esercizio con il successivo (superserie). */
export function toggleLink(day: PlanDay, index: number, kind: GroupKind = 'superset', restAfterGroup = 90): PlanDay {
  const a = day.exercises[index]
  const b = day.exercises[index + 1]
  if (!a || !b) return day
  if (isLinkedWithNext(day, index)) {
    // spezza il gruppo tra index e index+1: la parte dopo diventa un nuovo gruppo (o si dissolve se resta un solo esercizio)
    const old = day.groups.find((g) => g.id === a.groupId)!
    const newId = uuid()
    const exercises = day.exercises.map((e, i) => (i > index && e.groupId === a.groupId ? { ...e, groupId: newId } : e))
    return normalize({ ...day, exercises, groups: [...day.groups, { ...old, id: newId }] })
  }
  let groups = day.groups
  let id = a.groupId ?? b.groupId
  if (!id) {
    id = uuid()
    groups = [...groups, { id, kind, restAfterGroup }]
  }
  const target = id
  const merged = day.exercises.map((e, i) => {
    const inA = a.groupId ? e.groupId === a.groupId : i === index
    const inB = b.groupId ? e.groupId === b.groupId : i === index + 1
    return inA || inB ? { ...e, groupId: target } : e
  })
  return normalize({ ...day, exercises: merged, groups })
}

export function updateGroup(day: PlanDay, groupId: string, patch: { kind?: GroupKind; restAfterGroup?: number }): PlanDay {
  return { ...day, groups: day.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) }
}

/** Ultima sessione conclusa di un giorno di scheda (collegamento per nomi: la sessione conserva solo una copia). */
export function lastDoneOf(plan: Plan, day: PlanDay, done: Session[]): Session | undefined {
  return done
    .filter((s) => s.status === 'done' && s.planName === plan.name && s.dayName === day.name)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

/**
 * Giorno da fare adesso: il primo mai fatto (nell'ordine della scheda), altrimenti quello fatto meno di recente.
 * Con meno di due giorni allenabili non c'è nulla da suggerire.
 */
export function suggestNextDay(plan: Plan, done: Session[]): string | null {
  const days = plan.days.filter((d) => d.exercises.length > 0)
  if (days.length < 2) return null
  let best: { id: string; at: string } | null = null
  for (const d of days) {
    const last = lastDoneOf(plan, d, done)
    if (!last) return d.id
    if (!best || last.startedAt < best.at) best = { id: d.id, at: last.startedAt }
  }
  return best?.id ?? null
}

/** Un allenamento «in corso» da più di `hours` ore è quasi certamente dimenticato (conta solo la durata: si può allenarsi a cavallo della mezzanotte). */
export function isForgotten(startedAt: string, now = new Date(), hours = 6): boolean {
  return now.getTime() - new Date(startedAt).getTime() > hours * 3600_000
}
