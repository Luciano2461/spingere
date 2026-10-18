// Cache delle immagini degli esercizi. Stesso nome della cache runtime del service worker (vite.config.ts).
export const IMAGE_CACHE = 'exercise-images'

export const imageUrl = (path: string) => `${import.meta.env.BASE_URL}exercises/${path}`

export async function cachedImageCount(): Promise<number> {
  if (!('caches' in window)) return 0
  return (await (await caches.open(IMAGE_CACHE)).keys()).length
}

/** Scarica tutte le immagini in cache (uso offline). Riprende da dove era rimasto: salta quelle già presenti. */
export async function cacheAllImages(
  paths: string[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const cache = await caches.open(IMAGE_CACHE)
  let done = 0
  const queue = [...paths]
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const path = queue.shift()!
      const url = imageUrl(path)
      if (!(await cache.match(url))) {
        const res = await fetch(url, { signal })
        if (res.ok) await cache.put(url, res)
      }
      onProgress(++done, paths.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
}
