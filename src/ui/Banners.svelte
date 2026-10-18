<script lang="ts">
  import { onMount } from 'svelte'
  import { registerSW } from 'virtual:pwa-register'
  import { liveQuery } from 'dexie'
  import { db } from '../db/db'
  import { backupReminder } from '../domain/backup'
  import { active } from '../state/activeSession.svelte'
  import { dismiss, isDismissed } from '../services/dismissals'
  import { appSettings } from '../state/settings.svelte'
  import { isStandalone, requestPersistence } from '../services/storage'

  let needRefresh = $state(false)
  let notInstalled = $state(!isStandalone())
  let oldestData = $state<string | undefined>(undefined)
  // «Chiudi» ricordato per qualche giorno (versione reattiva: si aggiorna subito al tocco)
  let hiddenInstall = $state(isDismissed('install'))
  let hiddenBackup = $state(isDismissed('backup'))
  let updateSW: ((reload?: boolean) => Promise<void>) | undefined

  onMount(() => {
    requestPersistence()
    updateSW = registerSW({
      onNeedRefresh: () => (needRefresh = true),
      // su iPhone l'app installata resta aperta in memoria per giorni: si controlla se c'è una versione nuova anche quando torna in primo piano
      onRegisteredSW: (_url, reg) => {
        if (!reg) return
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        })
      },
    })
    // dato più vecchio dell'utente: serve al promemoria del backup
    const sub = liveQuery(async () => {
      const plans = (await db.plans.toArray()).map((p) => p.createdAt)
      const firstSession = (await db.sessions.where('status').equals('done').sortBy('startedAt'))[0]?.startedAt
      return [...plans, ...(firstSession ? [firstSession] : [])].sort()[0]
    }).subscribe((v) => (oldestData = v))
    return () => sub.unsubscribe()
  })

  const reminder = $derived(
    backupReminder({ backupReminderDays: appSettings.backupReminderDays, lastBackupAt: appSettings.lastBackupAt, oldestDataAt: oldestData }),
  )

  // Un solo banner alla volta e mai durante un allenamento. Priorità: aggiornamento, installazione, backup.
  const shown = $derived(
    active.session ? null
      : needRefresh ? 'update'
      : notInstalled && !hiddenInstall ? 'install'
      : reminder.due && !hiddenBackup ? 'backup'
      : null,
  )
</script>

{#if shown === 'update'}
  <div class="banner update" role="status">
    <span>Nuova versione disponibile</span>
    <button onclick={() => updateSW?.(true)}>Aggiorna</button>
  </div>
{:else if shown === 'backup'}
  <div class="banner remind" role="status">
    <span>Backup: {reminder.daysSince === null ? 'non ne hai mai fatto uno' : `l'ultimo è di ${reminder.daysSince} giorni fa`}.</span>
    <a href="#/impostazioni/backup">Fai il backup</a>
    <button onclick={() => { dismiss('backup', 3); hiddenBackup = true }} aria-label="Più tardi">✕</button>
  </div>
{:else if shown === 'install'}
  <div class="banner install" role="status">
    <span><strong>Installa l'app prima di usarla</strong>: i dati di Safari e quelli dell'app sulla Home sono separati. Tocca Condividi (il quadrato con la freccia) → «Aggiungi alla schermata Home».</span>
    <button onclick={() => { dismiss('install', 7); hiddenInstall = true }} aria-label="Chiudi">✕</button>
  </div>
{/if}

<style>
  .banner {
    display: flex; align-items: center; justify-content: space-between; gap: .75rem;
    padding: .6rem 1rem; padding-top: calc(.6rem + env(safe-area-inset-top));
    font-size: .85rem; background: var(--accent); color: var(--on-accent);
  }
  .install { background: var(--surface); color: var(--text); border-bottom: 1px solid var(--border); }
  .remind { background: var(--warn); color: var(--on-warn); }
  .remind a { color: var(--on-warn); font-weight: 700; white-space: nowrap; }
  button { min-width: 44px; padding: 0 .75rem; border: 0; border-radius: 0; background: rgba(255,255,255,.25); }
  .install button { background: transparent; }
</style>
