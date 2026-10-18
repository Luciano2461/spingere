<script lang="ts">
  import { onMount } from 'svelte'
  import { liveQuery } from 'dexie'
  import { db } from '../db/db'
  import type { Alias } from '../domain/types'

  let { exerciseId }: { exerciseId: string } = $props()

  let rows = $state<Alias[]>([])
  let text = $state('')

  onMount(() => {
    const sub = liveQuery(() => db.aliases.where('exerciseId').equals(exerciseId).toArray()).subscribe((r) => (rows = r))
    return () => sub.unsubscribe()
  })

  async function add(ev: Event) {
    ev.preventDefault()
    const value = text.trim()
    if (!value || rows.some((r) => r.text.toLowerCase() === value.toLowerCase())) return
    await db.aliases.add({ id: crypto.randomUUID(), exerciseId, text: value })
    text = ''
  }
</script>

<div class="aliases">
  <p class="label">I tuoi nomi per questo esercizio</p>
  {#if rows.length}
    <ul>
      {#each rows as r (r.id)}
        <li>{r.text} <button onclick={() => db.aliases.delete(r.id)} aria-label={`Rimuovi ${r.text}`}>✕</button></li>
      {/each}
    </ul>
  {/if}
  <form onsubmit={add}>
    <input bind:value={text} placeholder="Es. «panca del lunedì»" autocapitalize="off" />
    <button type="submit" disabled={!text.trim()}>Aggiungi</button>
  </form>
</div>

<style>
  .label { color: var(--muted); font-size: .8rem; margin: .75rem 0 .25rem; }
  ul { list-style: none; padding: 0; margin: 0 0 .5rem; display: flex; flex-wrap: wrap; gap: .4rem; }
  li { display: flex; align-items: center; gap: .25rem; padding: 0 0 0 .7rem; background: var(--bg); border: 1px solid var(--border); border-radius: 999px; font-size: .85rem; }
  li button { min-width: 36px; min-height: 36px; border: 0; background: transparent; color: var(--muted); }
  form { display: flex; gap: .5rem; }
  input { flex: 1; min-width: 0; min-height: 44px; padding: 0 .75rem; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-sm); }
  form button { padding: 0 .9rem; border: 0; border-radius: 0; background: var(--bg); }
  form button:disabled { opacity: .5; }
</style>
