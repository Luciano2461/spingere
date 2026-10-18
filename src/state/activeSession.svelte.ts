import { db } from '../db/db'
import { getActiveSession, saveSession } from '../db/sessions'
import { isStaleRest } from '../domain/rest'
import type { Session } from '../domain/types'

/**
 * L'allenamento in corso, condiviso da tutte le schermate (sessione, barra del recupero, wake lock).
 * Unica sorgente di verità: ogni modifica passa da `commitSession` e viene salvata subito nel database.
 */
export const active = $state<{ session: Session | null; loaded: boolean }>({ session: null, loaded: false })

export async function loadActive(): Promise<void> {
  let s = (await getActiveSession(db)) ?? null
  if (s?.rest && isStaleRest(s.rest)) {
    const { rest: _stale, ...clean } = s
    s = clean
    await saveSession(db, s)
  }
  active.session = s
  active.loaded = true
}

/** Ultimo salvataggio non riuscito (spazio pieno, database chiuso da iOS…): la sessione si mostra lo stesso e si riprova al tocco successivo. */
export const saveState = $state<{ failed: boolean }>({ failed: false })

export async function commitSession(next: Session): Promise<void> {
  active.session = next
  try {
    await saveSession(db, $state.snapshot(next))
    saveState.failed = false
  } catch (e) {
    saveState.failed = true
    console.error('Salvataggio dell\'allenamento non riuscito', e)
  }
}

/** Riprova a salvare l'allenamento così com'è adesso. */
export const retrySave = () => (active.session ? commitSession(active.session) : Promise.resolve())

export function setActive(session: Session): void {
  active.session = session
  active.loaded = true
}

export function clearActive(): void {
  active.session = null
}
