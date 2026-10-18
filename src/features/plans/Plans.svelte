<script lang="ts">
  import { onMount } from 'svelte'
  import { liveQuery } from 'dexie'
  import { db } from '../../db/db'
  import { newPlan } from '../../domain/plan'
  import type { Plan } from '../../domain/types'
  import { go } from '../../ui/router.svelte'

  let plans = $state<Plan[]>([])
  let loaded = $state(false)
  let name = $state('')

  onMount(() => {
    const sub = liveQuery(() => db.plans.orderBy('updatedAt').reverse().toArray()).subscribe((p) => {
      plans = p
      loaded = true
    })
    return () => sub.unsubscribe()
  })

  async function create(ev: Event) {
    ev.preventDefault()
    const plan = newPlan(name)
    await db.plans.add($state.snapshot(plan))
    name = ''
    go(`#/schede/${plan.id}`)
  }
</script>

<section>
  <h1>Schede</h1>

  {#if loaded && plans.length === 0}
    <p class="muted">Non hai ancora nessuna scheda. Creane una qui sotto: poi aggiungi i giorni (Push, Pull, Gambe…) e gli esercizi.</p>
  {/if}

  <ul>
    {#each plans as p (p.id)}
      <li>
        <a href={`#/schede/${p.id}`}>
          <strong>{p.name}</strong>
          <span class="muted">{p.days.length} {p.days.length === 1 ? 'giorno' : 'giorni'}{p.days.length ? ' · ' + p.days.map((d) => d.name).join(', ') : ''}</span>
        </a>
      </li>
    {/each}
  </ul>

  <a class="import" href="#/schede/importa">Importa una scheda da file (CSV, Excel)</a>

  <form onsubmit={create}>
    <input bind:value={name} placeholder="Nome della nuova scheda" autocapitalize="sentences" />
    <button type="submit">Crea scheda</button>
  </form>
</section>

<style>
  ul { list-style: none; padding: 0; margin: 0 0 1rem; display: grid; gap: .5rem; }
  li a { display: grid; gap: 2px; padding: .8rem 1rem; background: var(--surface); border: 0; border-radius: 0; color: inherit; text-decoration: none; }
  .muted { color: var(--muted); font-size: .85rem; }
  .import { display: block; margin: 0 0 1rem; min-height: 48px; line-height: 48px; text-align: center; border: 1.5px solid var(--text); border-radius: var(--pill); color: var(--text); font-weight: 700; text-decoration: none; font-weight: 600; }
  form { display: grid; gap: .5rem; }
  input { min-height: 48px; padding: 0 .9rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); }
  form button { min-height: 48px; border: 0; border-radius: var(--pill); background: var(--accent); color: var(--on-accent); font-weight: 600; }
</style>
