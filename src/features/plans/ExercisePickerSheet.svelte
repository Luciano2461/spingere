<script lang="ts">
  import ExerciseBrowser from '../ExerciseBrowser.svelte'
  import type { Exercise } from '../../domain/types'

  let { onadd, onclose, title = 'Aggiungi esercizi', single = false }: { onadd: (e: Exercise) => void; onclose: () => void; title?: string; single?: boolean } = $props()

  let added = $state<string[]>([])
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label={title}>
  <div class="sheet">
    <header>
      <h2>{title}</h2>
      <button class="done" onclick={onclose}>Fine{added.length ? ` (${added.length})` : ''}</button>
    </header>
    {#if added.length}<p class="toast" role="status">Aggiunto: {added[added.length - 1]}</p>{/if}
    <ExerciseBrowser
      onselect={(e) => {
        onadd(e)
        if (single) onclose()
        else added = [...added, e.name]
      }}
    />
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; }
  .sheet { width: 100%; height: 92%; overflow-y: auto; background: var(--bg); border-radius: 0; padding: 1rem; padding-bottom: calc(1rem + env(safe-area-inset-bottom)); }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
  h2 { font-size: 1.1rem; margin: 0; }
  .done { min-height: 44px; padding: 0 1rem; border: 0; border-radius: var(--pill); background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .toast { margin: 0 0 .5rem; padding: .4rem .7rem; font-size: .85rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0; }
</style>
