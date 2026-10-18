<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { db } from '../../db/db'
  import { discardSession, doneSessions, saveSession } from '../../db/sessions'
  import { fmtDuration, fmtNumber } from '../../domain/format'
  import { blocksOf } from '../../domain/plan'
  import { RECORD_LABELS } from '../../domain/records'
  import {
    addEntry, addSet, completeSet, countUndone, currentSet, finishSession, lastTime, removeEntry, removeSet,
    sessionHasDoneSets, sessionRecords, sessionVolume, updateSet, updateSetAndFollowers,
  } from '../../domain/session'
  import { wakeLockState } from '../../services/wakeLock.svelte'
  import { active, clearActive, commitSession, retrySave, saveState } from '../../state/activeSession.svelte'
  import { appSettings, weightStep } from '../../state/settings.svelte'
  import type { Exercise, Session, SetKind, SetLog } from '../../domain/types'
  import ActionSheet from '../../ui/ActionSheet.svelte'
  import { go } from '../../ui/router.svelte'
  import ExercisePickerSheet from '../plans/ExercisePickerSheet.svelte'
  import EntryCard from './EntryCard.svelte'

  const session = $derived(active.session)
  const loaded = $derived(active.loaded)
  let history = $state<Session[]>([])
  let picking = $state(false)
  let menu = $state(false)
  let exMap = $state(new Map<string, Exercise>())
  let now = $state(Date.now())
  let summary = $state<{ session: Session; records: ReturnType<typeof sessionRecords>; volume: number } | null>(null)

  onMount(() => {
    doneSessions(db).then((h) => (history = h))
    // il cronometro è solo visualizzazione: il tempo si ricalcola sempre da startedAt
    const tick = setInterval(() => (now = Date.now()), 1000)
    const onVisible = () => (now = Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  // esercizi della sessione (per mostrare immagini o foto toccando il nome)
  const exerciseIds = $derived(session ? [...new Set(session.entries.map((e) => e.exerciseId))].join('|') : '')
  $effect(() => {
    const ids = exerciseIds ? exerciseIds.split('|') : []
    let stale = false
    db.exercises.bulkGet(ids).then((rows) => {
      if (!stale) exMap = new Map(rows.filter((r): r is Exercise => !!r).map((r) => [r.id, r]))
    })
    return () => (stale = true)
  })

  const elapsed = $derived(session ? (now - new Date(session.startedAt).getTime()) / 1000 : 0)
  const bl = $derived(session ? blocksOf(session.entries) : [])
  const recs = $derived(session ? sessionRecords(session, history) : [])
  const recsByEntry = $derived.by(() => {
    const m = new Map<number, Map<number, typeof recs[number]['kinds']>>()
    for (const r of recs) m.set(r.entryIndex, (m.get(r.entryIndex) ?? new Map()).set(r.setIndex, r.kinds))
    return m
  })
  const current = $derived(session ? currentSet(session) : null)
  const doneCount = $derived(session ? session.entries.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0) : 0)

  /** Dopo aver completato una serie porta in vista la prossima, così non va cercata nella lista. */
  async function toggleSet(i: number, si: number) {
    const completing = !session!.entries[i].sets[si].done
    await commit(completeSet(session!, i, si, appSettings.defaultRestSeconds))
    if (!completing) return
    await tick()
    document.querySelector('[data-current="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /** Ogni modifica viene salvata subito: l'allenamento sopravvive a chiusura o ricarica dell'app. */
  const commit = commitSession

  async function finish() {
    if (!session) return
    if (!sessionHasDoneSets(session)) {
      if (confirm('Non hai completato nessuna serie. Scartare questo allenamento?')) await discard(false)
      return
    }
    // sempre una conferma: un allenamento concluso non si può riaprire
    const undone = countUndone(session)
    const question = undone > 0
      ? `Hai ${undone} ${undone === 1 ? 'serie non completata' : 'serie non completate'}: non verranno registrate. Terminare l'allenamento?`
      : 'Terminare l\'allenamento? Dopo non si può riaprire.'
    if (!confirm(question)) return
    const done = finishSession($state.snapshot(session))
    await saveSession(db, done)
    summary = { session: done, records: sessionRecords(done, history), volume: sessionVolume(done) }
    clearActive()
  }

  async function discard(ask = true) {
    if (!session) return
    if (ask && !confirm('Eliminare questo allenamento? Quello che hai registrato andrà perso.')) return
    await discardSession(db, session.id)
    clearActive()
    go('#/oggi')
  }
</script>

<section>
  {#if summary}
    {@const s = summary.session}
    <h1>Allenamento<span class="sub">concluso</span></h1>
    <p class="muted">{s.dayName ?? 'Allenamento libero'}{s.planName ? ` · ${s.planName}` : ''}</p>
    <ul class="stats">
      <li><strong>{fmtDuration((new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime()) / 1000)}</strong><span>durata</span></li>
      <li><strong>{s.entries.reduce((n, e) => n + e.sets.length, 0)}</strong><span>serie</span></li>
      <li><strong>{fmtNumber(summary.volume)}</strong><span>kg di volume</span></li>
    </ul>
    {#if summary.records.length}
      <h2>🏆 Record personali</h2>
      <ul class="recs">
        {#each summary.records as r}
          <li><strong>{r.name}</strong> — {r.kinds.map((k) => RECORD_LABELS[k]).join(', ')}</li>
        {/each}
      </ul>
    {/if}
    <button class="primary" onclick={() => go('#/oggi')}>Fine</button>
  {:else if !loaded}
    <p class="muted">Caricamento…</p>
  {:else if !session}
    <p>Nessun allenamento in corso.</p>
    <a class="primary" href="#/oggi">Vai a Oggi</a>
  {:else}
    <header>
      <div class="titles">
        <h1>{session.dayName ?? 'Allenamento libero'}</h1>
        <p class="muted">
          {session.planName ?? 'Senza scheda'}
          <span class="screen" class:off={!wakeLockState.active} title={wakeLockState.active ? 'Lo schermo resta acceso' : 'Schermo non bloccato solo quando l\'app è in primo piano'} aria-label={wakeLockState.active ? 'Schermo acceso' : ''}>{wakeLockState.active ? '☀' : ''}</span>
        </p>
      </div>
      <div class="clock" aria-label="Durata dell'allenamento">{fmtDuration(elapsed)}</div>
      <button class="finish" onclick={finish}>Termina</button>
      <button class="more" aria-label="Altre azioni dell'allenamento" onclick={() => (menu = true)}>⋯</button>
      {#if saveState.failed}
        <p class="savefail" role="alert">
          <span>Non riesco a salvare: le ultime serie potrebbero andare perse se chiudi l'app.</span>
          <button onclick={retrySave}>Riprova</button>
        </p>
      {/if}
    </header>
    {#if !wakeLockState.supported || wakeLockState.failed}
      <p class="warn">⚠ Lo schermo può spegnersi durante il recupero, e con lo schermo bloccato il suono di fine recupero non arriva. Per l'allenamento imposta «Blocco automatico → Mai» (Impostazioni dell'iPhone → Schermo e luminosità).</p>
    {/if}

    <div class="list">
      {#each bl as b (b.start + ':' + b.length + ':' + (b.groupId ?? ''))}
        {#if b.groupId}
          {@const g = session.groups.find((x) => x.id === b.groupId)}
          <div class="group">
            <p class="glabel">{g?.kind === 'circuit' ? 'Circuito' : 'Superserie'} · recupero a fine giro: {g?.restAfterGroup ?? 0} s</p>
            {#each Array.from({ length: b.length }, (_, k) => b.start + k) as i (i)}
              {@render entryCard(i, true)}
            {/each}
          </div>
        {:else}
          {@render entryCard(b.start, false)}
        {/if}
      {/each}
    </div>

    <button class="add" onclick={() => (picking = true)}>＋ Aggiungi esercizio</button>

    <textarea placeholder="Note sull'allenamento (facoltative)" rows="2" value={session.notes} onchange={(e) => commit({ ...session!, notes: e.currentTarget.value })}></textarea>

    <button class="primary" onclick={finish}>Termina allenamento{doneCount ? ` (${doneCount} serie)` : ''}</button>

    {#if menu}
      <ActionSheet
        onclose={() => (menu = false)}
        actions={[{ label: 'Elimina questo allenamento', hint: 'Quello che hai registrato andrà perso', danger: true, onclick: () => discard() }]}
      />
    {/if}

    {#if picking}
      <ExercisePickerSheet onadd={(e) => commit(addEntry(session!, e, history, appSettings.defaultRestSeconds))} onclose={() => (picking = false)} />
    {/if}
  {/if}
</section>

{#snippet entryCard(i: number, grouped: boolean)}
  {@const e = session!.entries[i]}
  <EntryCard
    entry={e}
    exercise={exMap.get(e.exerciseId)}
    last={lastTime(history, e.exerciseId)}
    records={recsByEntry.get(i) ?? new Map()}
    weightStep={weightStep()}
    {grouped}
    index={i}
    currentIndex={current?.entryIndex === i ? current.setIndex : undefined}
    onset={(si: number, patch: Partial<SetLog>) => commit(updateSetAndFollowers(session!, i, si, patch))}
    ontoggle={(si: number) => toggleSet(i, si)}
    onkind={(si: number, kind: SetKind) => commit(updateSet(session!, i, si, { kind }))}
    onaddset={() => commit(addSet(session!, i))}
    onremoveset={() => commit(removeSet(session!, i, e.sets.length - 1))}
    onremove={() => confirm(`Togliere «${e.nameSnapshot}» dall'allenamento?`) && commit(removeEntry(session!, i))}
  />
{/snippet}

<style>
  header {
    position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem;
    margin: -1rem -1rem .75rem; padding: .5rem 1rem; padding-top: max(.5rem, env(safe-area-inset-top));
    background: var(--bg); border-bottom: 1px solid var(--line);
  }
  .titles { flex: 1; min-width: 0; }
  .savefail { flex-basis: 100%; margin: 0; display: flex; align-items: center; gap: .6rem; padding: .5rem .7rem; background: var(--danger); color: var(--on-danger); font-size: .85rem; font-weight: 700; }
  .savefail span { flex: 1; }
  .savefail button { min-height: 40px; padding: 0 .9rem; border: 1.5px solid var(--on-danger); border-radius: var(--pill); background: transparent; color: var(--on-danger); font-weight: 700; }
  header h1 { margin: 0; font-size: 1.45rem; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  h1 { margin: 0 0 .75rem; }
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 0; padding: .45rem 0; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); margin: .2rem 0 0; font-family: var(--mono); font-size: .68rem; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .clock { font-size: 1.45rem; font-weight: 700; letter-spacing: -.04em; }
  .screen { color: var(--accent); }
  .finish { min-height: 44px; padding: 0 1rem; border: 0; border-radius: var(--pill); background: var(--accent); color: var(--on-accent); font-weight: 700; }
  .more { min-width: 40px; border: 0; background: transparent; color: var(--text); font-size: 1.5rem; font-weight: 700; padding: 0; }
  .warn { margin: 0 0 .75rem; padding: .5rem .7rem; border-left: 4px solid var(--warn); background: var(--surface); font-size: .85rem; color: var(--text); }
  .list { display: grid; grid-template-columns: minmax(0, 1fr); gap: .75rem; }
  .group { border-left: 4px solid var(--accent); padding: .1rem 0 .1rem .5rem; display: grid; grid-template-columns: minmax(0, 1fr); gap: .5rem; min-width: 0; }
  .glabel { margin: 0; font-family: var(--mono); font-size: .7rem; text-transform: uppercase; letter-spacing: .03em; color: var(--text); }
  .add { width: 100%; margin-top: 1rem; min-height: 48px; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 700; }
  textarea { width: 100%; margin: 1rem 0; padding: .6rem .8rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 0; resize: vertical; }
  .primary { display: block; width: 100%; min-height: 52px; border: 0; border-radius: var(--pill); background: var(--accent); color: var(--on-accent); font-weight: 700; font-size: 1rem; text-align: center; line-height: 52px; text-decoration: none; margin-top: .5rem; }
  /* Riepilogo finale: numeri grandi su righe separate da linee sottili. */
  .stats { list-style: none; padding: 0; margin: 1rem 0; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .stats li { display: flex; flex-direction: column; padding: .75rem .5rem .75rem 0; }
  .stats li + li { border-left: 1px solid var(--line); padding-left: .6rem; }
  .stats strong { font-size: 2.2rem; line-height: 1; letter-spacing: -.05em; }
  .stats span { font-family: var(--mono); font-size: .66rem; text-transform: uppercase; color: var(--muted); margin-top: .3rem; }
  .recs { list-style: none; padding: 0; margin: 0 0 1rem; display: grid; }
  .recs li { padding: .6rem 0; border-bottom: 1px solid var(--line); font-size: .9rem; }
</style>
