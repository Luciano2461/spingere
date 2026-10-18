<script lang="ts">
  import { fmtDateShort, fmtSetsGrouped } from '../../domain/format'
  import { RECORD_LABELS, type RecordKind } from '../../domain/records'
  import type { LastTime } from '../../domain/session'
  import { KIND_LABELS } from '../../domain/session'
  import type { SessionEntry, SetKind, SetLog } from '../../domain/types'
  import { TYPE_LABELS } from '../../data/labels'
  import type { Exercise } from '../../domain/types'
  import ActionSheet from '../../ui/ActionSheet.svelte'
  import Stepper from '../../ui/Stepper.svelte'
  import ExerciseImages from '../ExerciseImages.svelte'

  let {
    entry, last, records, weightStep, grouped = false, currentIndex, exercise, index,
    onset, ontoggle, onkind, onaddset, onremoveset, onremove,
  }: {
    entry: SessionEntry
    last?: LastTime | null // undefined = non mostrare la riga «Ultima volta» (modifica di una sessione passata)
    records: Map<number, RecordKind[]>
    weightStep: number
    grouped?: boolean
    currentIndex?: number // serie da fare adesso (evidenziata)
    exercise?: Exercise // se presente, toccando il nome si vedono le immagini o la foto
    index?: number // posizione nell'allenamento, mostrata come «01», «02»
    onset: (setIndex: number, patch: Partial<SetLog>) => void
    ontoggle?: (setIndex: number) => void // assente: nessun pulsante di completamento (serie già concluse)
    onkind: (setIndex: number, kind: SetKind) => void
    onaddset: () => void
    onremoveset: () => void
    onremove?: () => void
  } = $props()

  let showImages = $state(false)
  let menu = $state(false)
  let reopened = $state(false) // l'utente ha riaperto un esercizio completato
  let kindFor = $state<number | null>(null) // serie di cui si sta scegliendo il tipo
  const BADGE: Record<SetKind, string> = { normal: '', warmup: 'R', drop: 'D', failure: 'C' }
  const KIND_HINTS: Record<SetKind, string> = {
    normal: 'Serie di lavoro',
    warmup: 'Non conta per record e volume',
    drop: 'Serie con carico ridotto subito dopo, senza recupero',
    failure: 'Serie portata fino a non farcela più',
  }
  const KINDS: SetKind[] = ['normal', 'warmup', 'drop', 'failure']

  const doneCount = $derived(entry.sets.filter((x) => x.done).length)
  // esercizio concluso (solo durante l'allenamento): si riduce a una riga per tenere in vista quello che resta
  const collapsed = $derived(!!ontoggle && !reopened && entry.sets.length > 0 && doneCount === entry.sets.length && currentIndex === undefined)
  const lastText = $derived(
    last ? fmtSetsGrouped(entry.type, last.entry.sets.filter((s) => s.done)) : '',
  )
</script>

{#if collapsed}
  <button class="card compact" class:grouped onclick={() => (reopened = true)} aria-label={`${entry.nameSnapshot}: completato. Tocca per riaprire`}>
    <span class="cname">{#if index !== undefined}<span class="cnum">{String(index + 1).padStart(2, '0')}</span>{/if}{entry.nameSnapshot}</span>
    <span class="csum">✓ {fmtSetsGrouped(entry.type, entry.sets)}</span>
  </button>
{:else}
<div class="card" class:grouped>
  <div class="head">
    <div class="titles">
      {#if exercise}
        <button class="name" aria-expanded={showImages} onclick={() => (showImages = !showImages)}>{entry.nameSnapshot} <span aria-hidden="true">{showImages ? '▴' : '▾'}</span></button>
      {:else}
        <strong>{entry.nameSnapshot}</strong>
      {/if}
      <span class="sub">{#if index !== undefined}{`${String(index + 1).padStart(2, '0')} · `}{/if}{#if ontoggle}{doneCount}/{entry.sets.length} serie{/if}{#if entry.type !== 'weight_reps'}{ontoggle ? ' · ' : ''}{TYPE_LABELS[entry.type]}{/if}</span>
    </div>
    {#if onremove || entry.sets.length > 0}<button class="icon" aria-label="Altre azioni per questo esercizio" onclick={() => (menu = true)}>⋯</button>{/if}
  </div>
  {#if showImages && exercise}<ExerciseImages {exercise} />{/if}
  {#if last}
    <p class="last">Ultima volta ({fmtDateShort(last.startedAt)}): {lastText}</p>
  {:else if last === null}
    <p class="last">Prima volta che lo registri.</p>
  {/if}

  <div class="sets">
    {#each entry.sets as s, i}
      {@const recs = records.get(i)}
      <div class="row" class:done={s.done} class:nocheck={!ontoggle} class:current={currentIndex === i} data-current={currentIndex === i ? 'true' : undefined}>
        <button class="badge k-{s.kind}" onclick={() => (kindFor = i)} aria-label={`Serie ${i + 1}: ${KIND_LABELS[s.kind]}. Tocca per cambiare tipo`}>
          {BADGE[s.kind] || i + 1}
        </button>

        {#if entry.type === 'weight_reps'}
          <Stepper compact decimal label="Carico (kg)" step={weightStep} value={s.weight} onchange={(v) => onset(i, { weight: v })} />
          <Stepper compact label="Ripetizioni" value={s.reps} min={0} max={200} onchange={(v) => onset(i, { reps: v })} />
        {:else if entry.type === 'weighted_bodyweight'}
          <Stepper compact decimal label="Zavorra (kg, negativo = assistenza)" step={weightStep} min={-200} value={s.weight ?? 0} onchange={(v) => onset(i, { weight: v })} />
          <Stepper compact label="Ripetizioni" value={s.reps} min={0} max={200} onchange={(v) => onset(i, { reps: v })} />
        {:else if entry.type === 'bodyweight'}
          <Stepper compact label="Ripetizioni" value={s.reps} min={0} max={200} onchange={(v) => onset(i, { reps: v })} />
          <span></span>
        {:else if entry.type === 'timed'}
          <Stepper compact label="Secondi" step={5} value={s.seconds} onchange={(v) => onset(i, { seconds: v })} />
          <span class="unit">sec</span>
        {:else}
          <Stepper compact label="Minuti" value={s.seconds !== undefined ? Math.round(s.seconds / 60) : undefined} min={0} onchange={(v) => onset(i, { seconds: v * 60 })} />
          <Stepper compact decimal label="Distanza (km)" step={0.5} value={s.distance} onchange={(v) => onset(i, { distance: v })} />
        {/if}

        {#if ontoggle}<button class="check" class:on={s.done} onclick={() => ontoggle(i)} aria-pressed={s.done} aria-label={s.done ? 'Serie completata: tocca per annullare' : 'Segna la serie come completata'}>
          {s.done ? '✓' : ''}
        </button>{/if}
      </div>
      {#if s.done && recs?.length}
        <p class="record">🏆 Record: {recs.map((r) => RECORD_LABELS[r]).join(' · ')}</p>
      {/if}
    {/each}
  </div>

  <div class="foot">
    <button onclick={onaddset}>＋ Serie</button>
  </div>
</div>
{/if}

{#if menu}
  <ActionSheet
    title={entry.nameSnapshot}
    onclose={() => (menu = false)}
    actions={[
      { label: 'Togli l\'ultima serie', disabled: entry.sets.length === 0, onclick: onremoveset },
      ...(onremove ? [{ label: 'Togli l\'esercizio dall\'allenamento', danger: true, onclick: onremove }] : []),
    ]}
  />
{/if}
{#if kindFor !== null}
  {@const si = kindFor}
  <ActionSheet
    title={`Tipo della serie ${si + 1}`}
    onclose={() => (kindFor = null)}
    actions={KINDS.map((k) => ({ label: KIND_LABELS[k], hint: KIND_HINTS[k], selected: entry.sets[si]?.kind === k, onclick: () => onkind(si, k) }))}
  />
{/if}

<style>
  .card { background: var(--surface); border: 0; border-top: 2px solid var(--text); padding: .6rem .7rem .7rem; display: grid; grid-template-columns: minmax(0, 1fr); gap: .45rem; min-width: 0; }
  .compact { display: flex; align-items: center; justify-content: space-between; gap: .75rem; text-align: left; min-height: 52px; color: var(--text); font: inherit; border-top-color: var(--line); }
  .cname { font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -.02em; }
  .cnum { font-family: var(--mono); font-weight: 400; font-size: .7rem; color: var(--muted); margin-right: .5rem; }
  .csum { color: var(--muted); font-size: .8rem; white-space: nowrap; }
  .head { display: flex; align-items: flex-start; gap: .25rem; }
  .titles { flex: 1; display: grid; min-width: 0; }
  .name { text-align: left; padding: 0; min-height: 32px; border: 0; background: transparent; font: inherit; font-size: 1.2rem; font-weight: 700; letter-spacing: -.03em; line-height: 1.1; color: var(--text); }
  strong { font-size: 1.2rem; letter-spacing: -.03em; line-height: 1.1; }
  .sub { font-family: var(--mono); font-size: .68rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  .icon { min-width: 44px; border: 0; background: transparent; color: var(--text); font-size: 1.4rem; font-weight: 700; }
  .last { margin: 0; font-size: .8rem; color: var(--muted); }
  .sets { display: grid; gap: .35rem; }
  .row { display: grid; grid-template-columns: 34px minmax(0, 1.3fr) minmax(0, 1fr) 56px; gap: .35rem; align-items: center; }
  .row.current { outline: 2px solid var(--accent); outline-offset: 3px; }
  .row.nocheck { grid-template-columns: 34px minmax(0, 1.3fr) minmax(0, 1fr); }
  .row.done { opacity: .75; }
  .unit { color: var(--muted); font-size: .8rem; }
  /* schermi stretti (iPhone SE, 320 px): colonne laterali più strette, così carico e ripetizioni restano leggibili */
  @media (max-width: 359px) {
    .row { grid-template-columns: 28px minmax(0, 1.3fr) minmax(0, 1fr) 46px; gap: .25rem; }
    .row.nocheck { grid-template-columns: 28px minmax(0, 1.3fr) minmax(0, 1fr); }
    .card { padding: .5rem .45rem .6rem; }
  }
  .badge { min-height: 44px; border: 1px solid var(--line); border-radius: 0; background: transparent; font-family: var(--mono); font-weight: 700; color: var(--muted); padding: 0; }
  .badge.k-warmup { color: var(--warn); border-color: var(--warn); }
  .badge.k-drop { color: var(--text); border-color: var(--text); }
  .badge.k-failure { color: var(--danger); border-color: var(--danger); }
  /* Spunta: quadrato con bordo pieno, diventa arancio quando la serie è fatta. */
  .check { min-height: 52px; touch-action: manipulation; border: 2px solid var(--text); border-radius: 0; background: transparent; color: var(--on-accent); font-size: 1.5rem; font-weight: 700; padding: 0; }
  .check.on { background: var(--accent); border-color: var(--accent); }
  .record { margin: 0 0 0 40px; font-size: .8rem; color: var(--text); font-weight: 700; }
  .foot { display: flex; gap: .5rem; }
  .foot button { flex: 1; min-height: 44px; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 700; }
  .foot button:disabled { opacity: .4; }
</style>
