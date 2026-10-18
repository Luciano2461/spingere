// Audio a fine recupero. Su iOS l'audio si sblocca solo da un gesto dell'utente: il contesto viene creato/ripreso
// a ogni tocco mentre c'è un allenamento in corso (e al primo tocco su "Inizia allenamento").
// Attenzione: su iPhone il suono web è silenziato dall'interruttore "Silenzioso"; resta sempre il segnale visivo.

let ctx: AudioContext | null = null
let listening = false

function ensureContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    return ctx
  } catch {
    return null
  }
}

/** Da chiamare dentro un gesto dell'utente (tap). Idempotente. */
export function unlockAudio(): void {
  const c = ensureContext()
  if (!c) return
  if (c.state !== 'running') c.resume().catch(() => {})
  try {
    const src = c.createBufferSource()
    src.buffer = c.createBuffer(1, 1, 22050) // un campione di silenzio sblocca la riproduzione su iOS
    src.connect(c.destination)
    src.start(0)
  } catch {
    /* ignora */
  }
}

/** Mantiene l'audio sbloccato mentre c'è un allenamento in corso (iOS lo sospende quando l'app va in background). */
// iOS non accetta sempre lo sblocco su pointerdown: si prova anche a fine tocco e al click.
const GESTURES = ['pointerdown', 'touchend', 'click'] as const

// Al ritorno in primo piano si prova a riprendere il contesto (può non riuscire senza un tocco: allora riparte al primo tocco).
function onVisible() {
  if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
}

export function keepAudioUnlocked(enable: boolean): void {
  if (enable && !listening) {
    for (const g of GESTURES) document.addEventListener(g, unlockAudio, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onVisible)
    listening = true
  } else if (!enable && listening) {
    for (const g of GESTURES) document.removeEventListener(g, unlockAudio, { capture: true })
    document.removeEventListener('visibilitychange', onVisible)
    listening = false
  }
}

export const audioReady = () => ctx?.state === 'running'

/** Tre bip. Ritorna false se l'audio non è utilizzabile (mai sbloccato, sospeso, non supportato). */
export function playRestEnd(): boolean {
  if (!ctx || ctx.state !== 'running') return false
  const t0 = ctx.currentTime + 0.02
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = i === 2 ? 1175 : 880
    const t = t0 + i * 0.22
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.2)
  }
  return true
}
