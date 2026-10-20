import { describe, expect, it } from 'vitest'
import data from '../data/exercises.json'
import commonNamesJson from '../data/common-names.json'
import synonymsJson from '../data/synonyms.json'
import {
  aiInstructions, buildImport, buildReview, cleanImportName, detectDelimiter, pastedTable, headerField, initialChoice, matchExercise, parseCsv, parseDuration, parseNumber, parseTypeHint, tableToRows, templateCsv,
  type Choice,
} from './importPlan'
import type { Exercise } from './types'

const all = data.exercises as Exercise[]
const commonNames = commonNamesJson as Record<string, string>
const synonymGroups = synonymsJson as string[][]
const byId = (id: string) => all.find((e) => e.id === id)!

describe('CSV', () => {
  it('riconosce il separatore', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c')).toBe(',')
    expect(detectDelimiter('a\tb')).toBe('\t')
    expect(detectDelimiter('"a;b",c')).toBe(',')
    expect(detectDelimiter('solo')).toBe(',')
  })
  it('legge virgolette, a capo nelle celle, CRLF e BOM', () => {
    const t = '﻿a;b\r\n"x;y";"dice ""ciao""\nvai"\r\n;ultimo'
    expect(parseCsv(t)).toEqual([['a', 'b'], ['x;y', 'dice "ciao"\nvai'], ['', 'ultimo']])
  })
  it('ultima riga senza a capo', () => expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]))
})

describe('valori', () => {
  it('numeri italiani e intervalli', () => {
    expect(parseNumber('12,5').value).toBe(12.5)
    expect(parseNumber('60 kg').value).toBe(60)
    expect(parseNumber('8-10').value).toBe(10)
    expect(parseNumber('').value).toBeUndefined()
    expect(parseNumber('max').error).toMatch(/non è un numero/)
  })
  it('durate', () => {
    expect(parseDuration('90').value).toBe(90)
    expect(parseDuration('90s').value).toBe(90)
    expect(parseDuration('1:30').value).toBe(90)
    expect(parseDuration("1'30").value).toBe(90)
    expect(parseDuration('2 min').value).toBe(120)
    expect(parseDuration('1,5 min').value).toBe(90)
    expect(parseDuration('boh').error).toBeDefined()
  })
  it('tipo', () => {
    expect(parseTypeHint('Corpo libero').value).toBe('bodyweight')
    expect(parseTypeHint('zavorrato').value).toBe('weighted_bodyweight')
    expect(parseTypeHint('a tempo').value).toBe('timed')
    expect(parseTypeHint('carico').value).toBe('weight_reps')
    expect(parseTypeHint('').value).toBeUndefined()
    expect(parseTypeHint('xyz').error).toBeDefined()
  })
})

describe('tabella → righe', () => {
  it('template di esempio: legge tutte le righe, scheda e giorno vuoti ripetono quelli sopra', () => {
    const { rows, problems } = tableToRows(parseCsv(templateCsv()))
    expect(problems).toEqual([])
    expect(rows).toHaveLength(5)
    expect(rows[1]).toMatchObject({ planName: 'La mia scheda', dayName: 'Push', name: 'Croci ai cavi', group: 'A', notes: 'Superserie con le alzate' })
    expect(rows[3]).toMatchObject({ dayName: 'Gambe', rest: 150 })
    expect(rows[4]).toMatchObject({ typeHint: 'timed', seconds: 45, rest: 60 })
    expect(rows.every((r) => r.warnings.length === 0)).toBe(true)
  })
  it('intestazioni alternative, in qualsiasi ordine e maiuscole', () => {
    const { rows } = tableToRows([['Nome', 'PESO', 'Rip', 'Riposo'], ['Squat', '100', '5', '3 min']])
    expect(rows[0]).toMatchObject({ name: 'Squat', weight: 100, reps: 5, rest: 180, planName: 'Scheda importata', dayName: 'Allenamento' })
  })
  it('senza colonna esercizio spiega il problema', () => {
    expect(tableToRows([['a', 'b'], ['1', '2']]).problems[0]).toMatch(/colonna «esercizio»/)
  })
  it('file vuoto, righe senza nome, valori non validi come avvisi', () => {
    expect(tableToRows([]).problems[0]).toMatch(/vuoto/)
    const r = tableToRows([['esercizio', 'serie'], ['', '3'], ['Plank', 'tre']])
    expect(r.problems.some((p) => /Riga 2/.test(p))).toBe(true)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].warnings[0]).toMatch(/Serie/)
  })
})

describe('abbinamento con il database reale', () => {
  it('nome identico: sicuro', () => {
    expect(matchExercise('Squat con bilanciere', all)).toMatchObject({ status: 'sure', best: { id: 'b:barbell-squat' } })
    expect(matchExercise('  plank ', all)).toMatchObject({ status: 'sure', best: { id: 'b:plank' } })
  })
  it('maiuscole e plurali non contano', () => {
    expect(matchExercise('SQUAT CON BILANCIERE', all).best?.id).toBe('b:barbell-squat')
  })
  it('nome generico: propone ma da controllare', () => {
    const m = matchExercise('Squat', all)
    expect(m.status).toBe('check')
    expect(m.candidates.length).toBeGreaterThan(1)
  })
  it('nome più lungo di quello nel database: trova comunque candidati', () => {
    const m = matchExercise('Panca piana con bilanciere presa larga', all)
    expect(m.status).not.toBe('none')
    expect(m.candidates.map((c) => c.id)).toContain('b:wide-grip-barbell-bench-press')
  })
  it('sinonimi italiani', () => {
    const m = matchExercise('Lat machine', all, { synonyms: [['lat machine', 'pulldown']] })
    expect(m.status).not.toBe('none')
  })
  it('nome personale (alias) identico: sicuro', () => {
    const m = matchExercise('il mio stacco', all, { aliases: new Map([['b:barbell-deadlift', ['Il mio stacco']]]) })
    expect(m).toMatchObject({ status: 'sure', best: { id: 'b:barbell-deadlift' } })
  })
  it('solo qualche parola in comune: suggerimenti ma mai abbinato da solo', () => {
    const m = matchExercise('Plank speciale xqzv', all)
    expect(m.status).toBe('weak')
    expect(m.candidates.length).toBeGreaterThan(0)
    expect(initialChoice({ line: 2, planName: 'S', dayName: 'D', name: 'Plank speciale xqzv', notes: '', warnings: [] }, m).kind).toBe('custom')
  })
  it('sconosciuto o vuoto: nessuno', () => {
    expect(matchExercise('xqzv wlk', all).status).toBe('none')
    expect(matchExercise('   ', all).status).toBe('none')
  })
})

describe('costruzione delle schede', () => {
  const csv = (rows: string[][]) => buildReview(tableToRows([['scheda', 'giorno', 'esercizio', 'tipo', 'serie', 'ripetizioni', 'secondi', 'carico', 'recupero', 'superserie', 'note'], ...rows]).rows, all)

  it('crea scheda, giorni, esercizi e valori', () => {
    const r = buildImport(csv([
      ['S', 'Push', 'Panca piana con bilanciere (presa media)', '', '4', '8', '', '60', '2:00', '', 'piano'],
      ['S', 'Gambe', 'Plank', '', '3', '', '45', '', '60', '', ''],
    ]), 90)
    expect(r.plans).toHaveLength(1)
    expect(r.plans[0].days.map((d) => d.name)).toEqual(['Push', 'Gambe'])
    expect(r.plans[0].days[0].exercises[0]).toMatchObject({ exerciseId: 'b:barbell-bench-press-medium-grip', targetSets: 4, targetReps: 8, targetWeight: 60, restSeconds: 120, notes: 'piano' })
    expect(r.plans[0].days[1].exercises[0]).toMatchObject({ exerciseId: 'b:plank', targetSeconds: 45, restSeconds: 60 })
    expect(r.customExercises).toEqual([])
  })

  it('superserie: righe consecutive con la stessa etichetta; circuito; gruppo singolo sciolto', () => {
    const r = buildImport(csv([
      ['S', 'D', 'Plank', '', '', '', '30', '', '', 'A', ''],
      ['S', 'D', 'Crunch', '', '', '10', '', '', '75', 'A', ''],
      ['S', 'D', 'Squat con bilanciere', '', '', '5', '', '', '', 'B', ''],
      ['S', 'D', 'Flessioni', '', '', '10', '', '', '', 'circuito 1', ''],
      ['S', 'D', 'Crunch', '', '', '10', '', '', '', 'circuito 1', ''],
    ]), 90)
    const d = r.plans[0].days[0]
    expect(d.groups).toHaveLength(2) // B è un solo esercizio: sciolto
    const [a, c] = d.groups
    expect(a).toMatchObject({ kind: 'superset', restAfterGroup: 75 })
    expect(c.kind).toBe('circuit')
    expect(d.exercises.map((e) => !!e.groupId)).toEqual([true, true, false, true, true])
  })

  it('esercizi non trovati diventano personalizzati (uno solo per nome), con tipo dedotto', () => {
    const r = buildImport(csv([
      ['S', 'D', 'Esercizio Inventato', '', '3', '12', '', '20', '', '', ''],
      ['S', 'E', 'esercizio inventato', '', '3', '10', '', '25', '', '', ''],
      ['S', 'E', 'Xqzv Wlk', 'corpo libero', '3', '10', '', '', '', '', ''],
    ]), 90)
    expect(r.customExercises).toHaveLength(2)
    expect(r.customExercises[0]).toMatchObject({ source: 'custom', type: 'weight_reps' })
    expect(r.customExercises[0].id.startsWith('c:')).toBe(true)
    expect(r.customExercises[1].type).toBe('bodyweight')
    expect(r.plans[0].days[0].exercises[0].exerciseId).toBe(r.plans[0].days[1].exercises[0].exerciseId)
  })

  it('più schede nello stesso file e righe saltate', () => {
    const items = csv([
      ['A', 'D', 'Plank', '', '', '', '30', '', '', '', ''],
      ['B', 'D', 'Plank', '', '', '', '30', '', '', '', ''],
      ['B', 'D', 'Crunch', '', '', '', '', '', '', '', ''],
    ])
    items[2] = { ...items[2], choice: { kind: 'skip' } satisfies Choice }
    const r = buildImport(items, 90)
    expect(r.plans.map((p) => p.name)).toEqual(['A', 'B'])
    expect(r.plans[1].days[0].exercises).toHaveLength(1)
  })

  it('se tutto è saltato non crea schede', () => {
    const items = csv([['A', 'D', 'Plank', '', '', '', '', '', '', '', '']]).map((i) => ({ ...i, choice: { kind: 'skip' } as Choice }))
    expect(buildImport(items, 90).plans).toEqual([])
  })

  it('alias: solo per abbinamenti corretti a mano, nome diverso e non già presente', () => {
    const items = csv([['A', 'D', 'Il mio stacco', '', '', '', '', '', '', '', '']])
    const chosen: Choice = { kind: 'exercise', exercise: byId('b:barbell-deadlift') }
    expect(buildImport(items, 90).aliases).toEqual([]) // non toccato a mano
    const manual = [{ ...items[0], choice: chosen, manual: true }]
    const r = buildImport(manual, 90)
    expect(r.aliases).toHaveLength(1)
    expect(r.aliases[0]).toMatchObject({ exerciseId: 'b:barbell-deadlift', text: 'Il mio stacco' })
    expect(buildImport(manual, 90, [{ id: 'x', exerciseId: 'b:barbell-deadlift', text: 'il mio STACCO' }]).aliases).toEqual([])
  })
})

describe('nomi importati e AI', () => {
  it('ripulisce numerazione, gradi, serie×ripetizioni, carichi e recuperi', () => {
    expect(cleanImportName('1. Panca inclinata 30° 4x8 60kg rec 90"')).toBe('panca inclinata')
    expect(cleanImportName('A) Squat 5 x 5')).toBe('squat')
    expect(cleanImportName('Leg press 45 gradi')).toBe('leg press')
    expect(cleanImportName('Panca 30° manubri')).toBe('panca manubri inclinata') // i gradi indicano la panca inclinata
    expect(cleanImportName('4x8')).toBe('4x8') // se non resta niente si tiene il nome
  })
  it('l\'attrezzo scritto senza «con» e il nome inglese aiutano l\'abbinamento', () => {
    expect(matchExercise('Squat bilanciere', all).best?.id).toBe('b:barbell-squat')
    expect(matchExercise('Esercizio sconosciuto', all, {}, 'Barbell Squat')).toMatchObject({ status: 'sure', best: { id: 'b:barbell-squat' } })
  })
  it('le intestazioni scritte nelle istruzioni per l\'AI sono tutte riconosciute', () => {
    const header = aiInstructions().split('\n').find((l) => l.startsWith('- Prima riga'))!.split(': ')[1]
    expect(header.split(';').every((c) => headerField(c) !== null)).toBe(true)
  })
  it('legge il CSV incollato dalla risposta di un\'AI, con blocco di codice e frasi attorno', () => {
    const text = 'Ecco il CSV:\n```csv\nscheda;giorno;esercizio;nome inglese;serie\nA;Push;Panca piana;Barbell Bench Press;4\n```\nFammi sapere se vuoi modifiche!'
    const t = pastedTable(text)
    expect(t[0][2]).toBe('esercizio')
    expect(tableToRows(t)).toMatchObject({ problems: [], rows: [{ name: 'Panca piana', nameEn: 'Barbell Bench Press', sets: 4 }] })
    expect(tableToRows(pastedTable('esercizio,serie\nSquat,5\n\nBuon allenamento!')).rows).toHaveLength(1) // senza blocco di codice
  })
})

describe('nomi comuni da palestra', () => {
  const ids = new Set(all.map((e) => e.id))
  const opts = { synonyms: synonymGroups, commonNames }
  it('ogni voce porta a un esercizio esistente ed è scritta come la cerca l\'import', () => {
    for (const [key, id] of Object.entries(commonNames)) {
      expect(ids.has(id), `${key} → ${id}`).toBe(true)
      expect(cleanImportName(key), key).toBe(key)
    }
  })
  it('i nomi da palestra più comuni vengono abbinati con sicurezza all\'esercizio base', () => {
    const cases: [string, string][] = [
      ['Panca piana', 'b:barbell-bench-press-medium-grip'], ['Squat', 'b:barbell-squat'], ['Pulley basso', 'b:seated-cable-rows'],
      ['Lat machine avanti', 'b:wide-grip-lat-pulldown'], ['Stacchi rumeni', 'b:romanian-deadlift'], ['Dip', 'b:parallel-bar-dip'],
    ]
    for (const [name, id] of cases) expect(matchExercise(name, all, opts), name).toMatchObject({ status: 'sure', best: { id } })
  })
  it('un nome corretto a mano dall\'utente vince sul dizionario', () => {
    const m = matchExercise('Panca piana', all, { ...opts, aliases: new Map([['b:dumbbell-bench-press', ['panca piana']]]) })
    expect(m.best?.id).toBe('b:dumbbell-bench-press')
  })
  it('se resta la maggior parte del nome propone l\'esercizio da controllare', () => {
    expect(matchExercise('Chest press seduto', all, opts)).toMatchObject({ status: 'check', best: { id: 'b:machine-bench-press' } })
  })
})
