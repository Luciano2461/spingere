import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { SpingereDB } from './db'
import { discardSession, doneSessions, getActiveSession, saveSession, startSession } from './sessions'
import { finishSession, newFreeSession, toggleDone } from '../domain/session'
import type { Session } from '../domain/types'

describe('sessioni', () => {
  it('ammette una sola sessione in corso', async () => {
    const db = new SpingereDB('ses-1')
    await db.open()
    await startSession(db, newFreeSession())
    await expect(startSession(db, newFreeSession())).rejects.toThrow(/già un allenamento/)
    db.close()
  })

  it('salva a ogni modifica e sopravvive a una riapertura', async () => {
    const db = new SpingereDB('ses-2')
    await db.open()
    let s: Session = { ...newFreeSession(), entries: [{ exerciseId: 'a', nameSnapshot: 'A', type: 'weight_reps' as const, sets: [{ kind: 'normal' as const, done: false, weight: 50, reps: 10 }] }] }
    await startSession(db, s)
    s = toggleDone(s, 0, 0)
    await saveSession(db, s)
    db.close()

    const again = new SpingereDB('ses-2')
    await again.open()
    const active = await getActiveSession(again)
    expect(active?.entries[0].sets[0].done).toBe(true)
    again.close()
  })

  it('conclusa passa nello storico, scartata sparisce', async () => {
    const db = new SpingereDB('ses-3')
    await db.open()
    const s = { ...newFreeSession(), entries: [{ exerciseId: 'a', nameSnapshot: 'A', type: 'weight_reps' as const, sets: [{ kind: 'normal' as const, done: true, weight: 50, reps: 10 }] }] }
    await startSession(db, s)
    await saveSession(db, finishSession(s))
    expect(await getActiveSession(db)).toBeUndefined()
    expect(await doneSessions(db)).toHaveLength(1)
    const t = newFreeSession()
    await startSession(db, t)
    await discardSession(db, t.id)
    expect(await getActiveSession(db)).toBeUndefined()
    db.close()
  })
})
