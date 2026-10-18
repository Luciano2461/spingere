import { describe, expect, it } from 'vitest'
import { expandQuery, matchScore, normalize, searchExercises } from './search'
import type { Exercise } from './types'

const ex = (id: string, name: string, nameOriginal: string, extra: Partial<Exercise> = {}): Exercise => ({
  id, source: 'builtin', name, nameOriginal, type: 'weight_reps', equipment: 'barbell',
  primaryMuscles: ['chest'], secondaryMuscles: [], images: [], ...extra,
})

const list = [
  ex('1', 'Panca piana con bilanciere (presa media)', 'Barbell Bench Press - Medium Grip'),
  ex('2', 'Panca piana con manubri', 'Dumbbell Bench Press', { equipment: 'dumbbell' }),
  ex('3', 'Curl con manubri', 'Dumbbell Bicep Curl', { equipment: 'dumbbell', primaryMuscles: ['biceps'] }),
  ex('4', 'Squat con bilanciere', 'Barbell Squat', { primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'] }),
]

describe('normalize', () => {
  it('toglie accenti, maiuscole e punteggiatura', () => expect(normalize("Plié, Dip/Tricipiti!")).toBe('plie dip tricipiti'))
})

describe('searchExercises', () => {
  it('trova per nome italiano, tollerando il plurale', () => {
    expect(searchExercises(list, { query: 'manubrio' }).map((e) => e.id).sort()).toEqual(['2', '3'])
  })
  it('trova per nome originale inglese', () => {
    expect(searchExercises(list, { query: 'bench press' }).map((e) => e.id).sort()).toEqual(['1', '2'])
  })
  it('richiede tutti i termini', () => {
    expect(searchExercises(list, { query: 'panca manubri' }).map((e) => e.id)).toEqual(['2'])
  })
  it('ignora maiuscole e accenti', () => {
    expect(searchExercises(list, { query: 'SQUAT' }).map((e) => e.id)).toEqual(['4'])
  })
  it('filtra per muscolo (anche secondario) e attrezzo', () => {
    expect(searchExercises(list, { muscle: 'glutes' }).map((e) => e.id)).toEqual(['4'])
    expect(searchExercises(list, { equipment: 'dumbbell' }).map((e) => e.id)).toEqual(['3', '2'])
  })
  it('senza query restituisce tutto in ordine alfabetico', () => {
    expect(searchExercises(list, {}).map((e) => e.id)).toEqual(['3', '1', '2', '4'])
  })
  it('nessun risultato', () => {
    expect(searchExercises(list, { query: 'xyz' })).toEqual([])
  })
  it('esclude gli esercizi eliminati', () => {
    expect(searchExercises([{ ...list[0], deleted: true }], {})).toEqual([])
  })
})

describe('ordinamento', () => {
  it('a parità di termini, ordine corretto e nome più breve vengono prima', () => {
    const lista = [
      ex('a', 'Alzata spalle con manubri su panca inclinata', 'x'),
      ex('b', 'Panca piana con manubri', 'x'),
    ]
    expect(searchExercises(lista, { query: 'panca manubri' }).map((e) => e.id)).toEqual(['b', 'a'])
  })
})

const synonyms = [
  ['lat machine', 'pulldown', 'tirata alta'],
  ['panca', 'bench press'],
  ['manubri', 'manubrio', 'dumbbell'],
  ['stacco rumeno', 'romanian deadlift', 'rdl'],
]
const pool = [
  ex('lat', 'Lat machine presa larga', 'Wide-Grip Lat Pulldown', { primaryMuscles: ['lats'] }),
  ex('rdl', 'Stacco rumeno', 'Romanian Deadlift', { primaryMuscles: ['hamstrings'] }),
  ex('pm', 'Panca piana con manubri', 'Dumbbell Bench Press', { equipment: 'dumbbell' }),
]

describe('sinonimi', () => {
  it('espande parole e frasi', () => {
    expect(expandQuery('pulldown', synonyms)).toContain('lat machine')
    expect(expandQuery('rdl', synonyms)).toContain('stacco rumeno')
    expect(expandQuery('xyz', synonyms)).toEqual(['xyz'])
  })
  it('trova con un nome diverso da quello in lista', () => {
    expect(searchExercises(pool, { query: 'tirata alta' }, { synonyms }).map((e) => e.id)).toEqual(['lat'])
    expect(searchExercises(pool, { query: 'RDL' }, { synonyms }).map((e) => e.id)).toEqual(['rdl'])
    expect(searchExercises(pool, { query: 'bench dumbbell' }, { synonyms }).map((e) => e.id)).toEqual(['pm'])
  })
  it('senza sinonimi la stessa ricerca non trova nulla', () => {
    expect(searchExercises(pool, { query: 'tirata alta' })).toEqual([])
  })
})

describe('nomi personali', () => {
  it('trova un esercizio col nome scelto dall\'utente', () => {
    const aliases = new Map([['pm', ['panca del lunedì']]])
    expect(searchExercises(pool, { query: 'lunedi' }, { aliases }).map((e) => e.id)).toEqual(['pm'])
  })
  it('un nome personale che coincide con la ricerca ha la precedenza', () => {
    const aliases = new Map([['lat', ['panca']]])
    expect(searchExercises(pool, { query: 'panca' }, { aliases }).map((e) => e.id)).toEqual(['lat', 'pm'])
  })
})

describe('matchScore', () => {
  it('il prefisso batte la sottostringa', () => {
    expect(matchScore(list[3], 'squat')).toBeGreaterThan(matchScore(list[0], 'squa'))
  })
})
