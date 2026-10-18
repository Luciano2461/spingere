<script lang="ts">
  import { fmtDuration, fmtNumber } from '../../domain/format'
  import { sessionDuration, sessionSetCount } from '../../domain/history'
  import { totalVolume } from '../../domain/stats'
  import type { Session } from '../../domain/types'

  let { session }: { session: Session } = $props()
  const time = $derived(new Date(session.startedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))
  const duration = $derived(sessionDuration(session))
  const volume = $derived(session.entries.reduce((v, e) => v + totalVolume(e.sets), 0))
</script>

<a href={`#/calendario/sessione/${session.id}`}>
  <strong>{session.dayName ?? 'Allenamento libero'}</strong>
  <span class="muted">
    {session.planName ? `${session.planName} · ` : ''}{time}{duration !== null ? ` · ${fmtDuration(duration)}` : ''}
  </span>
  <span class="muted">{session.entries.length === 1 ? '1 esercizio' : `${session.entries.length} esercizi`} · {sessionSetCount(session) === 1 ? '1 serie' : `${sessionSetCount(session)} serie`}{volume > 0 ? ` · ${fmtNumber(volume)} kg` : ''}</span>
</a>

<style>
  a { display: grid; gap: 2px; padding: .7rem .9rem; background: var(--surface); border: 0; border-radius: 0; color: inherit; text-decoration: none; }
  .muted { color: var(--muted); font-size: .85rem; }
</style>
