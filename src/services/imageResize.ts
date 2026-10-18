import { fitSize } from '../domain/image'

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/** Decodifica la foto rispettando l'orientamento EXIF. Su Safari più vecchi `createImageBitmap` con opzioni non esiste: si ripiega su un normale <img>. */
async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('Non riesco a leggere questa immagine. Prova con un\'altra foto (JPEG o PNG).')
    }
  }
}

/** Ridimensiona una foto (da fotocamera o libreria) a max×max px e la comprime in JPEG: leggera da salvare e da esportare nel backup. */
export async function resizePhoto(file: File, max = 800, quality = 0.82): Promise<Blob> {
  const img = await decode(file)
  try {
    const { width, height } = fitSize(img.width, img.height, max)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas non disponibile')
    ctx.drawImage(img.source, 0, 0, width, height)
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione immagine fallita'))), 'image/jpeg', quality),
    )
  } finally {
    img.release()
  }
}
