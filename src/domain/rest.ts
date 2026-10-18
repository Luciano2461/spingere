import type { RestTimer, Session } from './types'

/** Secondi di recupero da far partire dopo aver completato la serie (0 = nessun timer). */
export function restSecondsFor(session: Session, entryIndex: number, setIndex: number, defaultRest: number): number {
  const entry = session.entries[entryIndex]
  const set = entry?.sets[setIndex]
  if (!entry || !set) return 0
  if (set.kind === 'warmup' || entry.type === 'cardio') return 0
  if (entry.sets[setIndex + 1]?.kind === 'drop') return 0 // il drop set si fa subito, senza recupero
  if (entry.groupId) {
    // superserie/circuito: si passa all'esercizio successivo senza pausa, il recupero scatta dopo l'ultimo del gruppo
    const members = session.entries.flatMap((e, i) => (e.groupId === entry.groupId ? [i] : []))
    if (entryIndex !== Math.max(...members)) return 0
    return session.groups.find((g) => g.id === entry.groupId)?.restAfterGroup ?? defaultRest
  }
  return entry.restSeconds ?? defaultRest
}

export function startRest(durationSeconds: number, now = Date.now()): RestTimer {
  return { endsAt: new Date(now + durationSeconds * 1000).toISOString(), durationSeconds }
}

/** Secondi rimanenti, calcolati sull'orario di fine (mai con un contatore). */
export function remainingSeconds(rest: RestTimer, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(rest.endsAt).getTime() - now) / 1000))
}

export const isRestOver = (rest: RestTimer, now = Date.now()) => new Date(rest.endsAt).getTime() <= now

/** Aggiunge o toglie secondi (es. ±15). Il recupero non può scendere sotto la fine immediata. */
export function adjustRest(rest: RestTimer, deltaSeconds: number, now = Date.now()): RestTimer {
  const end = Math.max(now, new Date(rest.endsAt).getTime() + deltaSeconds * 1000)
  return { endsAt: new Date(end).toISOString(), durationSeconds: Math.max(1, rest.durationSeconds + deltaSeconds) }
}

/** Un recupero finito da molto non va mostrato quando si riapre l'app. */
export const isStaleRest = (rest: RestTimer, now = Date.now(), graceMs = 5 * 60_000) => now - new Date(rest.endsAt).getTime() > graceMs

export interface SetRef {
  entryIndex: number
  setIndex: number
}

/** Ordine di esecuzione: esercizi in sequenza; nei gruppi si alternano i membri giro per giro (A1 B1 A2 B2…). */
export function executionOrder(session: Session): SetRef[] {
  const out: SetRef[] = []
  let i = 0
  while (i < session.entries.length) {
    const gid = session.entries[i].groupId
    let end = i + 1
    if (gid) while (end < session.entries.length && session.entries[end].groupId === gid) end++
    if (!gid) {
      session.entries[i].sets.forEach((_, setIndex) => out.push({ entryIndex: i, setIndex }))
    } else {
      const rounds = Math.max(...session.entries.slice(i, end).map((e) => e.sets.length))
      for (let r = 0; r < rounds; r++) for (let k = i; k < end; k++) if (r < session.entries[k].sets.length) out.push({ entryIndex: k, setIndex: r })
    }
    i = end
  }
  return out
}

/** Prossima serie da fare dopo `after` (o la prima da fare se non è indicata). */
export function nextUndone(session: Session, after?: SetRef): SetRef | null {
  const order = executionOrder(session)
  const start = after ? order.findIndex((r) => r.entryIndex === after.entryIndex && r.setIndex === after.setIndex) + 1 : 0
  const pick = (list: SetRef[]) => list.find((r) => !session.entries[r.entryIndex].sets[r.setIndex].done) ?? null
  return pick(order.slice(start)) ?? pick(order)
}
