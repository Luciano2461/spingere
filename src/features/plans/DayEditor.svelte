<script lang="ts">
  import { onMount } from 'svelte'
  import { liveQuery } from 'dexie'
  import { db } from '../../db/db'
  import {
    addExercise, blocks, isLinkedWithNext, moveBlock, moveInGroup, newPlanExercise, removeExercise, toggleLink,
    touch, updateExercise, updateGroup,
  } from '../../domain/plan'
  import type { Exercise, GroupKind, Plan, PlanDay, PlanExercise } from '../../domain/types'
  import { DEFAULT_SETTINGS } from '../../domain/types'
  import { TYPE_LABELS } from '../../data/labels'
  import Stepper from '../../ui/Stepper.svelte'
  import { sortable } from '../../ui/sortable'
  import ExercisePickerSheet from './ExercisePickerSheet.svelte'

  let { planId, dayId }: { planId: string; dayId: string } = $props()

  let plan = $state<Plan | null>(null)
  let missing = $state(false)
  let exercises = $state(new Map<string, Exercise>())
  let defaultRest = $state(DEFAULT_SETTINGS.defaultRestSeconds)
  let weightStep = $state(2.5)
  let picking = $state(false)

  const day = $derived(plan?.days.find((d) => d.id === dayId) ?? null)
  const bl = $derived(day ? blocks(day) : [])

  onMount(() => {
    db.plans.get(planId).then((p) => {
      if (p && p.days.some((d) => d.id === dayId)) plan = p
      else missing = true
    })
    db.settings.get('settings').then((s) => {
      defaultRest = s?.defaultRestSeconds ?? defaultRest
      weightStep = s?.weightStep ?? weightStep
    })
    const sub = liveQuery(() => db.exercises.toArray()).subscribe((list) => (exercises = new Map(list.map((e) => [e.id, e]))))
    return () => sub.unsubscribe()
  })

  async function setDay(next: PlanDay) {
    if (!plan) return
    plan = touch({ ...plan, days: plan.days.map((d) => (d.id === dayId ? next : d)) })
    await db.plans.put($state.snapshot(plan))
  }

  const typeOf = (e: PlanExercise) => exercises.get(e.exerciseId)?.type ?? 'weight_reps'
  const patch = (i: number, p: Partial<PlanExercise>) => day && setDay(updateExercise(day, i, p))

  function remove(i: number) {
    if (day && confirm(`Togliere «${day.exercises[i].nameSnapshot}» da questo giorno?`)) setDay(removeExercise(day, i))
  }

  const groupOf = (id: string) => day?.groups.find((g) => g.id === id)
  const range = (start: number, length: number) => Array.from({ length }, (_, k) => start + k)
</script>

{#snippet blockMoves(bi: number)}
  <button class="icon" aria-label="Sposta su" disabled={bi === 0} onclick={() => setDay(moveBlock(day!, bi, bi - 1))}>↑</button>
  <button class="icon" aria-label="Sposta giù" disabled={bi === bl.length - 1} onclick={() => setDay(moveBlock(day!, bi, bi + 1))}>↓</button>
{/snippet}

{#snippet card(i: number, grouped: boolean, bi: number = -1)}
  {@const e = day!.exercises[i]}
  {@const t = typeOf(e)}
  <div class="card">
    <div class="top">
      {#if !grouped}<span class="handle" aria-label="Trascina per riordinare">⠿</span>{/if}
      <input
        class="name"
        value={e.nameSnapshot}
        aria-label="Nome dell'esercizio"
        onchange={(ev) => patch(i, { nameSnapshot: ev.currentTarget.value.trim() || exercises.get(e.exerciseId)?.name || e.nameSnapshot })}
      />
      {#if !grouped}
        {@render blockMoves(bi)}
      {:else}
        <button class="icon" aria-label="Sposta su" disabled={!isLinkedWithNext(day!, i - 1)} onclick={() => setDay(moveInGroup(day!, i, -1))}>↑</button>
        <button class="icon" aria-label="Sposta giù" disabled={!isLinkedWithNext(day!, i)} onclick={() => setDay(moveInGroup(day!, i, 1))}>↓</button>
      {/if}
      <button class="icon" aria-label="Rimuovi esercizio" onclick={() => remove(i)}>✕</button>
    </div>
    {#if exercises.get(e.exerciseId) && exercises.get(e.exerciseId)!.name !== e.nameSnapshot}
      <p class="orig">{exercises.get(e.exerciseId)!.name} · {TYPE_LABELS[t]}</p>
    {:else}
      <p class="orig">{TYPE_LABELS[t]}</p>
    {/if}

    <div class="fields">
      {#if t === 'cardio'}
        <Stepper label="Durata" unit="min" value={Math.round((e.targetSeconds ?? 600) / 60)} min={1} onchange={(v) => patch(i, { targetSeconds: v * 60, targetSets: 1 })} />
      {:else}
        <Stepper label="Serie" value={e.targetSets} min={1} max={30} onchange={(v) => patch(i, { targetSets: v })} />
        {#if t === 'timed'}
          <Stepper label="Durata" unit="sec" step={5} value={e.targetSeconds} min={5} onchange={(v) => patch(i, { targetSeconds: v })} />
        {:else}
          <Stepper label="Ripetizioni" value={e.targetReps} min={1} max={200} onchange={(v) => patch(i, { targetReps: v })} />
        {/if}
        {#if t === 'weight_reps'}
          <Stepper label="Carico" unit="kg" decimal step={weightStep} value={e.targetWeight} onchange={(v) => patch(i, { targetWeight: v })} />
        {:else if t === 'weighted_bodyweight'}
          <Stepper label="Zavorra (− assistenza)" unit="kg" decimal step={weightStep} min={-200} value={e.targetWeight ?? 0} onchange={(v) => patch(i, { targetWeight: v })} />
        {/if}
        {#if !grouped}
          <Stepper label="Recupero" unit="sec" step={15} value={e.restSeconds} onchange={(v) => patch(i, { restSeconds: v })} />
        {/if}
      {/if}
    </div>
    <input class="notes" placeholder="Note (facoltative)" value={e.notes} onchange={(ev) => patch(i, { notes: ev.currentTarget.value })} />

    {#if i < day!.exercises.length - 1}
      <button class="link" onclick={() => setDay(toggleLink(day!, i, 'superset', defaultRest))}>
        {isLinkedWithNext(day!, i) ? '⛓ Collegato al successivo · tocca per scollegare' : '⛓ Collega al successivo (superserie)'}
      </button>
    {/if}
  </div>
{/snippet}

<section>
  <a class="back" href={`#/schede/${planId}`}>‹ {plan?.name ?? 'Scheda'}</a>

  {#if missing}
    <p>Giorno non trovato.</p>
  {:else if plan && day}
    <input
      class="title"
      value={day.name}
      aria-label="Nome del giorno"
      onchange={(ev) => setDay({ ...day!, name: ev.currentTarget.value.trim() || day!.name })}
    />

    {#if day.exercises.length === 0}
      <p class="muted">Nessun esercizio. Aggiungine dal database (cerca anche con i tuoi nomi o con nomi inglesi).</p>
    {/if}

    <div class="list" use:sortable={{ handle: '.handle', onmove: (from, to) => setDay(moveBlock(day!, from, to)) }}>
      {#each bl as b, bi (b.start + ':' + b.length + ':' + (b.groupId ?? ''))}
        <div class="block">
          {#if b.groupId}
            {@const g = groupOf(b.groupId)}
            <div class="group">
              <div class="ghead">
                <span class="handle" aria-label="Trascina il gruppo per riordinare">⠿</span>
                <select value={g?.kind} onchange={(ev) => setDay(updateGroup(day!, b.groupId!, { kind: ev.currentTarget.value as GroupKind }))} aria-label="Tipo di gruppo">
                  <option value="superset">Superserie</option>
                  <option value="circuit">Circuito</option>
                </select>
                {@render blockMoves(bi)}
                <div class="grest">
                  <Stepper label="Recupero a fine giro" unit="sec" step={15} value={g?.restAfterGroup} onchange={(v) => setDay(updateGroup(day!, b.groupId!, { restAfterGroup: v }))} />
                </div>
              </div>
              {#each range(b.start, b.length) as i (i)}
                {@render card(i, true)}
              {/each}
            </div>
          {:else}
            {@render card(b.start, false, bi)}
          {/if}
        </div>
      {/each}
    </div>

    <button class="add" onclick={() => (picking = true)}>＋ Aggiungi esercizio</button>
  {/if}

  {#if picking && day}
    <ExercisePickerSheet
      onadd={(e) => setDay(addExercise(day!, newPlanExercise(e, defaultRest)))}
      onclose={() => (picking = false)}
    />
  {/if}
</section>

<style>
  .back { display: inline-block; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
  .title { width: 100%; font: inherit; font-size: 1.6rem; font-weight: 700; letter-spacing: -.03em; border: 0; border-bottom: 1.5px dashed var(--line); background: transparent; color: var(--text); padding: .2rem 0; margin-bottom: .75rem; }
  .muted { color: var(--muted); }
  .list { display: grid; grid-template-columns: minmax(0, 1fr); gap: .75rem; }
  .block, .group, .card { min-width: 0; }
  .group { border-left: 4px solid var(--accent); padding: .1rem 0 .1rem .5rem; display: grid; grid-template-columns: minmax(0, 1fr); gap: .5rem; }
  .ghead { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .5rem; }
  .ghead select { min-height: 44px; border: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--text); font: inherit; padding: 0 .5rem; }
  .grest { flex-basis: 100%; }
  .card { background: var(--surface); border: 0; border-radius: 0; padding: .6rem; display: grid; grid-template-columns: minmax(0, 1fr); gap: .4rem; }
  .top { display: flex; align-items: center; gap: .25rem; }
  .handle { min-width: 36px; text-align: center; font-size: 1.4rem; color: var(--muted); touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; line-height: 44px; }
  .name { flex: 1; min-width: 0; min-height: 44px; font: inherit; font-weight: 600; color: var(--text); background: transparent; border: 0; border-bottom: 1.5px dashed var(--line); }
  .icon { min-width: 44px; border: 0; background: transparent; color: var(--text); font-size: 1.1rem; }
  .icon:disabled { opacity: .25; }
  .orig { margin: 0; font-size: .75rem; color: var(--muted); }
  .fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .5rem; }
  .notes { width: 100%; min-width: 0; min-height: 40px; padding: 0 .6rem; font: inherit; font-size: 16px; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 0; }
  .link { min-height: 40px; border: 0; background: transparent; color: var(--text); font-weight: 700; font-size: .85rem; text-align: left; padding: 0; }
  .add { width: 100%; margin-top: 1rem; min-height: 52px; border: 0; border-radius: var(--pill); background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: 1rem; }
  :global(.drag-ghost) { opacity: .4; }
</style>
