import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { SpingereDB } from './db'
import { resetImage, setBuiltinImage, setPhoto } from './images'

const blob = (t: string) => new Blob([t], { type: 'image/jpeg' })

describe('immagine scelta dall\'utente', () => {
  it('sceglie un\'immagine di un altro esercizio', async () => {
    const db = new SpingereDB('img-1')
    await db.open()
    await setBuiltinImage(db, 'b:a', 'altro/0.webp')
    expect(await db.imageChoices.get('b:a')).toEqual({ exerciseId: 'b:a', kind: 'builtin', path: 'altro/0.webp' })
    db.close()
  })

  it('una nuova foto sostituisce la precedente senza lasciare file orfani', async () => {
    const db = new SpingereDB('img-2')
    await db.open()
    await setPhoto(db, 'b:a', blob('uno'))
    await setPhoto(db, 'b:a', blob('due'))
    expect(await db.photos.where('exerciseId').equals('b:a').count()).toBe(1)
    const choice = await db.imageChoices.get('b:a')
    expect(choice?.kind).toBe('photo')
    db.close()
  })

  it('scegliere un\'immagine dell\'app elimina la foto personale', async () => {
    const db = new SpingereDB('img-3')
    await db.open()
    await setPhoto(db, 'b:a', blob('uno'))
    await setBuiltinImage(db, 'b:a', 'x/0.webp')
    expect(await db.photos.count()).toBe(0)
    db.close()
  })

  it('ripristina l\'originale e non tocca gli altri esercizi', async () => {
    const db = new SpingereDB('img-4')
    await db.open()
    await setPhoto(db, 'b:a', blob('a'))
    await setPhoto(db, 'b:b', blob('b'))
    await resetImage(db, 'b:a')
    expect(await db.imageChoices.get('b:a')).toBeUndefined()
    expect(await db.imageChoices.get('b:b')).toBeDefined()
    expect(await db.photos.count()).toBe(1)
    db.close()
  })
})
