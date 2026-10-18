<script lang="ts">
  import { onMount } from 'svelte'
  import { liveQuery } from 'dexie'
  import { db } from '../db/db'
  import { searchExercises } from '../domain/search'
  import type { Exercise } from '../domain/types'
  import { EQUIPMENT_LABELS, MUSCLE_LABELS, TYPE_LABELS, equipmentLabel, muscleLabel } from '../data/labels'
  import ExerciseImages from './ExerciseImages.svelte'
  import ImagePicker from './ImagePicker.svelte'
  import ExerciseAliases from './ExerciseAliases.svelte'
  import ExerciseForm from './ExerciseForm.svelte'
  import { deleteCustomExercise } from '../db/exercises'
  import { isCustom } from '../domain/customExercise'
  import synonyms from '../data/synonyms.json'

  // Se `onselect` è passato (es. dal selettore di una scheda) il tocco sceglie l'esercizio invece di aprire il dettaglio.
  let { onselect }: { onselect?: (exercise: Exercise) => void } = $props()

  const PAGE = 60
  let all = $state<Exercise[]>([])
  let loaded = $state(false)
  let query = $state('')
  let muscle = $state('')
  let equipment = $state('')
  let limit = $state(PAGE)
  let openId = $state<string | null>(null)
  let aliases = $state(new Map<string, string[]>())
  let pickerFor = $state<Exercise | null>(null)
  let formFor = $state<{ exercise?: Exercise } | null>(null)
  let thumbs = $state(new Map<string, string>())

  const results = $derived(searchExercises(all, { query, muscle, equipment }, { synonyms, aliases }))
  const shown = $derived(results.slice(0, limit))
  const untranslated = $derived(all.filter((e) => e.needsTranslation).length)

  // liveQuery: la lista si aggiorna da sola quando il caricamento iniziale degli esercizi finisce.
  onMount(() => {
    const sub = liveQuery(() => db.exercises.toArray()).subscribe((list) => {
      all = list
      loaded = list.length > 0
    })
    // nomi personali: contano nella ricerca
    const aliasSub = liveQuery(() => db.aliases.toArray()).subscribe((rows) => {
      const map = new Map<string, string[]>()
      for (const r of rows) map.set(r.exerciseId, [...(map.get(r.exerciseId) ?? []), r.text])
      aliases = map
    })
    // miniature delle foto personali (poche): un URL per foto, liberato quando cambiano
    const photoSub = liveQuery(async () => {
      const choices = (await db.imageChoices.toArray()).filter((c) => c.kind === 'photo' && c.photoId)
      const out: [string, Blob][] = []
      for (const c of choices) {
        const p = await db.photos.get(c.photoId!)
        if (p) out.push([c.exerciseId, p.blob])
      }
      return out
    }).subscribe((rows) => {
      for (const url of thumbs.values()) URL.revokeObjectURL(url)
      thumbs = new Map(rows.map(([id, blob]) => [id, URL.createObjectURL(blob)]))
    })
    return () => {
      sub.unsubscribe()
      aliasSub.unsubscribe()
      photoSub.unsubscribe()
      for (const url of thumbs.values()) URL.revokeObjectURL(url)
    }
  })

  $effect(() => {
    query; muscle; equipment
    limit = PAGE
  })

  async function removeCustom(e: Exercise) {
    if (!confirm(`Eliminare «${e.name}»? Non comparirà più nelle ricerche; allenamenti già fatti, record e schede esistenti restano com'erano.`)) return
    await deleteCustomExercise(db, e.id)
    openId = null
  }

  const sortedKeys = (labels: Record<string, string>) => Object.keys(labels).sort((a, b) => labels[a].localeCompare(labels[b], 'it'))
</script>

<div class="filters" class:page={!onselect}>
  <input type="search" placeholder="Cerca esercizio (es. panca, squat, curl)" bind:value={query} autocomplete="off" autocapitalize="off" />
  <div class="row">
    <select bind:value={muscle} aria-label="Muscolo">
      <option value="">Tutti i muscoli</option>
      {#each sortedKeys(MUSCLE_LABELS) as k}<option value={k}>{MUSCLE_LABELS[k]}</option>{/each}
    </select>
    <select bind:value={equipment} aria-label="Attrezzo">
      <option value="">Tutti gli attrezzi</option>
      {#each sortedKeys(EQUIPMENT_LABELS).filter((k) => k !== 'none') as k}<option value={k}>{EQUIPMENT_LABELS[k]}</option>{/each}
    </select>
  </div>
</div>

<button class="create" onclick={() => (formFor = {})}>＋ Crea un tuo esercizio</button>

<p class="count">
  {loaded ? `${results.length} esercizi` : 'Caricamento…'}
  {#if untranslated > 0}· {untranslated} da tradurre{/if}
</p>

<ul>
  {#each shown as e (e.id)}
    <li>
      <button class="item" onclick={() => (onselect ? onselect(e) : (openId = openId === e.id ? null : e.id))}>
        {#if thumbs.get(e.id)}<img class="thumb" src={thumbs.get(e.id)} alt="" />{/if}
        <span class="name">{e.name}</span>
        <span class="meta">{e.primaryMuscles.map(muscleLabel).join(', ') || '—'} · {equipmentLabel(e.equipment)}</span>
      </button>
      {#if !onselect && openId === e.id}
        <div class="detail">
          <ExerciseImages exercise={e} />
          <button class="change" onclick={() => (pickerFor = e)}>🖼 Cambia immagine</button>
          {#if isCustom(e)}
            <button class="change" onclick={() => (formFor = { exercise: e })}>✎ Modifica esercizio</button>
            <button class="change del" onclick={() => removeCustom(e)}>Elimina esercizio</button>
          {/if}
          <dl>
            <dt>Tipo</dt><dd>{TYPE_LABELS[e.type]}</dd>
            <dt>Muscoli principali</dt><dd>{e.primaryMuscles.map(muscleLabel).join(', ') || '—'}</dd>
            {#if e.secondaryMuscles.length}<dt>Secondari</dt><dd>{e.secondaryMuscles.map(muscleLabel).join(', ')}</dd>{/if}
            <dt>Attrezzo</dt><dd>{equipmentLabel(e.equipment)}</dd>
            {#if e.nameOriginal && e.nameOriginal !== e.name}<dt>Nome originale</dt><dd>{e.nameOriginal}</dd>{/if}
          </dl>
          <ExerciseAliases exerciseId={e.id} />
        </div>
      {/if}
    </li>
  {/each}
</ul>

{#if formFor}
  <ExerciseForm
    exercise={formFor.exercise}
    {all}
    oncreated={(e) => {
      if (onselect && !formFor?.exercise) onselect(e)
      else {
        query = e.name // l'esercizio salvato compare in cima e si apre il dettaglio
        openId = e.id
      }
    }}
    onclose={() => (formFor = null)}
  />
{/if}

{#if pickerFor}
  <ImagePicker exercise={pickerFor} {all} onclose={() => (pickerFor = null)} />
{/if}

{#if loaded && shown.length < results.length}
  <button class="more" onclick={() => (limit += PAGE)}>Mostra altri ({results.length - shown.length})</button>
{:else if loaded && results.length === 0}
  <p class="count">Nessun esercizio trovato.</p>
{/if}

<style>
  .filters { position: sticky; top: 0; z-index: 5; background: var(--bg); padding-bottom: .5rem; display: grid; gap: .5rem; }
  /* nella pagina (non nel foglio) la barra fissa copre anche la zona della barra di stato */
  .filters.page { padding-top: env(safe-area-inset-top); margin-top: calc(-1 * env(safe-area-inset-top)); }
  input, select { width: 100%; min-height: 44px; padding: 0 .75rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .count { color: var(--muted); font-size: .85rem; margin: .25rem 0 .5rem; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
  li { background: var(--surface); border: 0; border-radius: 0; overflow: hidden; }
  .item { width: 100%; display: grid; gap: 2px; text-align: left; padding: .6rem .9rem; background: none; border: 0; }
  .name { font-weight: 600; }
  .meta { color: var(--muted); font-size: .8rem; }
  .detail { padding: 0 .9rem .9rem; }
  .change { margin: .5rem 0; padding: 0 .9rem; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 700; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: .15rem .75rem; margin: 0; font-size: .85rem; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .create { width: 100%; min-height: 48px; margin: .25rem 0; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 600; }
  .thumb { width: 44px; height: 44px; object-fit: cover; border-radius: 0; float: left; margin-right: .6rem; }
  .change.del { color: var(--danger); border-color: var(--danger); margin-left: .5rem; }
  .more { width: 100%; margin-top: .75rem; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 700; }
</style>
