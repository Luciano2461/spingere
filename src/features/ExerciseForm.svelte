<script lang="ts">
  import { db } from '../db/db'
  import { saveCustomExercise, type PhotoChange } from '../db/exercises'
  import { EQUIPMENT_LABELS, MUSCLE_LABELS, TYPE_LABELS } from '../data/labels'
  import { EMPTY_FORM, applyForm, formFromExercise, newCustomExercise, validateName, type ExerciseForm } from '../domain/customExercise'
  import type { Exercise, ExerciseType } from '../domain/types'
  import { resizePhoto } from '../services/imageResize'
  import ExerciseImages from './ExerciseImages.svelte'

  let { exercise, all, oncreated, onclose }: { exercise?: Exercise; all: Exercise[]; oncreated?: (e: Exercise) => void; onclose: () => void } = $props()

  // Il form parte dai valori iniziali dell'esercizio: non deve seguirne le modifiche mentre si scrive.
  // svelte-ignore state_referenced_locally
  const editing = !!exercise
  // svelte-ignore state_referenced_locally
  let form = $state<ExerciseForm>(exercise ? formFromExercise(exercise) : { ...EMPTY_FORM })
  let nameError = $state('')
  let error = $state('')
  let saving = $state(false)
  let photo = $state.raw<PhotoChange>({ kind: 'keep' })
  let preview = $state<string | null>(null)

  const types = Object.keys(TYPE_LABELS) as ExerciseType[]
  const sortedKeys = (labels: Record<string, string>) => Object.keys(labels).sort((a, b) => labels[a].localeCompare(labels[b], 'it'))
  const muscles = sortedKeys(MUSCLE_LABELS)
  const equipment = sortedKeys(EQUIPMENT_LABELS).filter((k) => k !== 'none')

  function toggle(list: 'primaryMuscles' | 'secondaryMuscles', key: string) {
    const other = list === 'primaryMuscles' ? 'secondaryMuscles' : 'primaryMuscles'
    const has = form[list].includes(key)
    form[list] = has ? form[list].filter((m) => m !== key) : [...form[list], key]
    if (!has) form[other] = form[other].filter((m) => m !== key) // un muscolo o è principale o è secondario
  }

  async function onFile(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    error = ''
    try {
      const blob = await resizePhoto(file)
      if (preview) URL.revokeObjectURL(preview)
      preview = URL.createObjectURL(blob)
      photo = { kind: 'set', blob }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Foto non valida'
    }
  }

  function removePhoto() {
    if (preview) URL.revokeObjectURL(preview)
    preview = null
    photo = editing ? { kind: 'remove' } : { kind: 'keep' }
  }

  $effect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  })

  async function save(ev: Event) {
    ev.preventDefault()
    nameError = validateName(form.name, all, exercise?.id) ?? ''
    if (nameError || saving) return
    saving = true
    error = ''
    try {
      const snapshot = $state.snapshot(form)
      // $state.snapshot: l'esercizio arriva da una lista reattiva e IndexedDB non accetta proxy
      const saved = exercise ? applyForm($state.snapshot(exercise), snapshot) : newCustomExercise(snapshot)
      await saveCustomExercise(db, saved, photo)
      oncreated?.(saved)
      onclose()
    } catch {
      error = 'Salvataggio non riuscito. Riprova.'
      saving = false
    }
  }

  const showCurrent = $derived(editing && photo.kind === 'keep')
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label={editing ? 'Modifica esercizio' : 'Nuovo esercizio'}>
  <form class="sheet" onsubmit={save}>
    <header>
      <h2>{editing ? 'Modifica esercizio' : 'Nuovo esercizio'}</h2>
      <button type="button" class="close" onclick={onclose} aria-label="Chiudi">✕</button>
    </header>

    <label>Nome
      <input bind:value={form.name} placeholder="Es. Panca con presa speciale" autocapitalize="sentences" maxlength="80" aria-invalid={!!nameError} />
    </label>
    {#if nameError}<p class="err" role="alert">{nameError}</p>{/if}

    <label>Tipo
      <select bind:value={form.type}>
        {#each types as t}<option value={t}>{TYPE_LABELS[t]}</option>{/each}
      </select>
    </label>
    {#if editing}<p class="hint">Se cambi il tipo, vale per i prossimi allenamenti: quelli già fatti restano come sono.</p>{/if}

    <label>Attrezzo
      <select bind:value={form.equipment}>
        {#each equipment as k}<option value={k}>{EQUIPMENT_LABELS[k]}</option>{/each}
      </select>
    </label>

    <fieldset>
      <legend>Muscoli principali</legend>
      <div class="chips">
        {#each muscles as m}
          <button type="button" class="chip" class:on={form.primaryMuscles.includes(m)} aria-pressed={form.primaryMuscles.includes(m)} onclick={() => toggle('primaryMuscles', m)}>{MUSCLE_LABELS[m]}</button>
        {/each}
      </div>
    </fieldset>
    <fieldset>
      <legend>Muscoli secondari (contano mezza serie nelle statistiche)</legend>
      <div class="chips">
        {#each muscles as m}
          <button type="button" class="chip" class:on={form.secondaryMuscles.includes(m)} aria-pressed={form.secondaryMuscles.includes(m)} onclick={() => toggle('secondaryMuscles', m)}>{MUSCLE_LABELS[m]}</button>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Foto (facoltativa)</legend>
      {#if preview}
        <img class="photo" src={preview} alt="Anteprima della foto" />
      {:else if showCurrent && exercise}
        <ExerciseImages {exercise} />
      {/if}
      <div class="photobtns">
        <label class="btn">
          📷 Scatta o scegli una foto
          <input type="file" accept="image/*" onchange={onFile} hidden />
        </label>
        {#if preview || (showCurrent && photo.kind === 'keep' && editing)}
          <button type="button" class="btn" onclick={removePhoto}>Rimuovi foto</button>
        {/if}
      </div>
      <p class="hint">La foto resta sul tuo dispositivo ed è inclusa nel backup.</p>
    </fieldset>

    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <div class="bar">
      <button type="button" class="ghost" onclick={onclose} disabled={saving}>Annulla</button>
      <button type="submit" class="primary" disabled={saving}>{saving ? 'Salvo…' : 'Salva'}</button>
    </div>
  </form>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; }
  .sheet { width: 100%; max-height: 94%; overflow-y: auto; background: var(--bg); border-radius: 0; padding: 1rem; padding-bottom: calc(1rem + env(safe-area-inset-bottom)); display: grid; gap: .6rem; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h2 { font-size: 1.1rem; margin: 0; }
  .close { min-width: 44px; border: 0; background: transparent; font-size: 1.2rem; }
  label { display: grid; gap: .25rem; font-size: .85rem; color: var(--muted); }
  input, select { width: 100%; min-height: 48px; padding: 0 .75rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: .4rem; }
  legend { font-size: .85rem; color: var(--muted); padding: 0; margin-bottom: .25rem; }
  .chips { display: flex; flex-wrap: wrap; gap: .4rem; }
  .chip { min-height: 40px; padding: 0 .8rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); font-size: .85rem; }
  .chip.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
  .photo { max-height: 180px; width: auto; border-radius: var(--r-sm); justify-self: start; }
  .photobtns { display: grid; gap: .5rem; }
  .btn { display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--pill); color: var(--text); font-size: 1rem; }
  .hint { margin: 0; font-size: .8rem; color: var(--muted); }
  .err { margin: 0; color: var(--danger); font-size: .9rem; }
  .bar { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-top: .5rem; }
  .bar button { min-height: 52px; border-radius: var(--pill); font-weight: 700; font-size: 1rem; }
  .ghost { border: 1.5px solid var(--text); background: transparent; color: var(--text); }
  .primary { border: 0; background: var(--accent); color: var(--on-accent); }
  .bar button:disabled { opacity: .5; }
</style>
