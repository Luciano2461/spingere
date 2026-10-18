import type { SpingereDB } from './db'
import type { Session } from '../domain/types'

export const getActiveSession = (db: SpingereDB) => db.sessions.where('status').equals('active').first()

/** Una sola sessione può essere in corso alla volta. */
export async function startSession(db: SpingereDB, session: Session): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    if (await getActiveSession(db)) throw new Error('C\'è già un allenamento in corso')
    await db.sessions.add(session)
  })
}

export const saveSession = (db: SpingereDB, session: Session) => db.sessions.put(session)

export const discardSession = (db: SpingereDB, id: string) => db.sessions.delete(id)

export const doneSessions = (db: SpingereDB) => db.sessions.where('status').equals('done').toArray()
