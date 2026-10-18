<script lang="ts">
  import { fmtDateShort, fmtSet } from '../../domain/format'
  import { exerciseBests, exerciseHistory } from '../../domain/history'
  import { METRIC_LABELS, exerciseSeries, metricUnit, metricsFor, type Metric } from '../../domain/progress'
  import LineChart from '../../ui/LineChart.svelte'
  import { useDoneSessions } from '../calendar/useDoneSessions.svelte'

  let { exerciseId }: { exerciseId: string } = $props()
  const done = useDoneSessions()
  const items = $derived(exerciseHistory(done.list, exerciseId))
  const type = $derived(items[0]?.entry.type)
  const metrics = $derived(type ? metricsFor(type) : [])
  let chosen = $state<Metric | null>(null)
  const metric = $derived(chosen && metrics.includes(chosen) ? chosen : (metrics[0] ?? null))
  const series = $derived(metric ? exerciseSeries(items, metric) : { points: [], excludedSets: 0 })
  const bests = $derived(exerciseBests(items))
  const name = $derived(items[0]?.entry.nameSnapshot ?? 'Esercizio')
</script>

<section>
  <button class="back" onclick={() => history.back()}>‹ Statistiche</button>
  <h1>{name}</h1>

  {#if done.loaded && items.length === 0}
    <p class="muted">Questo esercizio non è ancora presente nello storico.</p>
  {:else if metric}
    {#if metrics.length > 1}
      <div class="seg" role="group" aria-label="Grafico">
        {#each metrics as m}
          <button class:on={metric === m} aria-pressed={metric === m} onclick={() => (chosen = m)}>{METRIC_LABELS[m]}</button>
        {/each}
      </div>
    {/if}

    {#if series.points.length === 0}
      <p class="muted">
        {metric === 'e1rm' ? 'n/d: il massimale stimato richiede serie fino a 10 ripetizioni.' : 'Nessun dato per questo grafico.'}
      </p>
    {:else}
      <LineChart points={series.points.map((p) => ({ t: new Date(p.startedAt).getTime(), v: p.value }))} unit={metricUnit(metric)} label={`${METRIC_LABELS[metric]}: ${name}`} />
      {#if series.points.length === 1}<p class="note">Un solo punto per ora: il grafico prende forma dalla seconda sessione.</p>{/if}
    {/if}
    {#if metric === 'e1rm' && series.excludedSets > 0}
      <p class="note">⚠︎ {series.excludedSets} {series.excludedSets === 1 ? 'serie esclusa' : 'serie escluse'}: oltre 10 ripetizioni la stima non è affidabile.</p>
    {/if}
    {#if metric === 'volume'}<p class="note">Volume = somma di carico × ripetizioni delle serie di lavoro di ogni sessione.</p>{/if}

    {#if bests.length}
      <h2>Record personali</h2>
      <dl class="cards">
        {#each bests as b}
          <div><dd>{b.value}</dd><dt>{b.label} · {fmtDateShort(b.startedAt)}</dt></div>
        {/each}
      </dl>
    {/if}

    <h2>Ultime sessioni</h2>
    <ul>
      {#each items.slice(0, 5) as { session, entry } (session.id)}
        <li>
          <a href={`#/calendario/sessione/${session.id}`}>
            <strong>{fmtDateShort(session.startedAt)}</strong>
            <span class="muted">{entry.sets.filter((s) => s.done).map((s) => fmtSet(entry.type, s)).join(' · ')}</span>
          </a>
        </li>
      {/each}
    </ul>
    <a class="all" href={`#/calendario/esercizio/${encodeURIComponent(exerciseId)}`}>Tutte le sessioni ({items.length}) ›</a>
  {/if}
</section>

<style>
  .back { border: 0; background: transparent; padding: 0; min-height: 44px; color: var(--text); font-weight: 700; font-size: 1rem; }
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 .6rem; padding: .45rem 0 0; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); font-size: .9rem; }
  .note { color: var(--muted); font-size: .8rem; margin: .5rem 0 0; }
  .seg { display: flex; gap: 4px; padding: 3px; border: 1.5px solid var(--text); border-radius: var(--pill); margin-bottom: .75rem; }
  .seg button { flex: 1; min-height: 40px; border: 0; border-radius: var(--pill); font-weight: 600; background: transparent; font-size: .8rem; padding: 0 .25rem; }
  .seg button.on { background: var(--ink); color: var(--on-ink); font-weight: 700; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin: 0; }
  .cards div { background: transparent; border: 0; border-top: 1px solid var(--line); padding: .6rem .5rem .6rem 0; display: flex; flex-direction: column-reverse; }
  dd { margin: 0; font-size: 2.2rem; line-height: 1; font-weight: 700; letter-spacing: -.05em; }
  dt { font-family: var(--mono); font-size: .66rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); margin-top: .35rem; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
  li a { display: grid; gap: 2px; padding: .7rem .9rem; background: var(--surface); border: 0; border-radius: 0; color: inherit; text-decoration: none; }
  .all { display: block; margin-top: .5rem; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
</style>
