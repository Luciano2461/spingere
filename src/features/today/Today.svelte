<script lang="ts">
  import { ask } from '../../ui/confirm.svelte'
  import { onMount } from 'svelte'
  import { liveQuery } from 'dexie'
  import { db } from '../../db/db'
  import { unlockAudio } from '../../services/audio'
  import { active as activeStore, clearActive, setActive } from '../../state/activeSession.svelte'
  import { discardSession, doneSessions, startSession } from '../../db/sessions'
  import { fmtDateShort, fmtDuration } from '../../domain/format'
  import { isForgotten, lastDoneOf, suggestNextDay } from '../../domain/plan'
  import { newFreeSession, newSessionFromDay } from '../../domain/session'
  import { buildSamplePlan } from '../../domain/samplePlan'
  import { appSettings } from '../../state/settings.svelte'
  import type { ExerciseType, Plan, PlanDay, Session } from '../../domain/types'
  import { go } from '../../ui/router.svelte'

  const active = $derived(activeStore.session)
  let plans = $state<Plan[]>([])
  let done = $state<Session[]>([])
  let loaded = $state(false)
  let error = $state('')

  onMount(() => {
    const sub = liveQuery(async () => ({
      plans: await db.plans.orderBy('updatedAt').reverse().toArray(),
      done: await doneSessions(db),
    })).subscribe((v) => {
      plans = v.plans
      done = v.done
      loaded = true
    })
    return () => sub.unsubscribe()
  })

  const lastDone = (plan: Plan, day: PlanDay) => lastDoneOf(plan, day, done)
  const forgotten = $derived(active ? isForgotten(active.startedAt) : false)

  async function discardForgotten() {
    if (!active || !(await ask('Eliminare questo allenamento? Quello che hai registrato andrà perso.', { confirmLabel: 'Elimina allenamento' }))) return
    await discardSession(db, active.id)
    clearActive()
  }

  async function startDay(plan: Plan, day: PlanDay) {
    unlockAudio() // prima di ogni await: su iOS l'audio si sblocca solo dentro il tocco su «Inizia»
    error = ''
    try {
      const types = new Map<string, ExerciseType>((await db.exercises.toArray()).map((e) => [e.id, e.type]))
      const session = newSessionFromDay($state.snapshot(plan), $state.snapshot(day), done, types)
      await startSession(db, session)
      setActive(session)
      go('#/oggi/sessione')
    } catch (e) {
      error = e instanceof Error ? e.message : 'Impossibile avviare l\'allenamento'
    }
  }

  async function startFree() {
    unlockAudio()
    error = ''
    try {
      const session = newFreeSession()
      await startSession(db, session)
      setActive(session)
      go('#/oggi/sessione')
    } catch (e) {
      error = e instanceof Error ? e.message : 'Impossibile avviare l\'allenamento'
    }
  }

  async function addSamplePlan() {
    error = ''
    try {
      const plan = buildSamplePlan(await db.exercises.toArray(), appSettings.defaultRestSeconds)
      if (!plan) throw new Error('Non riesco a creare la scheda di esempio')
      await db.plans.add(plan)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Non riesco a creare la scheda di esempio'
    }
  }

  const noPlans = $derived(plans.every((p) => p.days.length === 0))
  const recent = $derived([...done].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5))
  const sessionSets = (s: Session) => s.entries.reduce((n, e) => n + e.sets.length, 0)
  const pad2 = (n: number) => String(n + 1).padStart(2, '0')
  const todayLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' })

  // Durata dell'allenamento in corso, ridisegnata ogni secondo (il valore vero viene sempre dall'orario di inizio).
  let now = $state(Date.now())
  $effect(() => {
    if (!active) return
    const t = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(t)
  })
  const daysAgo = (iso: string) => Math.max(0, Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400_000)) // round: con l'ora legale un giorno dura 23 o 25 ore
</script>

<section>
  <h1>Oggi<span class="sub">{todayLabel}</span></h1>

  {#if active}
    {@const start = new Date(active.startedAt)}
    <a class="resume" href="#/oggi/sessione" onclick={unlockAudio}>
      <span class="eyebrow">In corso · tocca per riprendere</span>
      <strong class="rname">{active.dayName ?? 'Allenamento libero'}</strong>
      <span class="bignum">{forgotten ? fmtDateShort(active.startedAt) : fmtDuration((now - start.getTime()) / 1000)}</span>
      <span class="eyebrow">Iniziato {forgotten ? `il ${fmtDateShort(active.startedAt)} ` : ''}alle {start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
    </a>
    {#if forgotten}
      <div class="forgotten">
        <p>Questo allenamento è iniziato da molto tempo: se l'avevi dimenticato, concludilo o eliminalo, altrimenti durata e statistiche escono falsate.</p>
        <button onclick={discardForgotten}>Elimina questo allenamento</button>
      </div>
    {/if}
  {:else if loaded}
    {#if noPlans}
      <div class="welcome">
        <h2>Benvenuto in Spingere</h2>
        <p>Una <strong>scheda</strong> è il tuo programma; ogni <strong>giorno</strong> della scheda è una seduta (es. Push, Pull, Gambe). Puoi anche allenarti senza scheda.</p>
        <button class="big primary" onclick={addSamplePlan}>Prova con una scheda di esempio</button>
        <p class="note">Si può modificare o eliminare quando vuoi.</p>
        <p class="links"><button class="link" onclick={startFree}>Allenati senza scheda</button> · <a href="#/schede">Crea la tua scheda</a></p>
      </div>
    {/if}

    {#each plans as p (p.id)}
      {#if p.days.length}
        {@const next = suggestNextDay(p, done)}
        <h2>{p.name}</h2>
        <ul class="blocks">
          {#each p.days as d, di (d.id)}
            {@const last = lastDone(p, d)}
            {@const ago = last ? daysAgo(last.startedAt) : null}
            <li class="day" style={`--b: var(--block-${(di % 4) + 1})`}>
              <div class="info">
                <span class="eyebrow">{pad2(di)}{#if d.id === next}{" · Prossimo"}{/if}</span>
                <strong>{d.name}</strong>
                <span class="eyebrow">{d.exercises.length} esercizi</span>
              </div>
              <div class="ago" aria-label={ago === null ? 'Mai fatto' : `Ultima volta ${ago === 0 ? 'oggi' : `${ago} giorni fa`}`}>
                <span class="bignum">{ago === null ? '—' : ago}</span>
                <span class="eyebrow">{ago === null ? 'mai fatto' : ago === 0 ? 'oggi' : ago === 1 ? 'giorno fa' : 'giorni fa'}</span>
              </div>
              <button disabled={d.exercises.length === 0} onclick={() => startDay(p, d)}>Inizia</button>
            </li>
          {/each}
        </ul>
      {/if}
    {/each}

    {#if !noPlans}<button class="free" onclick={startFree}>Allenamento libero</button>{/if}
  {/if}

  {#if error}<p class="err">{error}</p>{/if}

  {#if recent.length}
    <h2>Ultimi allenamenti</h2>
    <ul>
      {#each recent as s (s.id)}
        <li class="past">
          <a class="info" href={`#/calendario/sessione/${s.id}`}>
            <strong>{s.dayName ?? 'Allenamento libero'}</strong>
            <span class="eyebrow">{fmtDateShort(s.startedAt)}{s.endedAt ? ` · ${fmtDuration((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)}` : ''}</span>
          </a>
          <span class="count"><b>{sessionSets(s)}</b> serie</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.6rem 0 0; padding: .45rem 0; border-top: 1px solid var(--line); }
  ul { list-style: none; padding: 0; margin: 0; display: grid; }
  li { display: flex; align-items: center; gap: .75rem; padding: .75rem 0; border-bottom: 1px solid var(--line); }
  .info { flex: 1; display: grid; gap: 2px; min-width: 0; color: inherit; text-decoration: none; }
  .info strong { font-size: 1.1rem; letter-spacing: -.02em; }
  li button { min-height: 44px; padding: 0 1.1rem; border: 0; border-radius: var(--pill); background: var(--ink); color: var(--on-ink); font-weight: 700; }
  li button:disabled { opacity: .4; }
  /* Giorni della scheda: blocchi pieni impilati, nome a sinistra, giorni dall'ultima volta grandi a destra. */
  .blocks li.day { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; gap: .6rem .75rem; align-items: end; padding: .9rem 1rem 1rem; background: var(--b); color: var(--on-block); border: 0; }
  .blocks li.day .eyebrow { color: color-mix(in srgb, var(--on-block) 85%, transparent); }
  .blocks li.day .info strong { font-size: 1.55rem; line-height: 1; letter-spacing: -.04em; margin: .35rem 0 .15rem; }
  .ago { display: grid; justify-items: end; text-align: right; }
  .blocks li.day button { grid-column: 1 / -1; justify-self: start; background: #0e0e0e; color: #f7f5f1; }
  .resume { display: grid; gap: .3rem; padding: 1rem; background: var(--accent); color: var(--on-accent); text-decoration: none; }
  .resume .eyebrow { color: color-mix(in srgb, var(--on-accent) 85%, transparent); }
  .resume .rname { font-size: 1.55rem; line-height: 1; letter-spacing: -.04em; }
  .resume .bignum { font-size: 4.2rem; margin-top: .4rem; }
  .count { font-size: .8rem; color: var(--muted); white-space: nowrap; }
  .count b { font-size: 1.6rem; color: var(--text); letter-spacing: -.04em; }
  .free { width: 100%; margin-top: 1.25rem; min-height: 52px; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 700; font-size: 1rem; }
  .welcome { display: grid; gap: .7rem; padding: 1rem; background: var(--surface); }
  .welcome h2 { margin: 0; padding: 0; border: 0; font-family: var(--font); text-transform: none; letter-spacing: -.03em; color: var(--text); font-size: 1.5rem; font-weight: 700; line-height: 1.05; }
  .welcome p { margin: 0; }
  .welcome .note { color: var(--muted); font-size: .8rem; }
  .big { display: block; width: 100%; min-height: 52px; line-height: 52px; padding: 0 1rem; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 700; font-size: 1rem; text-align: center; text-decoration: none; }
  .welcome .big.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .forgotten { margin-top: .5rem; padding: .75rem 0; border-bottom: 1px solid var(--line); }
  .forgotten p { margin: 0 0 .4rem; font-size: .85rem; color: var(--muted); }
  .forgotten button { min-height: 44px; border: 0; background: transparent; color: var(--danger); font-weight: 700; padding: 0; }
  .links { text-align: center; color: var(--muted); font-size: .9rem; }
  .link { min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; text-decoration: underline; }
  .links a { color: var(--text); }
  .err { color: var(--danger); }
</style>
