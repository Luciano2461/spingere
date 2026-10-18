import { describe, expect, it } from 'vitest'
import { tableToRows } from './importPlan'
import { itemsToLines, looksLikeHeading, parseExerciseText, parsePdfPages, type PdfItem } from './importPdf'

/** Costruisce i frammenti di una riga: [x, testo] con larghezza proporzionale al testo. Y più grande = più in alto. */
const row = (y: number, ...cells: [number, string][]): PdfItem[] => cells.map(([x, str]) => ({ str, x, y, width: str.length * 5, height: 10 }))
const page = (...rows: PdfItem[][]): PdfItem[] => rows.flat()

describe('righe dai frammenti', () => {
  it('unisce frammenti vicini in una cella e separa le colonne distanti', () => {
    const items = page(row(700, [10, 'Panca'], [40, 'piana'], [200, '4x8']))
    const [l] = itemsToLines(items)
    expect(l.cells.map((c) => c.text)).toEqual(['Panca piana', '4x8'])
  })
  it('ordina dall\'alto in basso e tollera piccole differenze di altezza', () => {
    const lines = itemsToLines(page(row(600, [10, 'Seconda']), row(700, [10, 'Prima']), row(699, [100, 'x'])))
    expect(lines.map((l) => l.text)).toEqual(['Prima x', 'Seconda'])
  })
  it('i frammenti di soli spazi (come li produce pdf.js) non uniscono le colonne', () => {
    const items: PdfItem[] = [
      { str: 'Esercizio', x: 50, y: 740, width: 45, height: 11 },
      { str: ' ', x: 95, y: 740, width: 155, height: 0 },
      { str: 'Serie', x: 250, y: 740, width: 26, height: 11 },
    ]
    expect(itemsToLines(items)[0].cells.map((c) => c.text)).toEqual(['Esercizio', 'Serie'])
  })
  it('ignora frammenti vuoti', () => {
    expect(itemsToLines(page(row(700, [10, '   ']))).length).toBe(0)
  })
})

describe('riga libera', () => {
  it('serie × ripetizioni, carico e recupero', () => {
    expect(parseExerciseText('Panca piana 4x8 60kg rec 90s')).toMatchObject({ name: 'Panca piana', sets: '4', reps: '8', weight: '60', rest: '90s' })
  })
  it('formati diversi', () => {
    expect(parseExerciseText('1) Squat 5 × 5 - 100 kg - recupero 2 min')).toMatchObject({ name: 'Squat', sets: '5', reps: '5', weight: '100', rest: '2 min' })
    expect(parseExerciseText('• Curl con manubri 3x10-12 (rec 1\'30)')).toMatchObject({ name: 'Curl con manubri', sets: '3', reps: '10-12', rest: "1'30" })
    expect(parseExerciseText('Lat machine 3 serie da 12 rip')).toMatchObject({ name: 'Lat machine', sets: '3', reps: '12' })
    expect(parseExerciseText('Stacco rumeno 4x6 82,5kg')).toMatchObject({ weight: '82,5' })
  })
  it('esercizi a tempo', () => {
    expect(parseExerciseText('Plank 3x45"')).toMatchObject({ name: 'Plank', sets: '3', seconds: '45' })
    expect(parseExerciseText('Plank 3 x 30s rec 60"')).toMatchObject({ sets: '3', seconds: '30', rest: '60s' })
    expect(parseExerciseText("Stacco 4x5 rec 2'")).toMatchObject({ name: 'Stacco', sets: '4', reps: '5', rest: "2'" })
    expect(parseExerciseText('Stacco 4x5 rec 3’')).toMatchObject({ name: 'Stacco', rest: "3'" })
  })
  it('gruppo di superserie a inizio riga', () => {
    expect(parseExerciseText('A1 Croci ai cavi 3x12')).toMatchObject({ name: 'Croci ai cavi', group: 'A' })
  })
  it('senza numeri: solo il nome, nessun dato', () => {
    expect(parseExerciseText('Plank')).toMatchObject({ name: 'Plank', hasData: false })
  })
})

describe('intestazioni di giorno', () => {
  it('riconosce', () => {
    for (const t of ['Giorno 1 - Push', 'PUSH', 'Gambe', 'Allenamento A', 'Upper body:', 'SCHIENA E BICIPITI']) expect(looksLikeHeading(t), t).toBe(true)
  })
  it('non scambia per intestazione un esercizio con serie', () => {
    expect(looksLikeHeading('Squat 4x6')).toBe(false)
    expect(looksLikeHeading('Panca piana')).toBe(false)
  })
})

describe('PDF a righe libere', () => {
  const p = page(
    row(780, [40, 'Scheda di Mario']),
    row(750, [40, 'GIORNO A - PUSH']),
    row(730, [40, '1. Panca piana con bilanciere 4x8 60kg rec 2min']),
    row(710, [40, '2. Croci ai cavi 3x12 15kg rec 60s']),
    row(690, [40, 'Ricordati di scaldarti bene prima di iniziare ogni seduta di allenamento con cura']),
    row(660, [40, 'GIORNO B - GAMBE']),
    row(640, [40, 'Squat con bilanciere 5x5 100kg rec 3min']),
    row(620, [40, 'Plank 3x45"']),
    row(30, [280, '1']),
  )
  it('estrae giorni ed esercizi con i valori', () => {
    const r = parsePdfPages([p])
    expect(r.mode).toBe('text')
    expect(r.hasText).toBe(true)
    const { rows } = tableToRows(r.table)
    expect(rows.map((x) => [x.dayName, x.name, x.sets, x.reps, x.weight, x.rest, x.seconds])).toEqual([
      ['GIORNO A - PUSH', 'Panca piana con bilanciere', 4, 8, 60, 120, undefined],
      ['GIORNO A - PUSH', 'Croci ai cavi', 3, 12, 15, 60, undefined],
      ['GIORNO B - GAMBE', 'Squat con bilanciere', 5, 5, 100, 180, undefined],
      ['GIORNO B - GAMBE', 'Plank', 3, undefined, undefined, undefined, 45],
    ])
  })
  it('titolo del documento e frasi lunghe senza valori restano tra le righe non riconosciute', () => {
    const r = parsePdfPages([p])
    expect(r.unrecognized.map((u) => u.text)).toEqual(['Scheda di Mario', 'Ricordati di scaldarti bene prima di iniziare ogni seduta di allenamento con cura'])
    expect(r.table.some((t) => t[1].includes('Mario'))).toBe(false)
  })
})

describe('PDF con tabella', () => {
  const header = row(750, [40, 'Esercizio'], [220, 'Serie'], [260, 'Rip'], [300, 'Carico'], [350, 'Recupero'])
  const p = page(
    row(780, [40, 'Il mio programma']),
    row(765, [40, 'Giorno 1']),
    header,
    row(730, [40, 'Panca piana'], [220, '4'], [260, '8'], [300, '60'], [350, '2:00']),
    row(710, [40, 'Rematore con bilanciere'], [220, '4'], [260, '8-10'], [300, '50,5'], [350, '90']),
    row(690, [40, 'Giorno 2']),
    header.map((i) => ({ ...i, y: 670 })),
    row(650, [40, 'Squat'], [220, '5'], [260, '5'], [300, '100'], [350, '3 min']),
    row(630, [40, 'Plank'], [220, '3'], [260, '']),
  )
  it('legge le colonne dalle intestazioni e usa i titoli come giorni; ripete l\'intestazione senza duplicare', () => {
    const r = parsePdfPages([p])
    expect(r.mode).toBe('table')
    const { rows, problems } = tableToRows(r.table)
    expect(problems).toEqual([])
    expect(rows.map((x) => [x.dayName, x.name, x.sets, x.reps, x.weight, x.rest])).toEqual([
      ['Giorno 1', 'Panca piana', 4, 8, 60, 120],
      ['Giorno 1', 'Rematore con bilanciere', 4, 10, 50.5, 90],
      ['Giorno 2', 'Squat', 5, 5, 100, 180],
      ['Giorno 2', 'Plank', 3, undefined, undefined, undefined],
    ])
  })
})

describe('PDF senza testo (scansione)', () => {
  it('segnala che non c\'è testo', () => {
    expect(parsePdfPages([[], []])).toMatchObject({ hasText: false, table: [] })
    expect(parsePdfPages([page(row(700, [10, 'ab']))]).hasText).toBe(false)
  })
})
