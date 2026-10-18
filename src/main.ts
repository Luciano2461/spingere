import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { db } from './db/db'
import { ensureExercisesSeeded } from './db/seed'
import { loadActive } from './state/activeSession.svelte'
import './state/settings.svelte'

// Carica il database esercizi al primo avvio (e quando cambia versione).
loadActive().catch((err) => console.error('Caricamento allenamento fallito', err))
ensureExercisesSeeded(db).catch((err) => console.error('Caricamento esercizi fallito', err))

export default mount(App, { target: document.getElementById('app')! })
