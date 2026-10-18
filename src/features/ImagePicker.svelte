<script lang="ts">
  import { searchExercises } from '../domain/search'
  import type { Exercise } from '../domain/types'
  import { db } from '../db/db'
  import { resetImage, setBuiltinImage, setPhoto } from '../db/images'
  import { imageUrl } from '../services/assetCache'
  import { resizePhoto } from '../services/imageResize'
  import synonyms from '../data/synonyms.json'

  let { exercise, all, onclose }: { exercise: Exercise; all: Exercise[]; onclose: () => void } = $props()

  let query = $state('')
  let busy = $state(false)
  let error = $state('')

  // Se non si cerca nulla, si parte dagli esercizi simili (stesso muscolo principale).
  const candidates = $derived(
    searchExercises(
      all.filter((e) => e.id !== exercise.id && e.images.length > 0),
      query.trim() ? { query } : { muscle: exercise.primaryMuscles[0] },
      { synonyms },
    ).slice(0, 30),
  )

  async function run(action: () => Promise<void>) {
    busy = true
    error = ''
    try {
      await action()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Operazione non riuscita'
    } finally {
      busy = false
    }
  }

  function onFile(ev: Event) {
    const file = (ev.currentTarget as HTMLInputElement).files?.[0]
    if (file) run(async () => setPhoto(db, exercise.id, await resizePhoto(file)))
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Cambia immagine">
  <div class="sheet">
    <header>
      <h2>Immagine: {exercise.name}</h2>
      <button class="close" onclick={onclose} aria-label="Chiudi">✕</button>
    </header>

    <div class="actions">
      <label class="btn">
        📷 Scatta o scegli una foto
        <input type="file" accept="image/*" onchange={onFile} disabled={busy} hidden />
      </label>
      <button class="btn" onclick={() => run(() => resetImage(db, exercise.id))} disabled={busy}>↺ Ripristina originale</button>
    </div>
    {#if error}<p class="err">{error}</p>{/if}

    <h3>Oppure usa l'immagine di un altro esercizio</h3>
    <input type="search" placeholder="Cerca esercizio" bind:value={query} autocomplete="off" autocapitalize="off" />

    <ul>
      {#each candidates as c (c.id)}
        <li>
          <p class="cname">{c.name}</p>
          <div class="row">
            {#each c.images as path}
              <button class="thumb" onclick={() => run(() => setBuiltinImage(db, exercise.id, path))} disabled={busy} aria-label={`Usa questa immagine di ${c.name}`}>
                <img src={imageUrl(path)} alt="" loading="lazy" height="90" />
              </button>
            {/each}
          </div>
        </li>
      {:else}
        <li class="empty">Nessun esercizio trovato.</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; }
  .sheet {
    width: 100%; max-height: 88%; overflow-y: auto; background: var(--bg);
    border-radius: 0; padding: 1rem; padding-bottom: calc(1rem + env(safe-area-inset-bottom));
  }
  header { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
  h2 { font-size: 1.05rem; margin: 0; }
  h3 { font-size: .9rem; color: var(--muted); margin: 1rem 0 .5rem; font-weight: 600; }
  .close { min-width: 44px; border: 0; background: transparent; font-size: 1.2rem; }
  .actions { display: grid; gap: .5rem; margin-top: .75rem; }
  .btn {
    display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 1rem;
    background: var(--surface); border: 0; border-radius: 0; text-align: center;
  }
  input[type='search'] { width: 100%; min-height: 44px; padding: 0 .75rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); }
  ul { list-style: none; padding: 0; margin: .75rem 0 0; display: grid; gap: .75rem; }
  .cname { margin: 0 0 .25rem; font-size: .85rem; font-weight: 600; }
  .row { display: flex; gap: .5rem; overflow-x: auto; }
  .thumb { padding: 0; min-height: 0; border: 2px solid transparent; border-radius: var(--r-sm); background: none; }
  .thumb img { height: 90px; width: auto; border-radius: 0; display: block; background: var(--border); }
  .empty, .err { color: var(--muted); font-size: .85rem; }
  .err { color: var(--danger); }
</style>
