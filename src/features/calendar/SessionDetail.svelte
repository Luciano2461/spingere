<script lang="ts">
  import { ask } from '../../ui/confirm.svelte'
  import { db } from '../../db/db'
  import { discardSession, saveSession } from '../../db/sessions'
  import { fmtDuration, fmtNumber, fmtSet } from '../../domain/format'
  import {
    addDoneSet, dayKey, fromLocalInput, historyBefore, removeDoneSet, sessionDuration, toLocalInput, validateTimes,
  } from '../../domain/history'
  import { RECORD_LABELS, type RecordKind } from '../../domain/records'
  import { KIND_LABELS, sessionRecords, sessionVolume, updateSet } from '../../domain/session'
  import type { Session } from '../../domain/types'
  import { weightStep } from '../../state/settings.svelte'
  import { go } from '../../ui/router.svelte'
  import EntryCard from '../session/EntryCard.svelte'
  import { useDoneSessions } from './useDoneSessions.svelte'

  let { sessionId }: { sessionId: string } = $props()

  const done = useDoneSessions()
  const session = $derived(done.list.find((s) => s.id === sessionId) ?? null)

  // Bozza in modifica: salvata solo con «Salva». $state.raw perché va a Dexie (niente proxy) e si aggiorna sempre con copie nuove.
  let draft = $state.raw<Session | null>(null)
  let startText = $state('')
  let endText = $state('')
  let error = $state('')
  let saving = $state(false)

  const shown = $derived(draft ?? session)
  const recordsByEntry = $derived.by(() => {
    const out = new Map<number, Map<number, RecordKind[]>>()
    if (!shown) return out
    for (const r of sessionRecords(shown, historyBefore(done.list, shown))) {
      const m = out.get(r.entryIndex) ?? new Map<number, RecordKind[]>()
      m.set(r.setIndex, r.kinds)
      out.set(r.entryIndex, m)
    }
    return out
  })
  const BADGE = { normal: '', warmup: 'R', drop: 'D', failure: 'C' } as const

  const backHref = $derived(session ? `#/calendario/giorno/${dayKey(session.startedAt)}` : '#/calendario')

  function startEdit() {
    if (!session) return
    draft = structuredClone($state.snapshot(session))
    startText = toLocalInput(session.startedAt)
    endText = toLocalInput(session.endedAt ?? session.startedAt)
    error = ''
  }

  function cancelEdit() {
    draft = null
    error = ''
  }

  async function save() {
    if (!draft) return
    const startedAt = fromLocalInput(startText)
    const endedAt = fromLocalInput(endText)
    const problem = validateTimes(startedAt, endedAt)
    if (problem) {
      error = problem
      return
    }
    saving = true
    try {
      await saveSession(db, { ...$state.snapshot(draft), startedAt: startedAt!, endedAt: endedAt!, updatedAt: new Date().toISOString() })
      draft = null
      error = ''
    } catch {
      error = 'Salvataggio non riuscito. Riprova.'
    } finally {
      saving = false
    }
  }

  async function remove() {
    if (!session || !(await ask('Eliminare questo allenamento? Sparirà dallo storico, dai record e dalle statistiche. L\'operazione non si può annullare.', { confirmLabel: 'Elimina allenamento' }))) return
    const back = backHref
    await discardSession(db, session.id)
    go(back)
  }

  const setDraft = (next: Session) => (draft = next)
  const when = (iso: string) => new Date(iso).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<section>
  <a class="back" href={backHref}>‹ {session ? 'Giorno' : 'Calendario'}</a>

  {#if done.loaded && !session}
    <p>Allenamento non trovato.</p>
  {:else if shown}
    <h1>{shown.dayName ?? 'Allenamento libero'}</h1>
    <p class="muted">{shown.planName ? `${shown.planName} · ` : ''}{when(shown.startedAt)}</p>

    {#if draft}
      <div class="times">
        <label>Inizio<input type="datetime-local" bind:value={startText} /></label>
        <label>Fine<input type="datetime-local" bind:value={endText} /></label>
      </div>
      {#if error}<p class="err" role="alert">{error}</p>{/if}

      <div class="entries">
        {#each draft.entries as entry, i (i)}
          <EntryCard
            {entry}
            records={recordsByEntry.get(i) ?? new Map()}
            weightStep={weightStep()}
            onset={(si, patch) => setDraft(updateSet(draft!, i, si, patch))}
            onkind={(si, kind) => setDraft(updateSet(draft!, i, si, { kind }))}
            onaddset={() => setDraft(addDoneSet(draft!, i))}
            onremoveset={async () => {
              const n = draft!.entries[i].sets.length
              if (n > 0 && (n > 1 || (await ask(`Era l'unica serie di «${entry.nameSnapshot}»: l'esercizio verrà tolto dall'allenamento. Continuare?`, { confirmLabel: 'Togli esercizio' })))) setDraft(removeDoneSet(draft!, i, n - 1))
            }}
          />
        {/each}
      </div>

      <label class="notes">Note<textarea rows="3" value={draft.notes} oninput={(e) => setDraft({ ...draft!, notes: e.currentTarget.value })}></textarea></label>

      <div class="bar">
        <button class="ghost" onclick={cancelEdit} disabled={saving}>Annulla</button>
        <button class="primary" onclick={save} disabled={saving}>Salva</button>
      </div>
    {:else}
      {@const duration = sessionDuration(shown)}
      <p class="summary">
        {duration !== null ? `${fmtDuration(duration)} · ` : ''}{shown.entries.length === 1 ? '1 esercizio' : `${shown.entries.length} esercizi`}{sessionVolume(shown) > 0 ? ` · ${fmtNumber(sessionVolume(shown))} kg di volume` : ''}
      </p>

      {#each shown.entries as entry, i (i)}
        {@const recs = recordsByEntry.get(i)}
        <article>
          <a class="name" href={`#/calendario/esercizio/${encodeURIComponent(entry.exerciseId)}`}>{entry.nameSnapshot} ›</a>
          <ol>
            {#each entry.sets as s, si}
              <li>
                <span class="badge k-{s.kind}" title={KIND_LABELS[s.kind]}>{BADGE[s.kind] || si + 1}</span>
                <span>{fmtSet(entry.type, s)}</span>
                {#if recs?.get(si)}<span class="rec">🏆 {recs.get(si)!.map((r) => RECORD_LABELS[r]).join(' · ')}</span>{/if}
              </li>
            {/each}
          </ol>
        </article>
      {/each}

      {#if shown.entries.length === 0}<p class="muted">Nessun esercizio registrato.</p>{/if}
      {#if shown.notes}<p class="notes-view"><strong>Note</strong><br />{shown.notes}</p>{/if}

      <div class="bar">
        <button class="ghost del" onclick={remove}>Elimina</button>
        <button class="primary" onclick={startEdit}>Modifica</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .back { display: inline-block; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
  h1 { margin-bottom: .25rem; }
  .muted { color: var(--muted); font-size: .9rem; margin: 0 0 .5rem; }
  .muted::first-letter { text-transform: uppercase; }
  .summary { margin: 0 0 1rem; color: var(--muted); }
  article { background: var(--surface); border: 0; border-radius: 0; padding: .6rem .8rem; margin-bottom: .5rem; }
  .name { font-weight: 700; color: var(--text); text-decoration: none; display: block; min-height: 32px; }
  ol { list-style: none; margin: .25rem 0 0; padding: 0; display: grid; gap: .3rem; }
  li { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .badge { min-width: 28px; text-align: center; border: 1px solid var(--border); border-radius: 0; font-size: .8rem; font-weight: 700; color: var(--muted); padding: 2px 0; }
  .k-warmup { color: var(--warn); border-color: var(--warn); }
  .k-drop { color: var(--text); border-color: var(--text); }
  .k-failure { color: var(--danger); border-color: var(--danger); }
  .rec { font-size: .8rem; color: var(--text); font-weight: 700; font-weight: 600; }
  .notes-view { white-space: pre-wrap; }
  .times { display: grid; grid-template-columns: 1fr; gap: .5rem; margin-bottom: .75rem; }
  label { display: grid; gap: .25rem; font-size: .85rem; color: var(--muted); }
  input, textarea { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: .6rem .8rem; min-height: 48px; width: 100%; }
  .entries { display: grid; gap: .5rem; margin-bottom: .75rem; }
  .err { color: var(--danger); margin: 0 0 .5rem; }
  .bar { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-top: 1rem; }
  .bar button { min-height: 48px; border-radius: var(--pill); font-weight: 600; }
  .ghost { border: 1.5px solid var(--text); background: transparent; color: var(--text); }
  .del { color: var(--danger); }
  .primary { border: 0; background: var(--accent); color: var(--on-accent); }
  .bar button:disabled { opacity: .5; }
</style>
