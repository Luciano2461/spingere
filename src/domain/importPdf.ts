import { headerField, type Field } from './importPlan'

// Da un PDF testuale a una tabella di righe da importare. Lavora sui frammenti di testo con coordinate (estratti da pdf.js in services/pdfText.ts):
// ricompone le righe, riconosce una tabella con intestazioni oppure righe libere del tipo «Panca piana 4x8 60kg rec 90s».
// Il risultato passa da tableToRows() e dalla schermata di revisione: l'euristica può sbagliare, l'utente corregge.

export interface PdfItem {
  str: string
  x: number
  y: number // origine in basso, come in PDF: y più grande = più in alto
  width: number
  height: number
}

export interface PdfLine {
  page: number
  cells: { x: number; text: string }[]
  text: string
}

export interface PdfParse {
  table: string[][]
  mode: 'table' | 'text'
  unrecognized: { page: number; text: string }[]
  hasText: boolean
}

// ---------- Frammenti → righe ----------

/** Ricompone le righe di una pagina: frammenti alla stessa altezza, ordinati da sinistra, uniti in celle quando sono vicini. */
export function itemsToLines(items: PdfItem[], page = 1): PdfLine[] {
  // pdf.js inserisce anche frammenti di soli spazi, lunghi quanto il vuoto tra due colonne: non vanno trattati come testo
  const usable = items.filter((i) => i.str.trim() !== '')
  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: PdfItem[][] = []
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= Math.max(2, Math.min(r[0].height, it.height) * 0.4))
    if (row) row.push(it)
    else rows.push([it])
  }
  const lines: PdfLine[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    const cells: { x: number; text: string; end: number }[] = []
    for (const it of row) {
      const last = cells[cells.length - 1]
      const charW = it.str.length > 0 && it.width > 0 ? it.width / it.str.length : 5
      if (last && it.x - last.end <= charW * 2.5) {
        const glue = it.x - last.end > charW * 0.25 && !/\s$/.test(last.text) && !/^\s/.test(it.str) ? ' ' : ''
        last.text += glue + it.str
        last.end = it.x + it.width
      } else cells.push({ x: it.x, text: it.str, end: it.x + it.width })
    }
    const clean = cells.map((c) => ({ x: c.x, text: c.text.replace(/\s+/g, ' ').trim() })).filter((c) => c.text !== '')
    if (clean.length) lines.push({ page, cells: clean, text: clean.map((c) => c.text).join(' ') })
  }
  return lines
}

// ---------- Riconoscimento ----------

const DAY_WORDS = /^(giorno|day|allenamento|workout|seduta|sessione)\b/i
const DAY_NAMES = /^(push|pull|legs?|gambe|petto|schiena|spalle|braccia|upper|lower|full ?body|addome|core|cardio)\b/i
const NOISE = /^(pagina|page)\s*\d+(\s*(di|of|\/)\s*\d+)?$|^\d{1,3}$/i

/** Una riga senza numeri che sembra l'intestazione di un giorno (non un esercizio). */
export function looksLikeHeading(text: string): boolean {
  const t = text.trim().replace(/[:：]$/, '')
  if (!t || /\d\s*[x×]\s*\d/i.test(t)) return false
  if (DAY_WORDS.test(t) || DAY_NAMES.test(t)) return true
  if (/:\s*$/.test(text.trim())) return true
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  return letters.length >= 3 && t === t.toUpperCase() && t.split(/\s+/).length <= 5
}

const stripBullet = (t: string) => t.replace(/^\s*(?:\d{1,2}[.)]|[•·▪●○□■▢*\-–—])\s+/, '').trim()

export interface TextParsed {
  name: string
  sets?: string
  reps?: string
  seconds?: string
  weight?: string
  rest?: string
  group?: string
  hasData: boolean
}

const NUM = '\\d{1,3}(?:[.,]\\d+)?'
const RANGE = `${NUM}(?:\\s*[-–/]\\s*${NUM})?`

/** Estrae da una riga libera serie, ripetizioni/tempo, carico, recupero e nome. */
export function parseExerciseText(raw: string): TextParsed {
  let t = stripBullet(raw)
  const out: TextParsed = { name: '', hasData: false }
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = t.match(re)
    if (!m) return false
    fn(m)
    t = (t.slice(0, m.index) + ' ' + t.slice((m.index ?? 0) + m[0].length)).trim()
    out.hasData = true
    return true
  }
  const noDash = (s: string) => s.replace(/\s+/g, '').replace('/', '-')

  // gruppo (A1, B2…) a inizio riga: superserie
  const g = t.match(/^([A-H])\d[\s.):-]+/)
  if (g) {
    out.group = g[1]
    t = t.slice(g[0].length).trim()
  }

  // recupero con parola chiave, anche tra parentesi
  take(new RegExp(`\\(?\\b(?:rec(?:upero)?|rest|pausa|riposo)\\b\\s*[:.=]?\\s*(\\d+(?:[:'’]\\d{1,2})?(?:[.,]\\d+)?\\s*(?:min|m|sec|s|"|″|''|'|’)?)\\)?`, 'i'), (m) => (out.rest = m[1].replace(/''|″/g, 's').replace(/"/g, 's').replace(/’/g, "'").trim()))

  // il carico prima di tutto: «5 × 5 - 100 kg» non è l'intervallo 5-100
  take(/(\d+(?:[.,]\d+)?)\s*kg\b/i, (m) => (out.weight = m[1]))

  // serie × tempo (3x30", 4 x 45s) prima di serie × ripetizioni
  if (!take(new RegExp(`(\\d{1,2})\\s*[x×*]\\s*(\\d{1,3})\\s*(?:"|″|''|sec\\w*|s\\b)`, 'i'), (m) => ((out.sets = m[1]), (out.seconds = m[2])))) {
    if (!take(new RegExp(`(\\d{1,2})\\s*[x×*]\\s*(${RANGE})(?:\\s*(?:rip\\w*|reps?))?`, 'i'), (m) => ((out.sets = m[1]), (out.reps = noDash(m[2])))))
      take(new RegExp(`(\\d{1,2})\\s*(?:serie|set|sets)\\s*(?:da|x|×|di)?\\s*(${RANGE})\\s*(?:rip\\w*|reps?)?`, 'i'), (m) => ((out.sets = m[1]), (out.reps = noDash(m[2]))))
  }

  out.name = t
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/^[\s\-–—:;,.|/\\]+|[\s\-–—:;,.|/\\]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return out
}

// ---------- Tabella con intestazioni ----------

const HEADER_FIELDS = (cells: { text: string }[]) => cells.map((c) => headerField(c.text))
const isHeaderLine = (l: PdfLine) => {
  const f = HEADER_FIELDS(l.cells)
  return f.filter(Boolean).length >= 3 && f.includes('name')
}

const COLUMN_ORDER: Field[] = ['plan', 'day', 'name', 'type', 'sets', 'reps', 'seconds', 'weight', 'rest', 'group', 'notes']
const COLUMN_LABEL: Record<Field, string> = {
  plan: 'scheda', day: 'giorno', name: 'esercizio', type: 'tipo', sets: 'serie', reps: 'ripetizioni', seconds: 'secondi', weight: 'carico', rest: 'recupero', group: 'superserie', notes: 'note',
}

/** Ultima intestazione di giorno (riga con una sola cella) che precede l'indice. */
function headingBefore(lines: PdfLine[], idx: number): string {
  for (let i = idx - 1; i >= 0; i--) if (lines[i].cells.length === 1 && looksLikeHeading(lines[i].text)) return lines[i].text.replace(/[:：]$/, '').trim()
  return ''
}

function tableFromHeader(lines: PdfLine[], headerIdx: number): { table: string[][]; unrecognized: PdfParse['unrecognized'] } | null {
  const header = lines[headerIdx]
  const cols = header.cells.map((c) => ({ x: c.x, field: headerField(c.text) })).filter((c): c is { x: number; field: Field } => c.field !== null)
  if (cols.length < 3) return null
  const fields = [...new Set(cols.map((c) => c.field))]
  const hasDay = fields.includes('day')
  const outFields = hasDay ? fields : (['day', ...fields] as Field[])
  const ordered = outFields.sort((a, b) => COLUMN_ORDER.indexOf(a) - COLUMN_ORDER.indexOf(b))
  const table: string[][] = [ordered.map((f) => COLUMN_LABEL[f])]
  const unrecognized: PdfParse['unrecognized'] = []
  let day = headingBefore(lines, headerIdx)
  const tol = 6
  for (const line of lines.slice(headerIdx + 1)) {
    if (isHeaderLine(line) || NOISE.test(line.text)) continue
    if (line.cells.length === 1 && looksLikeHeading(line.text)) {
      day = line.text.replace(/[:：]$/, '').trim()
      continue
    }
    const row: Record<string, string> = {}
    for (const cell of line.cells) {
      let col = cols[0]
      for (const c of cols) if (c.x <= cell.x + tol) col = c
      row[col.field] = row[col.field] ? `${row[col.field]} ${cell.text}` : cell.text
    }
    if (!row.name) {
      unrecognized.push({ page: line.page, text: line.text })
      continue
    }
    if (!hasDay) row.day = day
    table.push(ordered.map((f) => row[f] ?? ''))
  }
  return { table, unrecognized }
}

// ---------- Righe libere ----------

function tableFromText(lines: PdfLine[]): { table: string[][]; unrecognized: PdfParse['unrecognized'] } {
  const table: string[][] = [['giorno', 'esercizio', 'serie', 'ripetizioni', 'secondi', 'carico', 'recupero', 'superserie']]
  const unrecognized: PdfParse['unrecognized'] = []
  let day = ''
  let started = false // finché non c'è un giorno o una riga con valori, le righe corte sono titoli del documento, non esercizi
  for (const line of lines) {
    if (NOISE.test(line.text)) continue
    const p = parseExerciseText(line.text)
    if (!p.hasData) {
      if (looksLikeHeading(line.text)) {
        day = line.text.replace(/[:：]$/, '').trim()
        started = true
        continue
      }
      if (!started) {
        unrecognized.push({ page: line.page, text: line.text })
        continue
      }
      const words = p.name.split(/\s+/).filter(Boolean)
      // una riga corta senza numeri è probabilmente un esercizio senza valori; una riga lunga è testo (note, avvertenze)
      if (words.length >= 1 && words.length <= 6 && /[A-Za-zÀ-ÿ]{3}/.test(p.name)) table.push([day, p.name, '', '', '', '', '', p.group ?? ''])
      else unrecognized.push({ page: line.page, text: line.text })
      continue
    }
    if (!/[A-Za-zÀ-ÿ]{3}/.test(p.name)) {
      unrecognized.push({ page: line.page, text: line.text })
      continue
    }
    started = true
    table.push([day, p.name, p.sets ?? '', p.reps ?? '', p.seconds ?? '', p.weight ?? '', p.rest ?? '', p.group ?? ''])
  }
  return { table, unrecognized }
}

// ---------- Ingresso principale ----------

/** `pages`: frammenti di testo di ogni pagina, in ordine. */
export function parsePdfPages(pages: PdfItem[][]): PdfParse {
  const lines = pages.flatMap((items, i) => itemsToLines(items, i + 1))
  const chars = pages.reduce((n, p) => n + p.reduce((k, it) => k + it.str.trim().length, 0), 0)
  if (chars < 20) return { table: [], mode: 'text', unrecognized: [], hasText: false }

  const headerIdx = lines.findIndex(isHeaderLine)
  if (headerIdx >= 0) {
    const t = tableFromHeader(lines, headerIdx)
    if (t && t.table.length > 1) {
      return { table: t.table, mode: 'table', unrecognized: t.unrecognized, hasText: true }
    }
  }
  const t = tableFromText(lines)
  return { table: t.table, mode: 'text', unrecognized: t.unrecognized, hasText: true }
}

