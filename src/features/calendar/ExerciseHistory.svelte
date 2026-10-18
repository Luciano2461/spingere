<script lang="ts">
  import { fmtDateShort, fmtSet } from '../../domain/format'
  import { exerciseBests, exerciseHistory } from '../../domain/history'
  import { KIND_LABELS } from '../../domain/session'
  import { useDoneSessions } from './useDoneSessions.svelte'

  let { exerciseId }: { exerciseId: string } = $props()
  const done = useDoneSessions()
  const items = $derived(exerciseHistory(done.list, exerciseId))
  const bests = $derived(exerciseBests(items))
  const name = $derived(items[0]?.entry.nameSnapshot ?? 'Esercizio')
  const BADGE = { normal: '', warmup: 'R', drop: 'D', failure: 'C' } as const
</script>

<section>
  <button class="back" onclick={() => history.back()}>‹ Indietro</button>
  <h1>{name}</h1>
  {#if items.length}<a class="stats" href={`#/statistiche/esercizio/${encodeURIComponent(exerciseId)}`}>Vedi i grafici di progressione ›</a>{/if}

  {#if done.loaded && items.length === 0}
    <p class="muted">Questo esercizio non è ancora presente nello storico.</p>
  {:else}
    {#if bests.length}
      <h2>Migliori valori</h2>
      <dl>
        {#each bests as b}
          <div><dd>{b.value}</dd><dt>{b.label} · {fmtDateShort(b.startedAt)}</dt></div>
        {/each}
      </dl>
    {/if}

    <h2>Sessioni ({items.length})</h2>
    <ul>
      {#each items as { session, entry } (session.id + entry.exerciseId)}
        <li>
          <a href={`#/calendario/sessione/${session.id}`}>
            <strong>{new Date(session.startedAt).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong>
            <span class="sets">
              {#each entry.sets as s}
                <span class="chip" class:aux={s.kind !== 'normal'} title={KIND_LABELS[s.kind]}>{BADGE[s.kind]}{fmtSet(entry.type, s)}</span>
              {/each}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .back { border: 0; background: transparent; padding: 0; min-height: 44px; color: var(--text); font-weight: 700; font-size: 1rem; }
  .stats { display: inline-block; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 .6rem; padding: .45rem 0 0; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin: 0; }
  dl div { background: var(--surface); border: 0; border-radius: 0; padding: .6rem .8rem; display: flex; flex-direction: column-reverse; }
  dd { margin: 0; font-size: 2.2rem; line-height: 1; font-weight: 700; letter-spacing: -.05em; }
  dt { font-family: var(--mono); font-size: .66rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); margin-top: .35rem; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
  li a { display: grid; gap: .3rem; padding: .7rem .9rem; background: var(--surface); border: 0; border-radius: 0; color: inherit; text-decoration: none; }
  .sets { display: flex; flex-wrap: wrap; gap: .3rem; }
  .chip { padding: 2px 8px; border-radius: 0; background: var(--bg); border: 1px solid var(--border); font-size: .85rem; }
  .chip.aux { color: var(--muted); }
</style>
