import type { Exercise } from './types'

export interface ExerciseFilter {
  query?: string
  muscle?: string // chiave inglese, es. "chest"
  equipment?: string // chiave inglese, es. "barbell"
}

/** Minuscolo, senza accenti né punteggiatura. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Toglie le vocali finali (plurali/generi italiani: manubri/manubrio) e la "s" dei plurali inglesi (squats). */
function stem(token: string): string {
  const noVowels = token.replace(/[aeiou]+$/, '')
  if (noVowels.length >= 3) return noVowels
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token
}

function tokens(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean).map(stem)
}

export type SynonymGroups = string[][]

export interface SearchOptions {
  /** Gruppi di termini equivalenti (es. ["lat machine", "pulldown"]). */
  synonyms?: SynonymGroups
  /** Nomi alternativi dell'utente, per ID esercizio. */
  aliases?: Map<string, string[]>
}

const MAX_ALTERNATIVES = 40

/** Varianti della ricerca ottenute sostituendo parole/frasi con i loro sinonimi. */
export function expandQuery(query: string, groups: SynonymGroups = []): string[] {
  const norm = normalize(query)
  if (!norm || groups.length === 0) return [query]
  const words = norm.split(' ').filter(Boolean)
  const termsOf = (probe: string): string[] => {
    const hits = new Set<string>()
    for (const g of groups) {
      const gn = g.map(normalize)
      if (gn.some((t) => !t.includes(' ') && stem(t) === stem(probe)) || gn.includes(probe)) gn.forEach((t) => hits.add(t))
    }
    return [...hits]
  }
  // opzioni per ogni parola (la parola stessa + i sinonimi a parola singola)
  let combos: string[][] = [[]]
  for (const w of words) {
    const options = [w, ...termsOf(w).filter((t) => t !== w)]
    combos = combos.flatMap((c) => options.map((o) => [...c, o])).slice(0, MAX_ALTERNATIVES)
  }
  const out = new Set<string>(combos.map((c) => c.join(' ')))
  // l'intera ricerca può essere una frase sinonima (es. "stacco rumeno")
  for (const t of termsOf(norm)) out.add(t)
  return [norm, ...[...out].filter((q) => q !== norm)].slice(0, MAX_ALTERNATIVES)
}

function scoreField(field: string, query: string): number {
  const q = tokens(query)
  const words = tokens(field)
  if (q.length === 0 || words.length === 0) return 0
  let score = 0
  for (const t of q) {
    if (words.includes(t)) score += 3
    else if (words.some((w) => w.startsWith(t))) score += 2
    else if (words.some((w) => w.includes(t))) score += 1
    else return 0
  }
  if (normalize(field).startsWith(normalize(query))) score += 2
  // termini nello stesso ordine della ricerca, e nomi più brevi (più vicini a ciò che si cerca) in cima
  let pos = -1
  const inOrder = q.every((t) => (pos = words.findIndex((w, idx) => idx > pos && w.startsWith(t))) !== -1)
  if (inOrder) score += 1.5
  return score - 0.1 * Math.max(0, words.length - q.length)
}

/** Punteggio di corrispondenza (0 = nessuna). Tutti i termini della ricerca devono comparire. */
export function matchScore(
  exercise: Pick<Exercise, 'id' | 'name' | 'nameOriginal'>,
  query: string,
  options: SearchOptions = {},
): number {
  if (tokens(query).length === 0) return 1
  const fields: { text: string; penalty: number }[] = [
    { text: exercise.name, penalty: 0 },
    ...(options.aliases?.get(exercise.id) ?? []).map((text) => ({ text, penalty: 0.2 })), // nomi scelti dall'utente
    { text: exercise.nameOriginal ?? '', penalty: 0.5 },
  ]
  let best = 0
  expandQuery(query, options.synonyms).forEach((q, i) => {
    for (const f of fields) {
      const s = scoreField(f.text, q)
      if (s > 0) best = Math.max(best, s - f.penalty - (i === 0 ? 0 : 0.3)) // la ricerca originale batte i sinonimi
    }
  })
  return best > 0 ? Math.max(best, 0.1) : 0
}

export function searchExercises(list: Exercise[], filter: ExerciseFilter, options: SearchOptions = {}): Exercise[] {
  const query = filter.query?.trim() ?? ''
  const scored: { e: Exercise; s: number }[] = []
  for (const e of list) {
    if (e.deleted) continue
    if (filter.muscle && !e.primaryMuscles.includes(filter.muscle) && !e.secondaryMuscles.includes(filter.muscle)) continue
    if (filter.equipment && e.equipment !== filter.equipment) continue
    const s = matchScore(e, query, options)
    if (s > 0) scored.push({ e, s })
  }
  scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name, 'it'))
  return scored.map((x) => x.e)
}
