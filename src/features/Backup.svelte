<script lang="ts">
  import { onMount } from 'svelte'
  import { applyImport, collectBackup, previewImport, type ImportPreview } from '../db/backup'
  import { db } from '../db/db'
  import { parseBackup, countData, type BackupCounts, type BackupFile, type ImportMode } from '../domain/backup'
  import { backupFileName, readFileText, shareOrDownload } from '../services/backupIO'
  import { appSettings, updateSettings } from '../state/settings.svelte'
  import { APP_VERSION } from '../version'

  // --- Esporta: il file viene preparato prima, così il tocco su «Esporta» apre subito la condivisione (iOS la richiede) ---
  let prepared = $state.raw<{ json: string; name: string; counts: BackupCounts; kb: number } | null>(null)
  let exportMsg = $state('')
  let exporting = $state(false)

  async function prepare() {
    prepared = null
    const backup = await collectBackup(db, APP_VERSION)
    const json = JSON.stringify(backup)
    prepared = { json, name: backupFileName(), counts: countData(backup.data), kb: Math.round(json.length / 1024) }
  }
  onMount(prepare)

  async function doExport() {
    if (!prepared) return
    exporting = true
    exportMsg = ''
    try {
      const result = await shareOrDownload(prepared.json, prepared.name)
      if (result === 'cancelled') {
        exportMsg = 'Esportazione annullata.'
      } else {
        await updateSettings({ lastBackupAt: new Date().toISOString() })
        exportMsg = result === 'shared' ? 'Backup condiviso. Controlla di averlo salvato (es. in File → iCloud Drive).' : 'Backup scaricato. Controlla la cartella Download.'
      }
    } catch (e) {
      exportMsg = e instanceof Error ? e.message : 'Esportazione non riuscita.'
    } finally {
      exporting = false
    }
  }

  // --- Importa ---
  // $state.raw: dati grandi, senza proxy reattivi (IndexedDB non può salvare oggetti proxy)
  let backup = $state.raw<BackupFile | null>(null)
  let fileName = $state('')
  let mode = $state<ImportMode>('merge')
  let preview = $state.raw<ImportPreview | null>(null)
  let importMsg = $state('')
  let importErr = $state('')
  let importing = $state(false)

  async function onFile(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    backup = null
    preview = null
    importMsg = ''
    importErr = ''
    if (!file) return
    try {
      backup = parseBackup(await readFileText(file))
      fileName = file.name
      mode = 'merge'
      preview = await previewImport(db, backup, mode)
    } catch (e) {
      importErr = e instanceof Error ? e.message : 'Impossibile leggere il file.'
    }
  }

  async function changeMode(m: ImportMode) {
    mode = m
    if (backup) preview = await previewImport(db, backup, m)
  }

  async function doImport() {
    if (!backup || !preview) return
    if (mode === 'replace' && !confirm(`Sostituire tutto? Verranno cancellate ${pl(preview.local.plans, 'scheda', 'schede')} e ${pl(preview.local.sessions, 'allenamento', 'allenamenti')} presenti su questo dispositivo, e sostituiti con quelli del file.`)) return
    importing = true
    importErr = ''
    try {
      const done = await applyImport(db, backup, mode)
      importMsg = `Importazione completata: ${pl(done.plans.length, 'scheda', 'schede')}, ${pl(done.sessions.length, 'allenamento', 'allenamenti')}, ${pl(done.customExercises.length, 'esercizio personalizzato', 'esercizi personalizzati')}, ${pl(done.photos.length, 'foto', 'foto')}.`
      backup = null
      preview = null
      void prepare()
    } catch (e) {
      importErr = e instanceof Error ? e.message : 'Importazione non riuscita: non è cambiato nulla.'
    } finally {
      importing = false
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })
  const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  const lastBackup = $derived(appSettings.lastBackupAt ? `${when(appSettings.lastBackupAt)} (${days(appSettings.lastBackupAt)} giorni fa)` : 'mai')
  const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const summary = (c: BackupCounts) =>
    [pl(c.plans, 'scheda', 'schede'), pl(c.sessions, 'allenamento', 'allenamenti'), pl(c.customExercises, 'esercizio personalizzato', 'esercizi personalizzati'),
      pl(c.aliases, 'nome personale', 'nomi personali'), pl(c.photos, 'foto', 'foto')].join(' · ')
</script>

<section>
  <a class="back" href="#/impostazioni">‹ Impostazioni</a>
  <h1>Backup e ripristino</h1>
  <p class="muted">I tuoi dati sono solo su questo dispositivo, nel browser. Se disinstalli l'app o Safari cancella i dati del sito, si perdono: un backup ogni tanto li salva.</p>

  <h2>Esporta</h2>
  <div class="card">
    <p>Ultimo backup: <strong>{lastBackup}</strong></p>
    {#if prepared}
      <p class="muted small">Pronto: {summary(prepared.counts)} · {prepared.kb} KB</p>
    {:else}
      <p class="muted small">Preparazione del backup…</p>
    {/if}
    <button class="primary" onclick={doExport} disabled={!prepared || exporting}>Esporta backup</button>
    {#if exportMsg}<p class="small" role="status">{exportMsg}</p>{/if}
    <p class="muted small">Su iPhone si apre il foglio di condivisione: scegli «Salva su File» (iCloud Drive) o invialo a te stesso.</p>
  </div>

  <h2>Importa</h2>
  <div class="card">
    <label class="file">
      Scegli un file di backup…
      <input type="file" accept=".json,application/json" onchange={onFile} hidden />
    </label>
    {#if importErr}<p class="err" role="alert">{importErr}</p>{/if}
    {#if importMsg}<p class="ok" role="status">{importMsg}</p>{/if}

    {#if backup && preview}
      <div class="info">
        <strong>{fileName}</strong>
        <span class="muted small">Creato il {backup.exportedAt ? when(backup.exportedAt) : '—'}{backup.app.version ? ` con Spingere ${backup.app.version}` : ''}</span>
        <span class="small">{summary(preview.file)}</span>
      </div>

      <div class="modes" role="radiogroup" aria-label="Modalità di importazione">
        <button role="radio" aria-checked={mode === 'merge'} class:on={mode === 'merge'} onclick={() => changeMode('merge')}>
          <strong>Unisci</strong><span>Aggiunge quello che manca. Non cancella niente.</span>
        </button>
        <button role="radio" aria-checked={mode === 'replace'} class:on={mode === 'replace'} onclick={() => changeMode('replace')}>
          <strong>Sostituisci tutto</strong><span>Cancella i dati di questo dispositivo e usa solo quelli del file.</span>
        </button>
      </div>

      {#if mode === 'merge'}
        <p class="small">Verranno aggiunti: {pl(preview.plan.plans.length, 'scheda', 'schede')}, {pl(preview.plan.sessions.length, 'allenamento', 'allenamenti')}, {pl(preview.plan.photos.length, 'foto', 'foto')}.
          {#if preview.plan.skipped.plans + preview.plan.skipped.sessions > 0}Già presenti e saltati: {pl(preview.plan.skipped.plans, 'scheda', 'schede')}, {pl(preview.plan.skipped.sessions, 'allenamento', 'allenamenti')}.{/if}</p>
      {:else}
        <p class="small warn">Su questo dispositivo ci sono {pl(preview.local.plans, 'scheda', 'schede')} e {pl(preview.local.sessions, 'allenamento', 'allenamenti')}: verranno cancellati.</p>
        {#if preview.activeSession}<p class="err">C'è un allenamento in corso: concludilo o annullalo prima di sostituire.</p>{/if}
      {/if}
      {#each preview.plan.warnings as w}<p class="small warn">{w}</p>{/each}

      <button class="primary" onclick={doImport} disabled={importing || (mode === 'replace' && preview.activeSession)}>
        {mode === 'merge' ? 'Importa (unisci)' : 'Sostituisci tutto'}
      </button>
    {/if}
  </div>

  <h2>Promemoria</h2>
  <div class="card">
    <label class="small" for="remind">Ricordami di fare il backup</label>
    <select id="remind" value={String(appSettings.backupReminderDays)} onchange={(e) => updateSettings({ backupReminderDays: Number(e.currentTarget.value) })}>
      <option value="0">Mai</option>
      <option value="7">Ogni 7 giorni</option>
      <option value="14">Ogni 14 giorni</option>
      <option value="30">Ogni 30 giorni</option>
    </select>
  </div>
</section>

<style>
  .back { display: inline-block; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 .6rem; padding: .45rem 0 0; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); }
  .small { font-size: .85rem; margin: .25rem 0; }
  .card { display: grid; gap: .5rem; padding: .85rem 1rem; background: var(--surface); border: 0; border-radius: 0; }
  .card p { margin: 0; }
  .primary { min-height: 48px; border: 0; border-radius: var(--pill); background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: 1rem; }
  .primary:disabled { opacity: .45; }
  .file { display: flex; align-items: center; justify-content: center; min-height: 48px; border: 1.5px dashed var(--text); border-radius: 0; color: var(--text); font-weight: 600; text-align: center; }
  .info { display: grid; gap: 2px; padding: .6rem .75rem; background: var(--bg); border-radius: var(--r-sm); }
  .modes { display: grid; gap: .5rem; }
  .modes button { display: grid; gap: 2px; text-align: left; padding: .6rem .75rem; border: 2px solid var(--border); border-radius: var(--r); background: var(--bg); color: var(--text); }
  .modes button span { font-size: .8rem; color: var(--muted); }
  .modes button.on { border-color: var(--accent); }
  .err { color: var(--danger); }
  .ok { color: var(--ok); }
  .warn { color: var(--warn); }
  select { min-height: 44px; padding: 0 .75rem; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-sm); }
</style>
