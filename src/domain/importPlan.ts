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
  nameEn?: string // nome inglese facoltativo: aiuta ad abbinare l'esercizio del database
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

export type Field = 'plan' | 'day' | 'name' | 'nameEn' | 'type' | 'sets' | 'reps' | 'seconds' | 'weight' | 'rest' | 'group' | 'notes'

const HEADERS: Record<Field, string[]> = {
  plan: ['scheda', 'programma'],
  day: ['giorno', 'allenamento', 'seduta', 'day'],
  name: ['esercizio', 'nome', 'nome esercizio'],
  nameEn: ['nome inglese', 'esercizio inglese', 'inglese', 'english', 'english name', 'esercizio en'],
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

export const TEMPLATE_COLUMNS = ['scheda', 'giorno', 'esercizio', 'nome inglese', 'tipo', 'serie', 'ripetizioni', 'secondi', 'carico', 'recupero', 'superserie', 'note']

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
      nameEn: cell(r, 'nameEn') || undefined,
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
const STOPWORDS = new Set(['con', 'di', 'a', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'da', 'dal', 'dalla', 'il', 'lo', 'la', 'le', 'i', 'gli', 'in', 'e', 'su', 'sul', 'sulla', 'sui', 'del', 'della', 'dei', 'per', 'the', 'with', 'on'])

/** Punteggio massimo possibile per una ricerca di n parole (serve a stimare quanto è sicuro un abbinamento). */
const maxScore = (n: number) => 3 * n + 2 + 1.5

/**
 * Nome importato ripulito da ciò che non è il nome: numerazione («1.», «A)»), inclinazioni («30°»), serie×ripetizioni («4x8»),
 * carichi e recuperi scritti nella stessa cella. Se non resta niente si tiene il nome com'era.
 */
export function cleanImportName(raw: string): string {
  let s = raw.toLowerCase()
  // «panca 30°», «spinte manubri panca 45»: i gradi indicano la panca inclinata
  if (/\b(panca|spinte|distensioni|croci|chest press|bench)\b/.test(s) && /\d+\s*(°|gradi\b)|\bpanca\s+\d+\b/.test(s) && !/inclinat|declinat/.test(s)) s += ' inclinata'
  s = s
    .replace(/^\s*(\d{1,2}|[a-z])\s*[.)\]:-]\s+/, '')
    .replace(/\b(rec|recupero|riposo|pausa)\b.*$/, '')
    .replace(/\d+\s*(°|gradi\b)/g, ' ')
    .replace(/\b\d+\s*[x×*]\s*\d+(\s*[-/]\s*\d+)*\b/g, ' ')
    .replace(/\b\d+([.,]\d+)?\s*(kg|s|sec|min|')?(?=\s|$)/g, ' ')
  return normalize(s) || normalize(raw)
}

/** Parole che indicano l'attrezzo: in una scheda si scrivono spesso senza «con» («alzate laterali manubri»). */
const EQUIPMENT_WORDS: Record<string, string> = {
  manubri: 'dumbbell', manubrio: 'dumbbell', db: 'dumbbell', dumbbell: 'dumbbell', dumbbells: 'dumbbell',
  bilanciere: 'barbell', bb: 'barbell', barbell: 'barbell',
  cavi: 'cable', cavo: 'cable', cable: 'cable', cables: 'cable',
  macchina: 'machine', machine: 'machine', macchinario: 'machine',
  kettlebell: 'kettlebells', kb: 'kettlebells',
  elastico: 'bands', elastici: 'bands', band: 'bands', bands: 'bands',
}

/** Varianti particolari: finiscono in fondo se la scheda non le nomina. */
const EXOTIC = ['elastic', 'catene', 'chains', 'bands', 'fitball', 'exercise ball', 'bosu', 'powerlifting', 'kettlebell', 'palla medica', 'medicine ball', 'trx', 'anelli', 'a leve', 'leverage', 'jefferson', 'zercher', 'ghigliottina', 'guillotine', 'pin', 'board', 'isometric']

function rankImport(name: string, exercises: Exercise[], searchOptions: SearchOptions): { exercise: Exercise; score: number }[] {
  const options = { ...searchOptions, wholeWords: true }
  const words = name.split(' ').filter((w) => w && !STOPWORDS.has(w))
  const equip = words.filter((w) => w in EQUIPMENT_WORDS)
  const core = words.filter((w) => !(w in EQUIPMENT_WORDS))
  const query = (core.length ? core : words).join(' ')
  const common = searchOptions.commonNames?.[words.join(' ')] ?? searchOptions.commonNames?.[name] // il nome comune vince sulla somiglianza
  const out: { exercise: Exercise; score: number }[] = []
  for (const exercise of exercises) {
    if (exercise.deleted) continue
    // tutte le parole nel nome: vale di più; altrimenti l'attrezzo può corrispondere al solo campo «attrezzo»
    const full = equip.length ? matchScore(exercise, words.join(' '), options) : 0
    let score = full > 0 ? full + 1.5 * equip.length : matchScore(exercise, query, options)
    if (exercise.id === common) score = Math.max(score, 1) + 4
    if (score <= 0) continue
    if (full <= 0) for (const w of equip) score += exercise.equipment === EQUIPMENT_WORDS[w] ? 0.5 : -2
    const text = normalize(`${exercise.name} ${exercise.nameOriginal ?? ''}`)
    for (const x of EXOTIC) if (` ${text} `.includes(` ${x} `) && !` ${name} `.includes(` ${x} `)) score -= 1.5
    if (score > 0) out.push({ exercise, score })
  }
  return out.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name, 'it'))
}

/** Sottoinsiemi di n parole, nell'ordine originale (al massimo qualche decina: i nomi sono corti). */
function subsetsOf(words: string[], n: number): string[][] {
  if (words.length > 8) return [words.slice(0, n)]
  const out: string[][] = []
  const walk = (start: number, acc: string[]) => {
    if (acc.length === n) return void out.push(acc)
    for (let i = start; i <= words.length - (n - acc.length); i++) walk(i + 1, [...acc, words[i]])
  }
  walk(0, [])
  return out
}

const STATUS_RANK: Record<MatchResult['status'], number> = { sure: 3, check: 2, weak: 1, none: 0 }

/**
 * Propone gli esercizi del database per un nome importato. «sure» solo se il nome coincide (anche con un nome personale,
 * un nome comune da palestra o il nome inglese) o vince con netto margine. `english` è il nome inglese facoltativo della riga.
 */
export function matchExercise(name: string, exercises: Exercise[], options: SearchOptions = {}, english?: string): MatchResult {
  const it = matchOne(name, exercises, options)
  if (!english?.trim() || it.status === 'sure') return it
  const en = matchOne(english, exercises, options)
  if (STATUS_RANK[en.status] > STATUS_RANK[it.status]) return en
  if (en.best && it.best && en.best.id === it.best.id && it.status === 'check') return { ...it, status: 'sure' } // i due nomi concordano
  return it
}

function matchOne(raw: string, exercises: Exercise[], options: SearchOptions): MatchResult {
  const norm = cleanImportName(raw)
  if (!norm) return { status: 'none', candidates: [] }

  // nome identico: prima i nomi corretti dall'utente, poi i nomi comuni da palestra, poi nome italiano e inglese del database
  const live = exercises.filter((e) => !e.deleted)
  const byUser = live.filter((e) => (options.aliases?.get(e.id) ?? []).some((t) => normalize(t) === norm))
  const commonId = options.commonNames?.[norm]
  const byCommon = byUser.length ? [] : live.filter((e) => e.id === commonId)
  let exact = byUser.length ? byUser : byCommon
  if (exact.length === 0) {
    exact = live.filter((e) => normalize(e.name) === norm)
    if (exact.length === 0) exact = live.filter((e) => e.nameOriginal && normalize(e.nameOriginal) === norm)
  }
  if (exact.length === 1) return { status: 'sure', best: exact[0], candidates: [exact[0], ...rankImport(norm, exercises, options).map((r) => r.exercise).filter((e) => e.id !== exact[0].id)].slice(0, MAX_CANDIDATES) }
  if (exact.length > 1) return { status: 'check', best: exact[0], candidates: exact.slice(0, MAX_CANDIDATES) }

  const words = norm.split(' ').filter((w) => !STOPWORDS.has(w))
  const ranked = rankImport(norm, exercises, options)
  if (ranked.length > 0) {
    const [first, second] = ranked
    // «sicuro» solo se l'esercizio non ha più di una parola in più del nome cercato (altrimenti è un'altra variante: da controllare)
    const bare = (t: string) => normalize(t.replace(/\([^)]*\)/g, ' ')).split(' ').filter((w) => !STOPWORDS.has(w)).length
    const extraWords = bare(first.exercise.name) - words.length
    const strong = extraWords <= 1 && first.score >= maxScore(words.length) * 0.8 && (!second || first.score - second.score >= 0.5)
    return { status: strong ? 'sure' : 'check', best: first.exercise, candidates: ranked.slice(0, MAX_CANDIDATES).map((r) => r.exercise) }
  }

  // nessuna corrispondenza completa: si prova togliendo parole (meno parole tolte = meglio). Se resta la maggior parte del nome
  // l'esercizio trovato è proposto «da controllare», altrimenti è solo un suggerimento («weak»)
  for (let n = words.length - 1; n >= 1; n--) {
    let best: { exercise: Exercise; score: number }[] = []
    for (const subset of subsetsOf(words, n)) {
      const partial = rankImport(subset.join(' '), exercises, options)
      if (partial.length && (!best.length || partial[0].score > best[0].score)) best = partial
    }
    if (best.length) {
      const status = n >= 2 && n / words.length >= 0.6 ? 'check' : 'weak'
      return { status, best: best[0].exercise, candidates: best.slice(0, MAX_CANDIDATES).map((r) => r.exercise) }
    }
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
    const match = matchExercise(row.name, exercises, options, row.nameEn)
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

// ---------- Testo incollato e istruzioni per un'AI ----------

/**
 * Testo incollato (es. la risposta di un'AI): se c'è un blocco di codice ``` si usa quello con le intestazioni; si scartano le frasi
 * prima delle intestazioni e quelle dopo la tabella (righe senza separatori).
 */
export function pastedTable(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  const blocks = [...clean.matchAll(/```[^\n]*\n([\s\S]*?)(```|$)/g)].map((m) => m[1])
  const isHeader = (l: string) => parseCsv(l)[0]?.some((c) => headerField(c) === 'name') ?? false
  const source = blocks.find((b) => b.split(/\r?\n/).some(isHeader)) ?? clean
  const lines = source.split(/\r?\n/)
  const start = Math.max(0, lines.findIndex(isHeader))
  const body = lines.slice(start).filter((l, i) => i === 0 || l.trim() === '' || /[;,\t]/.test(l))
  return parseCsv(body.join('\n').trim())
}

/** Istruzioni da incollare in un'intelligenza artificiale (ChatGPT, Claude, Gemini…) insieme alla propria scheda, per ottenere un CSV che l'app legge bene. */
export function aiInstructions(): string {
  return [
    "Converti la scheda di allenamento che ti allego (PDF, foto o testo) in un CSV da importare nell'app Spingere. Segui queste regole alla lettera.",
    '',
    'FORMATO',
    `- Prima riga, esattamente: ${TEMPLATE_COLUMNS.join(';')}`,
    '- Separatore punto e virgola (;). Una riga per esercizio, nello stesso ordine della scheda. Niente righe vuote, titoli o totali.',
    '- Se un valore contiene un punto e virgola, mettilo tra virgolette.',
    '',
    'COLONNE',
    '- scheda: il nome della scheda, solo nella prima riga (poi lascia vuoto).',
    '- giorno: il nome del giorno o della seduta (es. «Giorno A», «Push», «Lunedì»), nella prima riga di ogni giorno; nelle righe successive dello stesso giorno lascia vuoto.',
    '- esercizio: nome italiano completo e standard, con l\'attrezzo (es. «Panca piana con bilanciere», «Rematore con manubrio», «Lat machine presa larga», «Leg press»). Correggi gli errori di battitura. Non scrivere nel nome serie, ripetizioni, gradi, carichi o note.',
    '- nome inglese: il nome inglese standard dello stesso esercizio, come nei database di esercizi (es. «Barbell Bench Press», «One-Arm Dumbbell Row», «Wide-Grip Lat Pulldown», «Seated Cable Rows», «Lying Leg Curls»).',
    '- tipo: una sola di queste parole: carico (pesi, macchine, cavi), corpo libero, zavorra (a corpo libero con zavorra o assistenza), tempo (esercizi a tempo, es. plank), cardio.',
    '- serie: numero intero.',
    '- ripetizioni: numero intero oppure intervallo (es. 8-10). Se cambiano da serie a serie (es. 12/10/8) scrivi il numero più alto e riporta lo schema nelle note. Per «a cedimento» o «max» lascia vuoto e scrivilo nelle note.',
    '- secondi: solo per esercizi a tempo e cardio: la durata di una serie in secondi (10 minuti = 600).',
    '- carico: i kg di una serie, solo il numero (es. 60 oppure 12,5). Se è in libbre convertilo in kg. Vuoto se non è indicato.',
    '- recupero: in secondi (es. 90). Vuoto se non è indicato.',
    '- superserie: la stessa lettera (A, B, C…) per gli esercizi consecutivi da fare in superserie; «circuito 1», «circuito 2»… per i circuiti; altrimenti vuoto. Il recupero dell\'ultimo esercizio del gruppo è quello dopo il giro.',
    '- note: indicazioni tecniche, tempo di esecuzione, RPE/RIR, piramidali, drop set, varianti.',
    '',
    'ALTRO',
    '- Riscaldamento e defaticamento con una durata (es. 10 minuti di tapis roulant) vanno come cardio con i secondi; il resto senza serie né durata lascialo fuori.',
    '- Non inventare: se qualcosa non è chiaro, lascia vuoto e spiegalo nelle note.',
    '- Rispondi solo con il CSV dentro un unico blocco di codice, senza commenti prima o dopo.',
  ].join('\n')
}

// ---------- Template ----------

/** Template CSV (separatore `;` e BOM, così Excel italiano lo apre in colonne) con un esempio completo. */
export function templateCsv(): string {
  const rows = [
    TEMPLATE_COLUMNS,
    ['La mia scheda', 'Push', 'Panca piana con bilanciere', 'Barbell Bench Press', 'carico', '4', '8', '', '60', '2:00', '', ''],
    ['', '', 'Croci ai cavi', 'Cable Crossover', 'carico', '3', '12', '', '15', '60', 'A', 'Superserie con le alzate'],
    ['', '', 'Alzate laterali', 'Side Lateral Raise', 'carico', '3', '15', '', '8', '60', 'A', ''],
    ['', 'Gambe', 'Squat con bilanciere', 'Barbell Squat', 'carico', '4', '6', '', '80', '2:30', '', ''],
    ['', '', 'Plank', 'Plank', 'tempo', '3', '', '45', '', '60', '', ''],
  ]
  const esc = (c: string) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n'
}
