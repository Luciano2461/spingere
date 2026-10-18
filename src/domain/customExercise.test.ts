import { describe, expect, it } from 'vitest'
import { EMPTY_FORM, applyForm, cleanMuscles, formFromExercise, isCustom, newCustomExercise, validateName } from './customExercise'
import type { Exercise } from './types'

const ex = (p: Partial<Exercise>): Exercise => ({ id: 'b:squat', source: 'builtin', name: 'Squat', type: 'weight_reps', equipment: 'barbell', primaryMuscles: [], secondaryMuscles: [], images: [], ...p })

describe('nome', () => {
  const all = [ex({}), ex({ id: 'c:1', source: 'custom', name: 'Mio Esercizio' }), ex({ id: 'c:2', source: 'custom', name: 'Vecchio', deleted: true })]
  it('obbligatorio e non troppo lungo', () => {
    expect(validateName('   ', all)).toMatch(/Scrivi/)
    expect(validateName('x'.repeat(81), all)).toMatch(/troppo lungo/)
    expect(validateName('Nuovo', all)).toBeNull()
  })
  it('non può ripetere un altro esercizio (maiuscole e accenti non contano)', () => {
    expect(validateName('squat', all)).toMatch(/Esiste già/)
    expect(validateName('MIO esercizio', all)).toMatch(/Esiste già/)
  })
  it('può riusare il nome di un esercizio eliminato e il proprio nome', () => {
    expect(validateName('Vecchio', all)).toBeNull()
    expect(validateName('Mio Esercizio', all, 'c:1')).toBeNull()
  })
})

describe('creazione e modifica', () => {
  it('nuovo esercizio: ID c:, nome pulito, attrezzo predefinito, muscoli senza doppioni', () => {
    const e = newCustomExercise({ ...EMPTY_FORM, name: '  Curl  speciale ', equipment: '', primaryMuscles: ['biceps', 'biceps'], secondaryMuscles: ['biceps', 'forearms'] })
    expect(e).toMatchObject({ source: 'custom', name: 'Curl  speciale', equipment: 'other', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], images: [] })
    expect(isCustom(e)).toBe(true)
    expect(e.id.startsWith('c:')).toBe(true)
  })
  it('due esercizi creati hanno ID diversi', () => {
    expect(newCustomExercise({ ...EMPTY_FORM, name: 'A' }).id).not.toBe(newCustomExercise({ ...EMPTY_FORM, name: 'B' }).id)
  })
  it('la modifica mantiene ID e fonte', () => {
    const e = newCustomExercise({ ...EMPTY_FORM, name: 'A' })
    const next = applyForm(e, { ...formFromExercise(e), name: 'B', type: 'timed', primaryMuscles: ['abdominals'] })
    expect(next).toMatchObject({ id: e.id, source: 'custom', name: 'B', type: 'timed', primaryMuscles: ['abdominals'] })
  })
  it('i secondari non ripetono i principali', () => {
    expect(cleanMuscles(['chest'], ['chest', 'triceps'])).toEqual({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] })
  })
  it('un esercizio del database non è personalizzato', () => {
    expect(isCustom(ex({}))).toBe(false)
  })
})
