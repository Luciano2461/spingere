// «Chiudi» dei banner ricordato per qualche giorno. Stato solo di interfaccia, per dispositivo: non fa parte dei dati né del backup.

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const PREFIX = 'spingere.dismissed.'
const DAY_MS = 86_400_000

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null // modalità privata o dati del sito bloccati
  }
}

export function isDismissed(key: string, now = Date.now(), store: KeyValueStore | null = defaultStore()): boolean {
  try {
    const until = Number(store?.getItem(PREFIX + key))
    return Number.isFinite(until) && until > now
  } catch {
    return false
  }
}

export function dismiss(key: string, days: number, now = Date.now(), store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(PREFIX + key, String(now + days * DAY_MS))
  } catch {
    // senza storage il banner tornerà alla prossima apertura: accettabile
  }
}
