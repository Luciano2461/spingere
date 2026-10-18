import type { PdfItem } from '../domain/importPdf'
import { ImportFileError } from './importFile'

const MAX_PAGES = 30

/**
 * Estrae dal PDF i frammenti di testo con le coordinate (pdf.js, caricato solo quando serve; il PDF resta sul dispositivo).
 * Si usa la build «legacy» di pdf.js, compatibile anche con versioni di Safari meno recenti.
 */
export async function extractPdfPages(file: File): Promise<PdfItem[][]> {
  try {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const pages: PdfItem[][] = []
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const content = await (await doc.getPage(n)).getTextContent()
      pages.push(
        content.items.flatMap((it) =>
          'str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height || Math.abs(it.transform[3]) }] : [],
        ),
      )
    }
    await doc.destroy()
    return pages
  } catch (e) {
    const name = (e as { name?: string })?.name
    if (name === 'PasswordException') throw new ImportFileError('Il PDF è protetto da password: toglila e riprova.')
    throw new ImportFileError('Non riesco a leggere il PDF. Prova con un altro file o usa il template CSV.')
  }
}
