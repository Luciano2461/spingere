<script lang="ts">
  import { onMount } from 'svelte'
  import { liveQuery } from 'dexie'
  import { db } from '../db/db'
  import { isStandalone, requestPersistence, storageUsage } from '../services/storage'
  import { cacheAllImages, cachedImageCount } from '../services/assetCache'
  import { playRestEnd, unlockAudio } from '../services/audio'
  import { wakeLockState } from '../services/wakeLock.svelte'
  import { appSettings, soundEnabled, updateSettings, weightStep } from '../state/settings.svelte'
  import Stepper from '../ui/Stepper.svelte'

  let persisted = $state<boolean | null>(null)
  let usage = $state<{ usage: number; quota: number } | null>(null)
  let imagesTotal = $state(0)
  let imagesCached = $state(0)
  let downloading = $state(false)
  let error = $state('')
  const standalone = isStandalone()
  let soundMsg = $state('')

  function testSound() {
    unlockAudio() // dentro il tocco: su iOS è l'unico modo per sbloccare l'audio
    setTimeout(() => {
      soundMsg = playRestEnd()
        ? 'Hai sentito i tre bip? Se no: alza il volume e controlla che l\'interruttore laterale dell\'iPhone non sia su «Silenzioso».'
        : 'Audio non disponibile su questo dispositivo: resta il segnale visivo.'
    }, 80)
  }

  onMount(() => {
    requestPersistence().then((p) => (persisted = p))
    storageUsage().then((u) => (usage = u))
    cachedImageCount().then((n) => (imagesCached = n))
    const sub = liveQuery(() => db.exercises.toArray()).subscribe((list) => {
      imagesTotal = list.reduce((n, e) => n + e.images.length, 0)
    })
    return () => sub.unsubscribe()
  })

  async function downloadAll() {
    downloading = true
    error = ''
    try {
      const paths = (await db.exercises.toArray()).flatMap((e) => e.images)
      await cacheAllImages(paths, (done) => (imagesCached = done))
      imagesCached = await cachedImageCount()
      usage = await storageUsage()
    } catch {
      error = 'Download interrotto (connessione assente?). Riprova: riparte da dove si era fermato.'
      imagesCached = await cachedImageCount()
    } finally {
      downloading = false
    }
  }

  const backupDays = $derived(appSettings.lastBackupAt ? Math.floor((Date.now() - new Date(appSettings.lastBackupAt).getTime()) / 86400000) : null)
  const backupText = $derived(
    backupDays === null ? 'Non hai ancora fatto nessuna copia.' : backupDays <= 0 ? 'Ultima copia: oggi.' : `Ultima copia: ${backupDays} ${backupDays === 1 ? 'giorno' : 'giorni'} fa.`,
  )
  const protectedNote = $derived(
    persisted === null ? '' : persisted
      ? 'I dati sono protetti sul telefono, ma se perdi o cambi telefono servono le copie.'
      : standalone
        ? 'Il telefono potrebbe cancellare i dati se manca spazio: fai una copia ogni tanto.'
        : 'Installa l\'app sulla Home (Condividi → Aggiungi alla schermata Home): così i dati sono più al sicuro.',
  )

  const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MB'
</script>

<section>
  <h1>Impostazioni</h1>

  <a class="backup" class:alert={backupDays === null || backupDays > 30} href="#/impostazioni/backup">
    <strong>Salva una copia dei tuoi dati ›</strong>
    <span>{backupText}</span>
    {#if protectedNote}<span class="small">{protectedNote}</span>{/if}
  </a>

  <h2>Allenamento</h2>
  <ul>
    <li>
      <label class="switch">
        <input type="checkbox" checked={soundEnabled()} onchange={(e) => updateSettings({ restSound: e.currentTarget.checked })} />
        <span>Suono a fine recupero</span>
      </label>
      <button onclick={testSound}>Prova il suono</button>
      {#if soundMsg}<span class="muted small">{soundMsg}</span>{/if}
    </li>
    <li>
      <Stepper label="Recupero predefinito" unit="sec" step={15} min={15} value={appSettings.defaultRestSeconds} onchange={(v) => updateSettings({ defaultRestSeconds: v })} />
      <span class="muted small">Per gli esercizi aggiunti durante l'allenamento e le nuove schede.</span>
    </li>
    <li>
      <span>Passo dei pulsanti − / + del carico</span>
      <div class="seg">
        {#each [1.25, 2.5, 5] as v}
          <button class:on={weightStep() === v} onclick={() => updateSettings({ weightStep: v })}>{String(v).replace('.', ',')} kg</button>
        {/each}
      </div>
    </li>
    <li>
      Schermo sempre acceso: <strong>{wakeLockState.supported ? 'supportato' : 'non supportato'}</strong>
      <span class="muted small">
        {wakeLockState.supported
          ? 'Si attiva da solo durante un allenamento. Su iPhone con iOS precedente alla 18.4, nelle app installate sulla Home può non funzionare: in quel caso imposta «Blocco automatico → Mai».'
          : 'Imposta «Blocco automatico → Mai» nelle impostazioni dell\'iPhone mentre ti alleni.'}
      </span>
    </li>
  </ul>

  <details>
    <summary>Avanzate</summary>
    <ul>
      <li><a class="link" href="#/impostazioni/esercizi">Database esercizi ›</a></li>
    </ul>
  <h2>Uso offline</h2>
  <ul>
    <li>
      Immagini degli esercizi: <strong>{imagesCached}</strong> di {imagesTotal} scaricate
      <button onclick={downloadAll} disabled={downloading || (imagesTotal > 0 && imagesCached >= imagesTotal)}>
        {downloading ? 'Download…' : imagesCached >= imagesTotal && imagesTotal > 0 ? 'Tutte scaricate' : 'Scarica tutte (~21 MB)'}
      </button>
      {#if error}<span class="err">{error}</span>{/if}
    </li>
  </ul>

  <h2>Stato tecnico</h2>
  <ul>
    <li>App installata sulla Home: <strong>{standalone ? 'sì' : 'no'}</strong></li>
    <li>Archiviazione protetta: <strong>{persisted === null ? '…' : persisted ? 'sì' : 'no'}</strong></li>
    {#if usage}<li>Spazio usato: <strong>{mb(usage.usage)}</strong> su {mb(usage.quota)}</li>{/if}
  </ul>
  </details>
</section>

<style>
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 .6rem; padding: .45rem 0 0; border-top: 1px solid var(--line); }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
  li { display: grid; gap: .5rem; padding: .75rem 1rem; background: var(--surface); border: 0; border-radius: 0; }
  .backup { display: grid; gap: .2rem; padding: .9rem 1rem; margin-top: .75rem; background: var(--surface); border: 1px solid var(--accent); border-radius: var(--r); color: var(--text); text-decoration: none; }
  .backup strong { color: var(--text); }
  .backup.alert { background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
  .backup span { color: var(--muted); }
  summary { min-height: 44px; display: flex; align-items: center; margin-top: 1.25rem; color: var(--muted); font-weight: 600; }
  details[open] summary { margin-bottom: .25rem; }
  .link { color: var(--text); font-weight: 700; text-decoration: none; display: block; }
  button { border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 700; padding: 0 1rem; }
  button:disabled { opacity: .55; }
  .err { color: var(--danger); font-size: .85rem; }
  .muted { color: var(--muted); }
  .small { font-size: .8rem; }
  .switch { display: flex; align-items: center; gap: .75rem; min-height: 44px; }
  .switch input { width: 22px; height: 22px; accent-color: var(--accent); }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: .4rem; }
  .seg button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
</style>
