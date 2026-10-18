<script lang="ts">
  import { dayKey, groupByDay, monthGrid, monthSummary } from '../../domain/history'
  import { fmtDuration, fmtNumber } from '../../domain/format'
  import { calendarView, shiftMonth, showMonthOf } from './state.svelte'
  import { useDoneSessions } from './useDoneSessions.svelte'

  const done = useDoneSessions()
  const byDay = $derived(groupByDay(done.list))
  const grid = $derived(monthGrid(calendarView.year, calendarView.month))
  const summary = $derived(monthSummary(done.list, calendarView.year, calendarView.month))
  const today = dayKey(new Date().toISOString())
  const title = $derived(new Date(calendarView.year, calendarView.month, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }))
  const isCurrent = $derived(new Date().getFullYear() === calendarView.year && new Date().getMonth() === calendarView.month)
  const WEEK = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
</script>

<section>
  <h1>Calendario</h1>

  <div class="nav">
    <button aria-label="Mese precedente" onclick={() => shiftMonth(-1)}>‹</button>
    <h2>{title}</h2>
    <button aria-label="Mese successivo" onclick={() => shiftMonth(1)}>›</button>
  </div>

  <div class="grid" role="grid" aria-label={title}>
    {#each WEEK as w}<span class="wd" aria-hidden="true">{w}</span>{/each}
    {#each grid as c (c.key)}
      {@const n = byDay.get(c.key)?.length ?? 0}
      {#if n > 0}
        <a class="cell has" class:out={!c.inMonth} class:today={c.key === today} href={`#/calendario/giorno/${c.key}`} aria-label={`${c.day}: ${n === 1 ? '1 allenamento' : `${n} allenamenti`}`}>
          <span>{c.day}</span><i class="dot"></i>
        </a>
      {:else}
        <span class="cell" class:out={!c.inMonth} class:today={c.key === today}><span>{c.day}</span></span>
      {/if}
    {/each}
  </div>

  {#if !isCurrent}
    <button class="now" onclick={() => showMonthOf(new Date())}>Torna a oggi</button>
  {/if}

  <h3>Riepilogo del mese</h3>
  {#if summary.workouts === 0}
    <p class="muted">{done.loaded && done.list.length === 0 ? 'Gli allenamenti conclusi compariranno qui.' : 'Nessun allenamento in questo mese.'}</p>
  {:else}
    <dl>
      <div><dd>{summary.workouts}</dd><dt>allenamenti</dt></div>
      <div><dd>{summary.trainingDays}</dd><dt>giorni</dt></div>
      <div><dd>{fmtDuration(summary.seconds)}</dd><dt>tempo totale</dt></div>
      <div><dd>{fmtNumber(summary.volume)}</dd><dt>kg di volume</dt></div>
    </dl>
  {/if}
</section>

<style>
  .nav { display: flex; align-items: center; gap: .5rem; }
  .nav h2 { flex: 1; margin: 0; font-size: 1.5rem; letter-spacing: -.04em; text-transform: capitalize; }
  .nav button { width: 48px; border: 1.5px solid var(--text); border-radius: 50%; background: transparent; font-size: 1.4rem; }
  .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-top: .75rem; }
  .wd { text-align: center; font-family: var(--mono); font-size: .66rem; color: var(--muted); padding: .25rem 0; }
  .cell { min-height: 48px; display: grid; place-items: center; align-content: center; gap: 2px; border-radius: var(--r-sm); color: var(--text); text-decoration: none; font-size: .95rem; }
  .cell.out { opacity: .35; }
  .cell.today { outline: 2px solid var(--text); outline-offset: -2px; font-weight: 700; }
  .cell.has { background: var(--accent); color: var(--on-accent); font-weight: 700; }
  .dot { display: none; }
  .now { margin-top: .75rem; width: 100%; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; font-weight: 700; }
  h3 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 .6rem; padding: .45rem 0 0; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); font-size: .9rem; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin: 0; }
  dl div { border-top: 1px solid var(--line); padding: .6rem .5rem .6rem 0; display: flex; flex-direction: column-reverse; }
  dd { margin: 0; font-size: 2.2rem; line-height: 1; font-weight: 700; letter-spacing: -.05em; }
  dt { font-family: var(--mono); font-size: .66rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); margin-top: .35rem; }
</style>
