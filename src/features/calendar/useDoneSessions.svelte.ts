import { liveQuery } from 'dexie'
import { db } from '../../db/db'
import { doneSessions } from '../../db/sessions'
import type { Session } from '../../domain/types'

/** Sessioni concluse, sempre aggiornate; da chiamare durante l'inizializzazione di un componente. */
export function useDoneSessions(): { list: Session[]; loaded: boolean } {
  const state = $state<{ list: Session[]; loaded: boolean }>({ list: [], loaded: false })
  $effect(() => {
    const sub = liveQuery(() => doneSessions(db)).subscribe((v) => {
      state.list = v
      state.loaded = true
    })
    return () => sub.unsubscribe()
  })
  return state
}
