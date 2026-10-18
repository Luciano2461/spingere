// Lettura del file scelto dall'utente (CSV o XLSX) come tabella di testo. Nessun dato lascia il dispositivo.

export class ImportFileError extends Error {}

const pad = (n: number) => String(n).padStart(2, '0')

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  // Excel salva «1:30» come orario (1 h 30 min): qui vale come minuti:secondi, come l'ha scritto l'utente
  if (v instanceof Date) return `${v.getUTCHours()}:${pad(v.getUTCMinutes())}`
  return String(v)
}

function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer) // CSV salvati da Excel senza UTF-8
  }
}

/** Legge un .csv/.txt o la prima scheda di un .xlsx. */
export async function readTable(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xls')) throw new ImportFileError('Il formato .xls (Excel vecchio) non è supportato: salva il file come .xlsx o .csv.')
  if (name.endsWith('.xlsx')) {
    try {
      const { readSheet } = await import('read-excel-file/universal') // caricata solo quando serve
      const rows = await readSheet(file)
      return rows.map((r) => r.map(cellToString))
    } catch {
      throw new ImportFileError('Non riesco a leggere il file Excel. Prova a salvarlo di nuovo come .xlsx o come .csv.')
    }
  }
  const { parseCsv } = await import('../domain/importPlan')
  return parseCsv(decodeText(await file.arrayBuffer()))
}
