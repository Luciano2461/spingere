<script lang="ts">
  import { groupByDay, parseDayKey } from '../../domain/history'
  import SessionCard from './SessionCard.svelte'
  import { useDoneSessions } from './useDoneSessions.svelte'

  let { day }: { day: string } = $props()
  const done = useDoneSessions()
  const sessions = $derived(groupByDay(done.list).get(day) ?? [])
  const title = $derived(parseDayKey(day).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
</script>

<section>
  <a class="back" href="#/calendario">‹ Calendario</a>
  <h1>{title}</h1>
  {#if done.loaded && sessions.length === 0}
    <p class="muted">Nessun allenamento in questo giorno.</p>
  {/if}
  <div class="list">
    {#each sessions as s (s.id)}<SessionCard session={s} />{/each}
  </div>
</section>

<style>
  .back { display: inline-block; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
  h1 { font-size: 1.4rem; }
  h1::first-letter { text-transform: uppercase; }
  .list { display: grid; gap: .5rem; }
  .muted { color: var(--muted); }
</style>
