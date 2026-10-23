// Audio a fine recupero. Su iOS l'audio si sblocca solo da un gesto dell'utente: il contesto viene creato/ripreso
// a ogni tocco mentre c'è un allenamento in corso (e al primo tocco su "Inizia allenamento").
// Attenzione: su iPhone il suono web è silenziato dall'interruttore "Silenzioso", salvo l'opzione «Suona anche col Silenzioso»
// dove iOS lo permette (vedi canIgnoreSilent); resta sempre il segnale visivo.

import type { CueKind } from '../domain/restCues'
import type { RestSoundStyle, RestVolume } from '../domain/types'

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

type SessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'
const audioSession = () => (navigator as Navigator & { audioSession?: { type: SessionType } }).audioSession

/** iOS 17+ (Safari): si può chiedere di trattare il suono come riproduzione, che ignora l'interruttore Silenzioso. */
export const canIgnoreSilent = () => !!audioSession()

let sessionTimer: ReturnType<typeof setTimeout> | undefined
// Solo per la durata del segnale: in "playback" anche il campione muto dello sblocco (a ogni tocco) fermerebbe la musica.
// Effetto collaterale noto: quando suona, la musica di un'altra app (es. Spotify) si ferma e non riparte da sola.
function playbackFor(seconds: number) {
  const s = audioSession()
  if (!s) return
  try {
    s.type = 'playback'
    clearTimeout(sessionTimer)
    sessionTimer = setTimeout(() => {
      try {
        s.type = 'auto'
      } catch {
        /* ignora */
      }
    }, (seconds + 0.5) * 1000)
  } catch {
    /* ignora */
  }
}

const VOLUME: Record<RestVolume, number> = { low: 0.3, medium: 0.6, high: 1 }
let bus: { comp: DynamicsCompressorNode; master: GainNode } | null = null

/** Uscita comune: volume generale e limitatore, così il volume alto resta forte senza distorcere. */
function output(c: AudioContext, volume: RestVolume): AudioNode {
  if (!bus) {
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 6
    comp.ratio.value = 8
    comp.attack.value = 0.003
    comp.release.value = 0.12
    const master = c.createGain()
    comp.connect(master).connect(c.destination)
    bus = { comp, master }
  }
  bus.master.gain.setValueAtTime(VOLUME[volume], c.currentTime)
  return bus.comp
}

interface Tone {
  freq: number
  dur: number
  type?: OscillatorType
  peak?: number
  attack?: number
  lowpass?: number
}

function tone(c: AudioContext, out: AudioNode, t: number, { freq, dur, type = 'sine', peak = 0.8, attack = 0.01, lowpass }: Tone) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let node: AudioNode = osc
  if (lowpass) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = lowpass
    node = osc.connect(f)
  }
  node.connect(gain).connect(out)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/** Disegna il segnale a partire dal tempo `t` del contesto; restituisce la durata in secondi (al massimo 1,8). */
function schedule(c: AudioContext, out: AudioNode, t: number, kind: CueKind, style: RestSoundStyle): number {
  if (kind === 'warn') {
    tone(c, out, t, { freq: 660, dur: 0.14, peak: 0.45 })
    return 0.15
  }
  if (kind === 'tick') {
    tone(c, out, t, { freq: 1047, dur: 0.08, type: 'triangle', peak: 0.7, attack: 0.005 })
    return 0.1
  }
  switch (style) {
    case 'gong':
      // Fondamentale grave con armoniche non intere e coda lunga, come un colpo di gong
      for (const [ratio, peak] of [[1, 0.9], [2.76, 0.45], [5.4, 0.2]] as const) tone(c, out, t, { freq: 392 * ratio, dur: 1.8 / ratio ** 0.3, peak, attack: 0.005 })
      return 1.8
    case 'triple':
      // Due corti e uno lungo, acuti: si sentono sopra la musica
      tone(c, out, t, { freq: 1568, dur: 0.1, type: 'square', peak: 0.5, attack: 0.004, lowpass: 4000 })
      tone(c, out, t + 0.16, { freq: 1568, dur: 0.1, type: 'square', peak: 0.5, attack: 0.004, lowpass: 4000 })
      tone(c, out, t + 0.32, { freq: 1568, dur: 0.5, type: 'square', peak: 0.5, attack: 0.004, lowpass: 4000 })
      return 0.85
    default:
      // Classico: due note uguali e una più alta
      for (let i = 0; i < 3; i++) tone(c, out, t + i * 0.22, { freq: i === 2 ? 1175 : 880, dur: 0.18, type: 'triangle', peak: 0.8, attack: 0.02 })
      return 0.65
  }
}

export interface CueOptions {
  style: RestSoundStyle
  volume: RestVolume
  ignoreSilent: boolean
}

/** Suona un segnale del recupero. Ritorna false se l'audio non è utilizzabile (mai sbloccato, sospeso, non supportato). */
export function playCue(kind: CueKind, opts: CueOptions): boolean {
  if (!ctx || ctx.state !== 'running') return false
  if (opts.ignoreSilent) playbackFor(2) // prima del suono: la sessione va impostata prima che parta (il segnale più lungo dura 1,8 s)
  schedule(ctx, output(ctx, opts.volume), ctx.currentTime + 0.02, kind, opts.style)
  return true
}

/** Prova del conto alla rovescia, accorciato: preavviso, 3-2-1 e fine in quattro secondi. */
export function playCountdownDemo(opts: CueOptions): boolean {
  if (!ctx || ctx.state !== 'running') return false
  if (opts.ignoreSilent) playbackFor(6)
  const out = output(ctx, opts.volume)
  const t0 = ctx.currentTime + 0.02
  schedule(ctx, out, t0, 'warn', opts.style)
  for (let i = 1; i <= 3; i++) schedule(ctx, out, t0 + i, 'tick', opts.style)
  schedule(ctx, out, t0 + 4, 'end', opts.style)
  return true
}
