import { newPlan, newDay, newPlanExercise, normalize as normalizeDay } from './plan'
import { matchScore, normalize, type SearchOptions } from './search'
import type { Alias, Exercise, ExerciseType, Plan, PlanDay, PlanGroup } from './types'

// Import di una scheda da tabella (CSV/XLSX): lettura, abbinamento degli esercizi al database e costruzione delle schede.
// Funzioni pure: la lettura dei file e la scrittura nel database stanno altrove (features/import, db/importPlan).

const uuid = () => crypto.randomUUID()

// ---------- CSV ----------

/** Separatore più probabile (`;` `,` o tab) in base alla prima riga, ignorando ciò che sta tra virgolette. */
export function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 }
  let quoted = false
  for (const ch of first) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch in counts) counts[ch]++
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return n > 0 ? best : ','
}

/** Legge un CSV (virgolette, a capo nelle celle, BOM, CRLF). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// ---------- Valori ----------

export type Parsed<T> = { value?: T; error?: string }

/** "12", "12,5", "60 kg", "8-10" (intervallo: si usa l'estremo alto). Vuoto = nessun valore. */
export function parseNumber(raw: string): Parsed<number> {
  const s = raw.trim().toLowerCase().replace(/kg$/, '').trim().replace(',', '.')
  if (s === '') return {}
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/)
  if (range) return { value: Math.max(Number(range[1]), Number(range[2])) }
  if (/^\d+(\.\d+)?$/.test(s)) return { value: Number(s) }
  return { error: `«${raw.trim()}» non è un numero` }
}

/** Durata in secondi: "90", "90s", "1:30", "1'30", "2 min", "1,5 min". Vuoto = nessun valore. */
export function parseDuration(raw: string): Parsed<number> {
  const s = raw.trim().toLowerCase().replace(/’/g, "'")
  if (s === '') return {}
  let m = s.match(/^(\d+):(\d{1,2})$/) ?? s.match(/^(\d+)'\s*(\d{1,2})"?$/)
  if (m) return { value: Number(m[1]) * 60 + Number(m[2]) }
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(min|m|')$/)
  if (m) return { value: Math.round(Number(m[1].replace(',', '.')) * 60) }
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(s|sec|secondi)?$/)
  if (m) return { value: Math.round(Number(m[1].replace(',', '.'))) }
  return { error: `«${raw.trim()}» non è una durata` }
}

const TYPE_HINTS: [RegExp, ExerciseType][] = [
  [/zavorr|assist/, 'weighted_bodyweight'],
  [/corpo libero|bodyweight|a corpo/, 'bodyweight'],
  [/tempo|isometr/, 'timed'],
  [/cardio/, 'cardio'],
  [/carico|pesi|manubri|bilanciere|macchina|cavi/, 'weight_reps'],
]

export function parseTypeHint(raw: string): Parsed<ExerciseType> {
  const s = normalize(raw)
  if (s === '') return {}
  const hit = TYPE_HINTS.find(([re]) => re.test(s))
  return hit ? { value: hit[1] } : { error: `tipo «${raw.trim()}» non riconosciuto (usa carico, corpo libero, zavorra, tempo, cardio)` }
}

// ---------- Tabella → righe ----------

export interface ImportRow {
  line: number // numero di riga nel file (1 = intestazione)
  planName: string
  dayName: string
  name: string
  typeHint?: ExerciseType
  sets?: number
  reps?: number
  seconds?: number
  weight?: number
  rest?: number
  group?: string
  notes: string
  warnings: string[]
}

export type Field = 'plan' | 'day' | 'name' | 'type' | 'sets' | 'reps' | 'seconds' | 'weight' | 'rest' | 'group' | 'notes'

const HEADERS: Record<Field, string[]> = {
  plan: ['scheda', 'programma'],
  day: ['giorno', 'allenamento', 'seduta', 'day'],
  name: ['esercizio', 'nome', 'nome esercizio'],
  type: ['tipo'],
  sets: ['serie', 'set', 'sets'],
  reps: ['ripetizioni', 'rip', 'reps'],
  seconds: ['secondi', 'tempo', 'durata'],
  weight: ['carico', 'peso', 'kg'],
  rest: ['recupero', 'riposo', 'pausa', 'rec'],
  group: ['superserie', 'gruppo', 'circuito'],
  notes: ['note', 'nota'],
}

/** Campo della tabella a cui corrisponde un'intestazione di colonna (es. «Rip» → ripetizioni), o null. */
export function headerField(cell: string): Field | null {
  const h = normalize(cell)
  if (!h) return null
  return (Object.keys(HEADERS) as Field[]).find((f) => HEADERS[f].includes(h)) ?? null
}

export const TEMPLATE_COLUMNS = ['scheda', 'giorno', 'esercizio', 'tipo', 'serie', 'ripetizioni', 'secondi', 'carico', 'recupero', 'superserie', 'note']

export interface TableResult {
  rows: ImportRow[]
  problems: string[] // cose che impediscono di leggere righe o colonne (mostrate in revisione)
}

export const DEFAULT_PLAN_NAME = 'Scheda importata'
export const DEFAULT_DAY_NAME = 'Allenamento'

/** Converte la tabella letta dal file (prima riga = intestazioni) in righe di importazione. Scheda e giorno vuoti ripetono quelli sopra. */
export function tableToRows(table: string[][]): TableResult {
  const problems: string[] = []
  const nonEmpty = table.map((r, i) => ({ r, line: i + 1 })).filter(({ r }) => r.some((c) => c.trim() !== ''))
  if (nonEmpty.length === 0) return { rows: [], problems: ['Il file è vuoto.'] }
  const header = nonEmpty[0].r.map((c) => normalize(c))
  const col = {} as Record<Field, number>
  for (const f of Object.keys(HEADERS) as Field[]) col[f] = header.findIndex((h) => HEADERS[f].includes(h))
  if (col.name < 0) return { rows: [], problems: ['Non trovo la colonna «esercizio». Controlla la riga delle intestazioni o scarica il template.'] }

  const cell = (r: string[], f: Field) => (col[f] >= 0 ? (r[col[f]] ?? '').trim() : '')
  const rows: ImportRow[] = []
  let planName = ''
  let dayName = ''
  for (const { r, line } of nonEmpty.slice(1)) {
    const name = cell(r, 'name')
    if (!name) {
      problems.push(`Riga ${line}: manca il nome dell'esercizio, riga ignorata.`)
      continue
    }
    planName = cell(r, 'plan') || planName
    dayName = cell(r, 'day') || dayName
    const warnings: string[] = []
    const take = <T>(p: Parsed<T>, label: string): T | undefined => {
      if (p.error) warnings.push(`${label}: ${p.error}`)
      return p.value
    }
    rows.push({
      line,
      planName: planName || DEFAULT_PLAN_NAME,
      dayName: dayName || DEFAULT_DAY_NAME,
      name,
      typeHint: take(parseTypeHint(cell(r, 'type')), 'Tipo'),
      sets: take(parseNumber(cell(r, 'sets')), 'Serie'),
      reps: take(parseNumber(cell(r, 'reps')), 'Ripetizioni'),
      seconds: take(parseDuration(cell(r, 'seconds')), 'Secondi'),
      weight: take(parseNumber(cell(r, 'weight')), 'Carico'),
      rest: take(parseDuration(cell(r, 'rest')), 'Recupero'),
      group: cell(r, 'group') || undefined,
      notes: cell(r, 'notes'),
      warnings,
    })
  }
  if (rows.length === 0) problems.push('Non ho trovato nessun esercizio da importare.')
  return { rows, problems }
}

// ---------- Abbinamento agli esercizi del database ----------

export interface MatchResult {
  /** sure: abbinamento affidabile · check: probabile, da controllare · weak: solo parole in comune, non si abbina da solo · none: nessun candidato */
  status: 'sure' | 'check' | 'weak' | 'none'
  best?: Exercise
  candidates: Exercise[] // i migliori, dal più probabile
}

const MAX_CANDIDATES = 5
const STOPWORDS = new Set(['con', 'di', 'a', 'al', 'alla', 'da', 'il', 'la', 'in', 'e'])

/** Punteggio massimo possibile per una ricerca di n parole (serve a stimare quanto è sicuro un abbinamento). */
const maxScore = (n: number) => 3 * n + 2 + 1.5

function rank(query: string, exercises: Exercise[], options: SearchOptions): { exercise: Exercise; score: number }[] {
  const out: { exercise: Exercise; score: number }[] = []
  for (const exercise of exercises) {
    if (exercise.deleted) continue
    const score = matchScore(exercise, query, options)
    if (score > 0) out.push({ exercise, score })
  }
  return out.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name, 'it'))
}

/** Propone gli esercizi del database per un nome importato. «sure» solo se il nome coincide o vince con netto margine. */
export function matchExercise(name: string, exercises: Exercise[], options: SearchOptions = {}): MatchResult {
  const norm = normalize(name)
  if (!norm) return { status: 'none', candidates: [] }

  // nome identico (esercizio o nome personale)
  const exact = exercises.filter((e) => !e.deleted && [e.name, ...(options.aliases?.get(e.id) ?? [])].some((t) => normalize(t) === norm))
  if (exact.length === 1) return { status: 'sure', best: exact[0], candidates: [exact[0]] }
  if (exact.length > 1) return { status: 'check', best: exact[0], candidates: exact.slice(0, MAX_CANDIDATES) }

  const words = norm.split(' ')
  const ranked = rank(name, exercises, options)
  if (ranked.length > 0) {
    const [first, second] = ranked
    // «sicuro» solo se l'esercizio non ha più di una parola in più del nome cercato (altrimenti è un'altra variante: da controllare)
    const extraWords = normalize(first.exercise.name).split(' ').length - words.length
    const strong = extraWords <= 1 && first.score >= maxScore(words.length) * 0.8 && (!second || first.score - second.score >= 0.5)
    return { status: strong ? 'sure' : 'check', best: first.exercise, candidates: ranked.slice(0, MAX_CANDIDATES).map((r) => r.exercise) }
  }

  // nessuna corrispondenza completa: si prova togliendo parole (prima le meno importanti, poi le ultime)
  const core = words.filter((w) => !STOPWORDS.has(w))
  for (let n = core.length - 1; n >= 1; n--) {
    const partial = rank(core.slice(0, n).join(' '), exercises, options)
    if (partial.length > 0) return { status: 'weak', best: partial[0].exercise, candidates: partial.slice(0, MAX_CANDIDATES).map((r) => r.exercise) }
  }
  return { status: 'none', candidates: [] }
}

// ---------- Revisione e costruzione ----------

export type Choice =
  | { kind: 'exercise'; exercise: Exercise }
  | { kind: 'custom'; name: string; type: ExerciseType }
  | { kind: 'skip' }

export interface ReviewItem {
  row: ImportRow
  match: MatchResult
  choice: Choice
  manual: boolean // l'utente ha cambiato l'abbinamento proposto
}

/** Scelta iniziale: l'abbinamento proposto se affidabile, altrimenti un esercizio personalizzato col nome importato (i suggerimenti restano selezionabili). */
export function initialChoice(row: ImportRow, match: MatchResult): Choice {
  if (match.best && (match.status === 'sure' || match.status === 'check')) return { kind: 'exercise', exercise: match.best }
  return { kind: 'custom', name: row.name, type: guessType(row) }
}

/** Tipo di esercizio dedotto dalle colonne quando l'esercizio non è nel database. */
export function guessType(row: ImportRow): ExerciseType {
  if (row.typeHint) return row.typeHint
  if (row.seconds !== undefined && row.reps === undefined && row.weight === undefined) return 'timed'
  return row.weight !== undefined && row.weight > 0 ? 'weight_reps' : row.reps !== undefined && row.weight === undefined ? 'bodyweight' : 'weight_reps'
}

export function buildReview(rows: ImportRow[], exercises: Exercise[], options: SearchOptions = {}): ReviewItem[] {
  return rows.map((row) => {
    const match = matchExercise(row.name, exercises, options)
    return { row, match, choice: initialChoice(row, match), manual: false }
  })
}

export interface BuiltImport {
  plans: Plan[]
  customExercises: Exercise[]
  aliases: Alias[]
}

const groupKind = (label: string) => (/^circuit/i.test(label.trim()) ? 'circuit' : 'superset')

/**
 * Costruisce le schede dalle righe riviste. Righe «salta» escluse; stesso nome personalizzato = stesso esercizio.
 * Righe consecutive dello stesso giorno con la stessa etichetta di superserie formano un gruppo (recupero del gruppo = quello dell'ultima riga).
 */
export function buildImport(items: ReviewItem[], defaultRestSeconds: number, existingAliases: Alias[] = []): BuiltImport {
  const customs = new Map<string, Exercise>()
  const customFor = (name: string, type: ExerciseType): Exercise => {
    const key = normalize(name)
    let ex = customs.get(key)
    if (!ex) {
      ex = { id: `c:${uuid()}`, source: 'custom', name: name.trim(), type, equipment: 'other', primaryMuscles: [], secondaryMuscles: [], images: [] }
      customs.set(key, ex)
    }
    return ex
  }

  const plans = new Map<string, Plan>()
  const dayKeys = new Map<string, { day: PlanDay; lastGroup?: string; groupId?: string }>()

  for (const { row, choice } of items) {
    if (choice.kind === 'skip') continue
    const exercise = choice.kind === 'exercise' ? choice.exercise : customFor(choice.name, choice.type)
    let plan = plans.get(row.planName)
    if (!plan) {
      plan = newPlan(row.planName)
      plans.set(row.planName, plan)
    }
    const dayKey = `${row.planName}\u0000${row.dayName}`
    let state = dayKeys.get(dayKey)
    if (!state) {
      state = { day: newDay(row.dayName) }
      dayKeys.set(dayKey, state)
      plan.days.push(state.day)
    }
    const day = state.day

    const pe = newPlanExercise(exercise, defaultRestSeconds)
    if (row.sets !== undefined && row.sets >= 1) pe.targetSets = Math.round(row.sets)
    if (row.rest !== undefined) pe.restSeconds = row.rest
    if (row.notes) pe.notes = row.notes
    if (exercise.type === 'timed' || exercise.type === 'cardio') {
      if (row.seconds !== undefined) pe.targetSeconds = row.seconds
    } else {
      if (row.reps !== undefined) pe.targetReps = Math.round(row.reps)
      if (row.weight !== undefined && exercise.type !== 'bodyweight') pe.targetWeight = row.weight
    }

    if (row.group) {
      if (state.lastGroup !== row.group) {
        state.lastGroup = row.group
        state.groupId = uuid()
        day.groups.push({ id: state.groupId, kind: groupKind(row.group), restAfterGroup: defaultRestSeconds } as PlanGroup)
      }
      pe.groupId = state.groupId
      const g = day.groups.find((x) => x.id === state!.groupId)!
      if (row.rest !== undefined) g.restAfterGroup = row.rest
    } else {
      state.lastGroup = undefined
      state.groupId = undefined
    }
    day.exercises.push(pe)
  }

  // gruppi con un solo esercizio o non contigui vengono sciolti
  for (const p of plans.values()) p.days = p.days.map((d) => normalizeDay(d))

  return {
    plans: [...plans.values()].filter((p) => p.days.some((d) => d.exercises.length > 0)).map((p) => ({ ...p, days: p.days.filter((d) => d.exercises.length > 0) })),
    customExercises: [...customs.values()],
    aliases: aliasesToAdd(items, existingAliases),
  }
}

/** Nomi importati da ricordare: solo dove l'utente ha corretto l'abbinamento a mano e il nome è diverso da quello dell'esercizio. */
function aliasesToAdd(items: ReviewItem[], existing: Alias[]): Alias[] {
  const out: Alias[] = []
  const seen = new Set(existing.map((a) => `${a.exerciseId}\u0000${normalize(a.text)}`))
  for (const { row, choice, manual } of items) {
    if (!manual || choice.kind !== 'exercise') continue
    const ex = choice.exercise
    if (normalize(row.name) === normalize(ex.name)) continue
    const key = `${ex.id}\u0000${normalize(row.name)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: uuid(), exerciseId: ex.id, text: row.name })
  }
  return out
}

// ---------- Template ----------

/** Template CSV (separatore `;` e BOM, così Excel italiano lo apre in colonne) con un esempio completo. */
export function templateCsv(): string {
  const rows = [
    TEMPLATE_COLUMNS,
    ['La mia scheda', 'Push', 'Panca piana con bilanciere', 'carico', '4', '8', '', '60', '2:00', '', ''],
    ['', '', 'Croci ai cavi', 'carico', '3', '12', '', '15', '60', 'A', 'Superserie con le alzate'],
    ['', '', 'Alzate laterali', 'carico', '3', '15', '', '8', '60', 'A', ''],
    ['', 'Gambe', 'Squat con bilanciere', 'carico', '4', '6', '', '80', '2:30', '', ''],
    ['', '', 'Plank', 'tempo', '3', '', '45', '', '60', '', ''],
  ]
  const esc = (c: string) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n'
}
