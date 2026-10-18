export type ShareResult = 'shared' | 'downloaded' | 'cancelled'

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `spingere-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

/**
 * Su iPhone apre il foglio di condivisione (Salva su File, AirDrop, Mail…); altrimenti scarica il file.
 * Va chiamata subito dentro un tocco dell'utente (la Web Share API lo richiede).
 */
export async function shareOrDownload(content: string, filename: string, mime = 'application/json', title = 'Backup Spingere'): Promise<ShareResult> {
  const file = new File([content], filename, { type: mime })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // condivisione non riuscita (es. gesto scaduto): si ripiega sul download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export const readFileText = (file: File): Promise<string> => file.text()
