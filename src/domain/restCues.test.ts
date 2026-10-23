import { describe, expect, it } from 'vitest'
import { adjustRest, startRest } from './rest'
import { cueKey, dueCue, restCues, soundPrefs, type Cue } from './restCues'
import type { Settings } from './types'

const T0 = Date.parse('2026-10-23T10:00:00Z')
const at = (s: number) => T0 + s * 1000

/** Simula i controlli della barra del recupero ogni `step` ms e restituisce i segnali suonati (tipo e secondo). */
function run(cues: Cue[], from: number, to: number, step = 250) {
  const played = new Set<string>()
  const out: string[] = []
  for (let now = from; now <= to; now += step) {
    const c = dueCue(cues, now, played)
    if (c) {
      played.add(cueKey(c))
      out.push(`${c.kind}@${(c.at - T0) / 1000}`)
    }
  }
  return out
}

describe('segnali del recupero', () => {
  it('preavviso, 3-2-1 e fine in un recupero di 90 s', () => {
    const cues = restCues(startRest(90, T0), true)
    expect(cues.map((c) => `${c.kind}@${(c.at - T0) / 1000}`)).toEqual(['warn@80', 'tick@87', 'tick@88', 'tick@89', 'end@90'])
  })
  it('senza conto alla rovescia resta solo la fine', () => {
    expect(restCues(startRest(90, T0), false)).toEqual([{ kind: 'end', at: at(90) }])
  })
  it('niente preavviso sotto i 20 s, e i tick solo dopo la partenza', () => {
    expect(restCues(startRest(15, T0), true).map((c) => c.kind)).toEqual(['tick', 'tick', 'tick', 'end'])
    expect(restCues(startRest(2, T0), true).map((c) => `${c.kind}@${(c.at - T0) / 1000}`)).toEqual(['tick@1', 'end@2'])
  })
  it('suonano tutti una volta sola, nell\'ordine', () => {
    expect(run(restCues(startRest(90, T0), true), T0, at(95))).toEqual(['warn@80', 'tick@87', 'tick@88', 'tick@89', 'end@90'])
  })
  it('funziona anche con controlli radi (ogni secondo e mezzo)', () => {
    expect(run(restCues(startRest(30, T0), true), T0, at(35), 1500)).toEqual(['warn@20', 'tick@27', 'tick@28', 'end@30']) // il tick dei 29 s cade tra due controlli: superato dalla fine
  })
  it('dopo un ritardo suona solo il più recente, e la fine solo entro 3 s', () => {
    const cues = restCues(startRest(90, T0), true)
    expect(dueCue(cues, at(89.5), new Set())).toMatchObject({ kind: 'tick', at: at(89) })
    expect(dueCue(cues, at(92.9), new Set())).toMatchObject({ kind: 'end' })
    expect(dueCue(cues, at(93.1), new Set())).toBeNull()
    expect(dueCue(cues, at(82), new Set())).toBeNull() // preavviso scaduto
  })
  it('riaprendo l\'app a recupero finito da poco suona la fine, da molto niente', () => {
    const cues = restCues(startRest(60, T0), true)
    expect(run(cues, at(61), at(70))).toEqual(['end@60'])
    expect(run(cues, at(70), at(80))).toEqual([])
  })
  it('con +15 i segnali si spostano', () => {
    const rest = adjustRest(startRest(30, T0), 15, at(5))
    expect(run(restCues(rest, true), at(5), at(50))).toEqual(['warn@35', 'tick@42', 'tick@43', 'tick@44', 'end@45'])
  })
  it('con −15 che porta alla fine immediata suona subito la fine', () => {
    const rest = adjustRest(startRest(30, T0), -15, at(20))
    expect(run(restCues(rest, true), at(20), at(25))).toEqual(['end@20'])
  })
})

describe('preferenze del suono', () => {
  it('valori predefiniti se assenti', () => {
    expect(soundPrefs({})).toEqual({ enabled: true, style: 'classic', volume: 'high', countdown: true, ignoreSilent: false })
  })
  it('usa i valori salvati', () => {
    expect(soundPrefs({ restSound: false, restSoundStyle: 'gong', restVolume: 'low', restCountdown: false, restIgnoreSilent: true }))
      .toEqual({ enabled: false, style: 'gong', volume: 'low', countdown: false, ignoreSilent: true })
  })
  it('ignora valori non validi', () => {
    const bad = { restSoundStyle: 'trombone', restVolume: 11, restCountdown: 'no', restIgnoreSilent: 'sì' } as unknown as Partial<Settings>
    expect(soundPrefs(bad)).toEqual({ enabled: true, style: 'classic', volume: 'high', countdown: true, ignoreSilent: false })
  })
})
