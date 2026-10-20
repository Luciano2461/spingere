<script lang="ts">
  import { ask } from '../../ui/confirm.svelte'
  import { onMount } from 'svelte'
  import { db } from '../../db/db'
  import { arrayMove, duplicatePlan, newDay, touch } from '../../domain/plan'
  import type { Plan } from '../../domain/types'
  import { go } from '../../ui/router.svelte'

  let { planId }: { planId: string } = $props()

  let plan = $state<Plan | null>(null)
  let missing = $state(false)
  let dayName = $state('')
  let deleteError = $state('')

  onMount(async () => {
    const found = await db.plans.get(planId)
    if (found) plan = found
    else missing = true
  })

  async function commit(next: Plan) {
    plan = touch(next)
    await db.plans.put($state.snapshot(plan))
  }

  async function addDay(ev: Event) {
    ev.preventDefault()
    if (!plan) return
    const day = newDay(dayName)
    dayName = ''
    await commit({ ...plan, days: [...plan.days, day] })
    go(`#/schede/${plan.id}/${day.id}`)
  }

  async function removeDay(id: string, name: string) {
    if (!plan || !(await ask(`Eliminare il giorno «${name}» e i suoi esercizi? Lo storico degli allenamenti già fatti non cambia.`, { confirmLabel: 'Elimina giorno' }))) return
    await commit({ ...plan!, days: plan!.days.filter((d) => d.id !== id) })
  }

  async function copy() {
    if (!plan) return
    const dup = duplicatePlan($state.snapshot(plan))
    await db.plans.add(dup)
    go(`#/schede/${dup.id}`)
  }

  async function removePlan() {
    if (!plan || !(await ask(`Eliminare la scheda «${plan.name}»? Lo storico degli allenamenti già fatti non cambia.`, { confirmLabel: 'Elimina scheda' }))) return
    try {
      await db.plans.delete(plan!.id)
      go('#/schede')
    } catch (err) {
      deleteError = `Non sono riuscito a eliminare la scheda: ${err instanceof Error ? err.message : err}. Riprova.`
    }
  }
</script>

<section>
  <a class="back" href="#/schede">‹ Schede</a>

  {#if missing}
    <p>Scheda non trovata.</p>
  {:else if plan}
    <input class="title" value={plan.name} aria-label="Nome scheda" onchange={(e) => commit({ ...plan!, name: e.currentTarget.value.trim() || plan!.name })} />
    <textarea placeholder="Note sulla scheda (facoltative)" rows="2" value={plan.notes} onchange={(e) => commit({ ...plan!, notes: e.currentTarget.value })}></textarea>

    <h2>Giorni</h2>
    <ul>
      {#each plan.days as d, i (d.id)}
        <li>
          <a class="day" href={`#/schede/${plan.id}/${d.id}`}>
            <strong>{d.name}</strong>
            <span class="muted">{d.exercises.length} {d.exercises.length === 1 ? 'esercizio' : 'esercizi'}</span>
          </a>
          <div class="tools">
            <button aria-label="Sposta su" disabled={i === 0} onclick={() => commit({ ...plan!, days: arrayMove(plan!.days, i, i - 1) })}>↑</button>
            <button aria-label="Sposta giù" disabled={i === plan.days.length - 1} onclick={() => commit({ ...plan!, days: arrayMove(plan!.days, i, i + 1) })}>↓</button>
            <button aria-label={`Elimina ${d.name}`} onclick={() => removeDay(d.id, d.name)}>🗑</button>
          </div>
        </li>
      {/each}
    </ul>

    <form onsubmit={addDay}>
      <input bind:value={dayName} placeholder="Nuovo giorno (es. Push, Gambe)" />
      <button type="submit">Aggiungi giorno</button>
    </form>

    <div class="danger">
      <button onclick={copy}>Duplica scheda</button>
      <button class="del" onclick={removePlan}>Elimina scheda</button>
    </div>
    {#if deleteError}<p class="err" role="alert">{deleteError}</p>{/if}
  {/if}
</section>

<style>
  .back { display: inline-block; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
  .title { width: 100%; font: inherit; font-size: 1.6rem; font-weight: 700; letter-spacing: -.03em; border: 0; border-bottom: 1.5px dashed var(--line); background: transparent; color: var(--text); padding: .2rem 0; margin-bottom: .5rem; }
  textarea { width: 100%; padding: .6rem .8rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); resize: vertical; }
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 .6rem; padding: .45rem 0 0; border-top: 1px solid var(--line); }
  ul { list-style: none; padding: 0; margin: 0 0 1rem; display: grid; gap: .5rem; }
  li { display: flex; align-items: stretch; background: var(--surface); border: 0; border-radius: 0; overflow: hidden; }
  .day { flex: 1; display: grid; gap: 2px; padding: .7rem 1rem; color: inherit; text-decoration: none; min-width: 0; }
  .muted { color: var(--muted); font-size: .85rem; }
  .tools { display: flex; }
  .tools button { min-width: 44px; border: 0; border-left: 1px solid var(--border); background: transparent; color: var(--text); }
  .tools button:disabled { opacity: .3; }
  form { display: grid; gap: .5rem; }
  form input { min-height: 48px; padding: 0 .9rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--line); border-radius: 0; }
  form button { min-height: 48px; border: 0; border-radius: var(--pill); background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .danger { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-top: 1.5rem; }
  .danger button { border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 700; }
  .danger button.del { color: var(--danger); border-color: var(--danger); }
  .err { color: var(--danger); font-weight: 700; }
</style>
