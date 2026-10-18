<script lang="ts">
  import { db } from '../../db/db'
  import { muscleLabel } from '../../data/labels'
  import { fmtDateShort, fmtNumber } from '../../domain/format'
  import { RECORD_LABELS } from '../../domain/records'
  import {
    PERIOD_LABELS, bucketRange, exerciseList, fmtPerWeek, muscleSets, periodStart, periodSummary, recentRecords, sessionsSince, summarySentence,
    type MuscleInfo, type Period,
  } from '../../domain/progress'
  import BarList from '../../ui/BarList.svelte'
  import BodyMap from '../../ui/BodyMap.svelte'
  import { useDoneSessions } from '../calendar/useDoneSessions.svelte'

  const done = useDoneSessions()
  let period = $state<Period>('3m')
  let unit = $state<'week' | 'month'>('week')
  let mapView = $state<'corpo' | 'elenco'>('corpo')
  let pickedMuscle = $state<string | null>(null)
  let query = $state('')
  let showAll = $state(false)
  let muscles = $state(new Map<string, MuscleInfo>())

  $effect(() => {
    db.exercises.toArray().then((all) => {
      muscles = new Map(all.map((e) => [e.id, { primary: e.primaryMuscles, secondary: e.secondaryMuscles }]))
    })
  })

  const from = $derived(periodStart(period))
  const inPeriod = $derived(sessionsSince(done.list, from))
  const summary = $derived(periodSummary(inPeriod))
  const perWeek = $derived.by(() => {
    const first = from ?? (inPeriod.length ? new Date(Math.min(...inPeriod.map((s) => new Date(s.startedAt).getTime()))) : new Date())
    const weeks = Math.max(1, (Date.now() - first.getTime()) / (7 * 86400_000))
    return summary.workouts / weeks
  })

  const cur = $derived.by(() => {
    const r = bucketRange(unit)
    return muscleSets(done.list, muscles, r.from, r.to)
  })
  const prev = $derived.by(() => {
    const r = bucketRange(unit, new Date(), -1)
    return muscleSets(done.list, muscles, r.from, r.to)
  })
  const muscleItems = $derived.by(() => {
    const now = new Map(cur.totals.map((t) => [t.muscle, t.sets]))
    const before = new Map(prev.totals.map((t) => [t.muscle, t.sets]))
    const keys = [...new Set([...now.keys(), ...before.keys()])]
    return keys
      .map((m) => ({ label: muscleLabel(m), value: now.get(m) ?? 0, before: before.get(m) ?? 0 }))
      .sort((a, b) => b.value - a.value || b.before - a.before)
  })
  const curMap = $derived(new Map(cur.totals.map((t) => [t.muscle, t.sets])))
  const prevMap = $derived(new Map(prev.totals.map((t) => [t.muscle, t.sets])))
  const compare = $derived(new Map(muscleItems.map((i) => [i.label, i.before])))

  const records = $derived(recentRecords(done.list, 40).filter((r) => !from || new Date(r.session.startedAt) >= from).slice(0, 6))
  const exercises = $derived(exerciseList(inPeriod))
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const filtered = $derived(query.trim() ? exercises.filter((e) => norm(e.name).includes(norm(query.trim()))) : exercises)
  const visible = $derived(showAll || query.trim() ? filtered : filtered.slice(0, 10))
</script>

<section>
  <h1>Statistiche</h1>

  {#if done.loaded && done.list.length === 0}
    <p class="muted">Qui compariranno volume, record e grafici di progressione dopo il tuo primo allenamento concluso.</p>
  {:else}
    <div class="seg" role="group" aria-label="Periodo">
      {#each Object.entries(PERIOD_LABELS) as [id, label]}
        <button class:on={period === id} aria-pressed={period === id} onclick={() => (period = id as Period)}>{label}</button>
      {/each}
    </div>

    <p class="sentence">{summarySentence(period, summary.workouts, summary.sets)}</p>
    <dl class="cards">
      <div><dd>{summary.workouts}</dd><dt>allenamenti</dt></div>
      <div><dd>{fmtPerWeek(perWeek)}</dd><dt>a settimana</dt></div>
      <div><dd>{summary.sets}</dd><dt>serie fatte</dt></div>
      <div><dd>{fmtNumber(summary.volume)}</dd><dt>kg sollevati in totale</dt></div>
    </dl>

    {#if records.length}
      <h2>Record recenti</h2>
      <ul class="list">
        {#each records as r (r.session.id + r.name)}
          <li>
            <a href={`#/calendario/sessione/${r.session.id}`}>
              <strong>🏆 {r.name}</strong>
              <span class="muted">{fmtDateShort(r.session.startedAt)} · {r.kinds.map((k) => RECORD_LABELS[k]).join(' · ')}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}

    <h2>Esercizi</h2>
    <input type="search" placeholder="Cerca un esercizio" bind:value={query} aria-label="Cerca un esercizio" />
    {#if filtered.length === 0}
      <p class="muted">{exercises.length === 0 ? 'Nessun esercizio nel periodo scelto.' : 'Nessun esercizio trovato.'}</p>
    {/if}
    <ul class="list">
      {#each visible as e (e.exerciseId)}
        <li>
          <a href={`#/statistiche/esercizio/${encodeURIComponent(e.exerciseId)}`}>
            <strong>{e.name}</strong>
            <span class="muted">{e.sessions} {e.sessions === 1 ? 'sessione' : 'sessioni'} · ultima {fmtDateShort(e.lastAt)}</span>
          </a>
        </li>
      {/each}
    </ul>
    {#if !showAll && !query.trim() && filtered.length > 10}
      <button class="more" onclick={() => (showAll = true)}>Mostra tutti ({filtered.length})</button>
    {/if}

    <h2>Serie per muscolo</h2>
    <div class="seg" role="group" aria-label="Intervallo">
      <button class:on={unit === 'week'} aria-pressed={unit === 'week'} onclick={() => (unit = 'week')}>Questa settimana</button>
      <button class:on={unit === 'month'} aria-pressed={unit === 'month'} onclick={() => (unit = 'month')}>Questo mese</button>
    </div>
    <div class="seg small" role="group" aria-label="Vista">
      <button class:on={mapView === 'corpo'} aria-pressed={mapView === 'corpo'} onclick={() => (mapView = 'corpo')}>Corpo</button>
      <button class:on={mapView === 'elenco'} aria-pressed={mapView === 'elenco'} onclick={() => (mapView = 'elenco')}>Elenco</button>
    </div>
    {#if muscleItems.length === 0}
      <p class="muted">Nessuna serie registrata {unit === 'week' ? 'questa settimana' : 'questo mese'}.</p>
    {:else if mapView === 'corpo'}
      <BodyMap values={curMap} selected={pickedMuscle} onselect={(m) => (pickedMuscle = pickedMuscle === m ? null : m)} />
      <p class="pick" role="status">
        {#if pickedMuscle}
          <strong>{muscleLabel(pickedMuscle)}</strong>: {fmtNumber(curMap.get(pickedMuscle) ?? 0)} serie {unit === 'week' ? 'questa settimana' : 'questo mese'} · {unit === 'week' ? 'settimana scorsa' : 'mese scorso'}: {fmtNumber(prevMap.get(pickedMuscle) ?? 0)}
        {:else}
          Tocca un muscolo per vedere le serie.
        {/if}
      </p>
      <p class="note">Più il colore è intenso, più serie hai fatto. I muscoli secondari contano mezza serie.</p>
    {:else}
      <BarList items={muscleItems} unit="serie" {compare} />
      <p class="note">La barra è {unit === 'week' ? 'la settimana' : 'il mese'} in corso, il segno {unit === 'week' ? 'la settimana' : 'il mese'} precedente. I muscoli secondari contano mezza serie.</p>
    {/if}
    {#if cur.unknownSets > 0}
      <p class="note">{cur.unknownSets === 1 ? '1 serie' : `${cur.unknownSets} serie`} di esercizi senza muscoli associati (es. personalizzati) non sono incluse.</p>
    {/if}
  {/if}
</section>

<style>
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 .6rem; padding: .45rem 0 0; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); font-size: .85rem; }
  .sentence { margin: .75rem 0 .5rem; font-size: .95rem; }
  .note { color: var(--muted); font-size: .8rem; margin: .5rem 0 0; }
  .seg { display: flex; gap: 4px; padding: 3px; border: 1.5px solid var(--text); border-radius: var(--pill); margin-bottom: .75rem; }
  .seg button { flex: 1; min-height: 40px; border: 0; border-radius: var(--pill); font-weight: 600; background: transparent; font-size: .85rem; padding: 0 .25rem; }
  .seg button.on { background: var(--ink); color: var(--on-ink); font-weight: 700; }
  .seg.small button { min-height: 36px; }
  .pick { margin: .5rem 0 0; font-size: .9rem; text-align: center; min-height: 1.4em; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin: 0; }
  .cards div { background: transparent; border: 0; border-top: 1px solid var(--line); padding: .6rem .5rem .6rem 0; display: flex; flex-direction: column-reverse; }
  dd { margin: 0; font-size: 2.2rem; line-height: 1; font-weight: 700; letter-spacing: -.05em; }
  dt { font-family: var(--mono); font-size: .66rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); margin-top: .35rem; }
  .list { list-style: none; padding: 0; margin: .5rem 0 0; display: grid; gap: .5rem; }
  .list a { display: grid; gap: 2px; padding: .7rem .9rem; background: var(--surface); border: 0; border-radius: 0; color: inherit; text-decoration: none; }
  input[type='search'] { width: 100%; min-height: 48px; padding: 0 .9rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); }
  .more { width: 100%; margin-top: .5rem; border: 0; border-radius: 0; background: var(--surface); }
</style>
