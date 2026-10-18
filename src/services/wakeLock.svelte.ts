// Tiene lo schermo acceso durante l'allenamento (Screen Wake Lock API).
// Il blocco viene rilasciato dal sistema quando l'app va in background: lo si richiede di nuovo al ritorno.
// Su iOS: supportato da Safari 16.4; nelle app installate sulla Home è inaffidabile nelle versioni precedenti alla 18.4.

// failed: la richiesta è stata rifiutata (es. app installata su iOS prima della 18.4): lo schermo può spegnersi, va detto all'utente.
export const wakeLockState = $state({ supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator, active: false, failed: false })

let sentinel: WakeLockSentinel | null = null
let wanted = false
let acquiring = false

async function acquire() {
  if (!wanted || !wakeLockState.supported || document.visibilityState !== 'visible' || sentinel || acquiring) return
  acquiring = true
  try {
    const s = await navigator.wakeLock.request('screen')
    if (!wanted || sentinel) {
      // allenamento finito (o blocco già preso) mentre la richiesta era in corso
      s.release().catch(() => {})
      return
    }
    sentinel = s
    wakeLockState.active = true
    wakeLockState.failed = false
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null
      wakeLockState.active = false
    })
  } catch {
    wakeLockState.active = false
    wakeLockState.failed = true
  } finally {
    acquiring = false
  }
}

export function enableWakeLock() {
  wanted = true
  void acquire()
}

export function disableWakeLock() {
  wanted = false
  const s = sentinel
  sentinel = null
  wakeLockState.active = false
  wakeLockState.failed = false
  s?.release().catch(() => {})
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire()
  })
}
