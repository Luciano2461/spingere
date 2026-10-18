import { liveQuery } from 'dexie'
import { db } from '../db/db'
import { DEFAULT_SETTINGS, type Settings } from '../domain/types'

/** Impostazioni dell'app, sempre aggiornate (si ricaricano da sole quando cambiano nel database). */
export const appSettings = $state<Settings>({ ...DEFAULT_SETTINGS })

liveQuery(() => db.settings.get('settings')).subscribe((s) => {
  if (s) Object.assign(appSettings, s)
})

export const weightStep = () => appSettings.weightStep ?? 2.5
export const soundEnabled = () => appSettings.restSound !== false

export const updateSettings = (patch: Partial<Settings>) => db.settings.update('settings', patch)
