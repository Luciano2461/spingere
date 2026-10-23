import type { RestSoundStyle, RestTimer, RestVolume, Settings } from './types'

// Segnali sonori del recupero: preavviso, conto alla rovescia 3-2-1 e fine. Solo calcolo: l'audio è in services/audio.ts.

export type CueKind = 'warn' | 'tick' | 'end'

export interface Cue {
  kind: CueKind
  at: number // millisecondi epoch
}

/** Preavviso a 10 s dalla fine, solo nei recuperi di almeno 20 s (in quelli brevi si sovrapporrebbe al 3-2-1). */
export const WARN_BEFORE_S = 10
export const WARN_MIN_REST_S = 20
/** Un segnale arrivato in ritardo (app in secondo piano, controllo rallentato) suona solo entro questo margine. */
const MAX_LATE_MS: Record<CueKind, number> = { warn: 1500, tick: 1500, end: 3000 }

/** Segnali del recupero in ordine di tempo. Senza conto alla rovescia resta solo la fine. */
export function restCues(rest: RestTimer, countdown: boolean): Cue[] {
  const end = new Date(rest.endsAt).getTime()
  const start = end - rest.durationSeconds * 1000
  const cues: Cue[] = []
  if (countdown) {
    if (rest.durationSeconds >= WARN_MIN_REST_S) cues.push({ kind: 'warn', at: end - WARN_BEFORE_S * 1000 })
    for (const s of [3, 2, 1]) if (end - s * 1000 > start) cues.push({ kind: 'tick', at: end - s * 1000 })
  }
  cues.push({ kind: 'end', at: end })
  return cues
}

export const cueKey = (c: Cue) => `${c.kind}@${c.at}`

/**
 * Segnale da far suonare adesso: il più recente già scattato, se non è troppo vecchio e non è già stato suonato.
 * Al massimo uno per volta: dopo un ritardo non si recuperano i segnali saltati.
 */
export function dueCue(cues: Cue[], now: number, played: ReadonlySet<string>): Cue | null {
  const due = cues.filter((c) => c.at <= now)
  const last = due[due.length - 1]
  if (!last || now - last.at > MAX_LATE_MS[last.kind] || played.has(cueKey(last))) return null
  return last
}

export interface SoundPrefs {
  enabled: boolean
  style: RestSoundStyle
  volume: RestVolume
  countdown: boolean
  ignoreSilent: boolean
}

export const SOUND_STYLES: RestSoundStyle[] = ['classic', 'gong', 'triple']
export const VOLUMES: RestVolume[] = ['low', 'medium', 'high']

/** Preferenze del suono con i valori predefiniti: un valore assente o non valido (es. backup modificato a mano) non rompe nulla. */
export function soundPrefs(s: Partial<Settings>): SoundPrefs {
  return {
    enabled: s.restSound !== false,
    style: SOUND_STYLES.includes(s.restSoundStyle as RestSoundStyle) ? (s.restSoundStyle as RestSoundStyle) : 'classic',
    volume: VOLUMES.includes(s.restVolume as RestVolume) ? (s.restVolume as RestVolume) : 'high',
    countdown: s.restCountdown !== false,
    ignoreSilent: s.restIgnoreSilent === true,
  }
}
