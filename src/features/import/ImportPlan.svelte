<script lang="ts">
  import { liveQuery } from 'dexie'
  import { db } from '../../db/db'
  import { applyImport } from '../../db/importPlan'
  import synonyms from '../../data/synonyms.json'
  import { TYPE_LABELS } from '../../data/labels'
  import { fmtNumber } from '../../domain/format'
  import {
    buildImport, buildReview, guessType, tableToRows, templateCsv,
    type Choice, type ImportRow, type ReviewItem,
  } from '../../domain/importPlan'
  import type { Exercise, ExerciseType } from '../../domain/types'
  import { shareOrDownload } from '../../services/backupIO'
  import { parsePdfPages } from '../../domain/importPdf'
  import { ImportFileError, readTable } from '../../services/importFile'
  import { extractPdfPages } from '../../services/pdfText'
  import { appSettings, weightStep } from '../../state/settings.svelte'
  import { go } from '../../ui/router.svelte'
  import Stepper from '../../ui/Stepper.svelte'
  import ExercisePickerSheet from '../plans/ExercisePickerSheet.svelte'

  let exercises = $state<Exercise[]>([])
  let aliasRows = $state<{ id: string; exerciseId: string; text: string }[]>([])
  $effect(() => {
    const a = liveQuery(() => db.exercises.toArray()).subscribe((v) => (exercises = v))
    const b = liveQuery(() => db.aliases.toArray()).subscribe((v) => (aliasRows = v))
    return () => {
      a.unsubscribe()
      b.unsubscribe()
    }
  })

  let stage = $state<'pick' | 'review'>('pick')
  let busy = $state(false)
  let error = $state('')
  let fileName = $state('')
  let fromPdf = $state(false)
  let problems = $state<string[]>([])
  let items = $state.raw<ReviewItem[]>([])
  let planNames = $state<Record<string, string>>({})
  let pickingFor = $state<number | null>(null)
  let openEdit = $state<number | null>(null)

  const TYPES = Object.keys(TYPE_LABELS) as ExerciseType[]

  async function onFile(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    error = ''
    busy = true
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      let table: string[][]
      let notes: string[] = []
      if (isPdf) {
        const parsed = parsePdfPages(await extractPdfPages(file))
        if (!parsed.hasText) {
          error = 'Questo PDF non contiene testo (sembra una scansione o una foto). Per ora usa il template CSV o un PDF con testo selezionabile; la lettura di foto e scansioni arriverà più avanti.'
          return
        }
        table = parsed.table
        notes = parsed.unrecognized.slice(0, 8).map((u) => `Pagina ${u.page}: «${u.text.length > 70 ? u.text.slice(0, 70) + '…' : u.text}» non riconosciuta, ignorata.`)
        if (parsed.unrecognized.length > 8) notes.push(`…e altre ${parsed.unrecognized.length - 8} righe non riconosciute.`)
      } else table = await readTable(file)
      fromPdf = isPdf
      const { rows, problems: p } = tableToRows(table)
      problems = [...p, ...notes]
      if (rows.length === 0) {
        error = p[0] ?? 'Nessun esercizio trovato nel file.'
        if (isPdf) error += ' Se il PDF è una grafica o ha un formato insolito, usa il template CSV.'
        return
      }
      const aliases = new Map<string, string[]>()
      for (const a of aliasRows) aliases.set(a.exerciseId, [...(aliases.get(a.exerciseId) ?? []), a.text])
      items = buildReview(rows, exercises, { synonyms, aliases })
      planNames = Object.fromEntries([...new Set(rows.map((r) => r.planName))].map((n) => [n, n]))
      fileName = file.name
      openEdit = null
      stage = 'review'
    } catch (e) {
      error = e instanceof ImportFileError ? e.message : 'Non riesco a leggere il file.'
    } finally {
      busy = false
    }
  }

  async function downloadTemplate() {
    await shareOrDownload(templateCsv(), 'template-scheda-spingere.csv', 'text/csv', 'Template scheda Spingere')
  }

  // --- modifica delle righe (sempre con copie nuove) ---
  const setItem = (i: number, patch: Partial<ReviewItem>) => (items = items.map((it, k) => (k === i ? { ...it, ...patch } : it)))
  const setRow = (i: number, patch: Partial<ImportRow>) => setItem(i, { row: { ...items[i].row, ...patch } })

  const selectValue = (c: Choice) => (c.kind === 'exercise' ? `e:${c.exercise.id}` : c.kind)

  function onSelect(i: number, value: string, ev: Event) {
    const it = items[i]
    if (value === 'search') {
      pickingFor = i
      ;(ev.currentTarget as HTMLSelectElement).value = selectValue(it.choice)
    } else if (value === 'custom') {
      setItem(i, { choice: { kind: 'custom', name: it.row.name, type: guessType(it.row) }, manual: true })
    } else if (value === 'skip') {
      setItem(i, { choice: { kind: 'skip' }, manual: true })
    } else {
      const exercise = it.match.candidates.find((c) => `e:${c.id}` === value) ?? exercises.find((c) => `e:${c.id}` === value)
      if (exercise) setItem(i, { choice: { kind: 'exercise', exercise }, manual: exercise.id !== it.match.best?.id || it.match.status === 'weak' })
    }
  }

  const typeOf = (it: ReviewItem): ExerciseType => (it.choice.kind === 'exercise' ? it.choice.exercise.type : it.choice.kind === 'custom' ? it.choice.type : 'weight_reps')
  const usesWeight = (t: ExerciseType) => t === 'weight_reps' || t === 'weighted_bodyweight'
  const usesTime = (t: ExerciseType) => t === 'timed' || t === 'cardio'

  function summary(r: ImportRow, t: ExerciseType): string {
    const parts: string[] = []
    if (r.sets !== undefined) parts.push(`${fmtNumber(r.sets)} serie`)
    if (usesTime(t)) {
      if (r.seconds !== undefined) parts.push(`${fmtNumber(r.seconds)} s`)
    } else if (r.reps !== undefined) parts.push(`${fmtNumber(r.reps)} rip.`)
    if (usesWeight(t) && r.weight !== undefined) parts.push(`${fmtNumber(r.weight)} kg`)
    if (r.rest !== undefined) parts.push(`recupero ${fmtNumber(r.rest)} s`)
    return parts.join(' · ') || 'Valori predefiniti'
  }

  // --- struttura per la revisione: scheda → giorno → righe ---
  const structure = $derived.by(() => {
    const plans: { name: string; days: { name: string; idx: number[] }[] }[] = []
    items.forEach((it, i) => {
      let p = plans.find((x) => x.name === it.row.planName)
      if (!p) plans.push((p = { name: it.row.planName, days: [] }))
      let d = p.days.find((x) => x.name === it.row.dayName)
      if (!d) p.days.push((d = { name: it.row.dayName, idx: [] }))
      d.idx.push(i)
    })
    return plans
  })

  const built = $derived.by(() => {
    const renamed = items.map((it) => ({ ...it, row: { ...it.row, planName: planNames[it.row.planName]?.trim() || it.row.planName } }))
    return buildImport(renamed, appSettings.defaultRestSeconds, aliasRows)
  })
  const exerciseCount = $derived(built.plans.reduce((n, p) => n + p.days.reduce((k, d) => k + d.exercises.length, 0), 0))
  const dayCount = $derived(built.plans.reduce((n, p) => n + p.days.length, 0))
  const toCheck = $derived(items.filter((it) => it.choice.kind === 'exercise' && it.match.status === 'check' && !it.manual).length)

  let saving = $state(false)
  async function confirmImport() {
    if (exerciseCount === 0 || saving) return
    saving = true
    error = ''
    try {
      const b = $state.snapshot(built)
      await applyImport(db, b)
      go(b.plans.length === 1 ? `#/schede/${b.plans[0].id}` : '#/schede')
    } catch {
      error = 'Importazione non riuscita: non è stato salvato nulla. Riprova.'
      saving = false
    }
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
</script>

<section>
  <a class="back" href="#/schede">‹ Schede</a>
  <h1>Importa una scheda</h1>

  {#if stage === 'pick'}
    <p>Carica un file <strong>CSV</strong>, <strong>Excel (.xlsx)</strong> o un <strong>PDF con testo</strong> con la tua scheda. Prima di salvare potrai controllare e correggere ogni esercizio.</p>

    <button class="big primary" onclick={downloadTemplate}>Scarica il template (CSV)</button>
    <label class="big file" class:disabled={busy}>
      {busy ? 'Lettura in corso…' : 'Scegli il file'}
      <input type="file" accept=".csv,.xlsx,.pdf,.txt,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={onFile} disabled={busy} />
    </label>
    {#if error}<p class="err" role="alert">{error}</p>{/if}

    <h2>Come compilare il file</h2>
    <ul class="help">
      <li>Una riga per esercizio. Colonne: <code>scheda, giorno, esercizio, tipo, serie, ripetizioni, secondi, carico, recupero, superserie, note</code>. Solo «esercizio» è obbligatoria.</li>
      <li>Se «scheda» o «giorno» sono vuoti valgono quelli della riga sopra.</li>
      <li>Recupero: <code>90</code>, <code>90s</code>, <code>1:30</code> o <code>2 min</code>. Carico in kg (anche <code>12,5</code>). Ripetizioni come <code>8-10</code> valgono 10.</li>
      <li>Superserie: righe consecutive con la stessa lettera (A, B…) formano una superserie; scrivi «circuito 1» per un circuito.</li>
      <li>Il tipo (carico, corpo libero, zavorra, tempo, cardio) serve solo per gli esercizi che non sono nel database.</li>
      <li>PDF: funziona con schede scritte in righe tipo «Panca piana 4x8 60kg rec 90s» o in tabelle con le intestazioni (esercizio, serie, rip, carico, recupero). Il riconoscimento è approssimativo: controlla tutto nella schermata successiva. Per i PDF grafici o complessi il template CSV è più affidabile.</li>
      <li>I dati restano sul tuo dispositivo: il file non viene inviato da nessuna parte.</li>
    </ul>
  {:else}
    <p class="muted">File: {fileName} — {plural(items.length, 'esercizio', 'esercizi')}.</p>
    {#if fromPdf}<p class="pdfnote" role="note">Lettura da PDF: il riconoscimento può sbagliare. Controlla ogni esercizio, i valori e i giorni prima di importare.</p>{/if}
    {#if problems.length}
      <div class="warn" role="status">
        <strong>Attenzione</strong>
        {#each problems as p}<p>{p}</p>{/each}
      </div>
    {/if}
    {#if toCheck > 0}<p class="muted">{plural(toCheck, 'esercizio da controllare', 'esercizi da controllare')} (in giallo).</p>{/if}

    {#each structure as plan}
      <label class="planname">Scheda
        <input bind:value={planNames[plan.name]} aria-label="Nome della scheda" />
      </label>
      {#each plan.days as day}
        <h2>{day.name}</h2>
        <ul class="rows">
          {#each day.idx as i (i)}
            {@const it = items[i]}
            {@const t = typeOf(it)}
            <li class:skipped={it.choice.kind === 'skip'}>
              <div class="top">
                <strong>{it.row.name}</strong>
                {#if it.choice.kind === 'skip'}<span class="chip">Saltato</span>
                {:else if it.choice.kind === 'custom'}<span class="chip new">Nuovo</span>
                {:else if it.match.status === 'sure' || it.manual}<span class="chip ok">Abbinato</span>
                {:else}<span class="chip check">Da controllare</span>{/if}
              </div>
              <p class="muted">{summary(it.row, t)}</p>

              <select value={selectValue(it.choice)} onchange={(e) => onSelect(i, e.currentTarget.value, e)} aria-label={`Esercizio per «${it.row.name}»`}>
                {#each it.match.candidates as c (c.id)}<option value={`e:${c.id}`}>{c.name}</option>{/each}
                {#if it.choice.kind === 'exercise' && !it.match.candidates.some((c) => c.id === (it.choice as { exercise: Exercise }).exercise.id)}
                  <option value={`e:${it.choice.exercise.id}`}>{it.choice.exercise.name}</option>
                {/if}
                <option value="custom">Nuovo esercizio personalizzato «{it.row.name}»</option>
                <option value="skip">Salta questa riga</option>
                <option value="search">Cerca un altro esercizio…</option>
              </select>

              {#if it.choice.kind === 'custom'}
                <select value={it.choice.type} onchange={(e) => setItem(i, { choice: { kind: 'custom', name: (it.choice as { name: string }).name, type: e.currentTarget.value as ExerciseType } })} aria-label="Tipo di esercizio">
                  {#each TYPES as ty}<option value={ty}>{TYPE_LABELS[ty]}</option>{/each}
                </select>
              {/if}

              {#each it.row.warnings as w}<p class="warnline">⚠ {w}</p>{/each}

              {#if it.choice.kind !== 'skip'}
                <button class="link" onclick={() => (openEdit = openEdit === i ? null : i)} aria-expanded={openEdit === i}>
                  {openEdit === i ? 'Chiudi valori' : 'Modifica i valori'}
                </button>
                {#if openEdit === i}
                  <div class="edit">
                    <Stepper label="Serie" value={it.row.sets} min={1} max={30} onchange={(v) => setRow(i, { sets: v })} />
                    {#if usesTime(t)}
                      <Stepper label="Secondi" step={5} value={it.row.seconds} onchange={(v) => setRow(i, { seconds: v })} />
                    {:else}
                      <Stepper label="Ripetizioni" value={it.row.reps} max={200} onchange={(v) => setRow(i, { reps: v })} />
                    {/if}
                    {#if usesWeight(t)}
                      <Stepper label="Carico (kg)" decimal step={weightStep()} min={t === 'weighted_bodyweight' ? -200 : 0} value={it.row.weight} onchange={(v) => setRow(i, { weight: v })} />
                    {/if}
                    <Stepper label="Recupero (s)" step={15} value={it.row.rest} max={900} onchange={(v) => setRow(i, { rest: v })} />
                  </div>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {/each}
    {/each}

    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <p class="muted">
      Verrà creata {plural(built.plans.length, 'scheda', 'schede')} con {plural(dayCount, 'giorno', 'giorni')} e {plural(exerciseCount, 'esercizio', 'esercizi')}{built.customExercises.length ? `, più ${plural(built.customExercises.length, 'esercizio personalizzato', 'esercizi personalizzati')}` : ''}. Le schede esistenti non vengono toccate.
    </p>
    <div class="bar">
      <button class="ghost" onclick={() => (stage = 'pick')} disabled={saving}>Indietro</button>
      <button class="primary" onclick={confirmImport} disabled={exerciseCount === 0 || saving}>{saving ? 'Salvo…' : 'Importa'}</button>
    </div>
  {/if}
</section>

{#if pickingFor !== null}
  <ExercisePickerSheet
    single
    title="Scegli l'esercizio"
    onadd={(e) => pickingFor !== null && setItem(pickingFor, { choice: { kind: 'exercise', exercise: e }, manual: true })}
    onclose={() => (pickingFor = null)}
  />
{/if}

<style>
  .back { display: inline-block; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
  h2 { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 400; margin: 1.5rem 0 .6rem; padding: .45rem 0 0; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); font-size: .85rem; margin: .1rem 0 .4rem; }
  .big { display: block; width: 100%; min-height: 52px; line-height: 52px; margin-top: .6rem; padding: 0 1rem; border: 1.5px solid var(--text); border-radius: var(--pill); background: transparent; color: var(--text); font-weight: 600; font-size: 1rem; text-align: center; cursor: pointer; }
  .big.primary { background: var(--accent); color: var(--on-accent); }
  .file input { display: none; }
  .file.disabled { opacity: .5; }
  .err { color: var(--danger); }
  .help { padding-left: 1.1rem; display: grid; gap: .4rem; font-size: .9rem; }
  code { font-size: .8rem; background: var(--surface); padding: 1px 4px; border-radius: 0; word-break: break-word; }
  .warn { background: color-mix(in srgb, var(--warn) 15%, var(--bg)); border: 1px solid var(--warn); border-radius: var(--r); padding: .5rem .8rem; font-size: .85rem; }
  .warn p { margin: .2rem 0 0; }
  .pdfnote { margin: .25rem 0 .5rem; padding: .5rem .8rem; border: 1px solid var(--accent); border-radius: var(--r); font-size: .85rem; }
  .planname { display: grid; gap: .25rem; font-size: .85rem; color: var(--muted); margin-top: 1rem; }
  input { min-height: 48px; padding: 0 .9rem; font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); width: 100%; }
  .rows { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
  .rows li { display: grid; gap: .35rem; padding: .7rem .8rem; background: var(--surface); border: 0; border-radius: 0; min-width: 0; }
  .rows li.skipped { opacity: .55; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; }
  .chip { flex: none; font-size: .72rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .chip.ok { color: var(--ok); border-color: var(--ok); }
  .chip.check { color: var(--warn); border-color: var(--warn); font-weight: 700; }
  .chip.new { color: var(--text); border-color: var(--text); }
  select { width: 100%; min-height: 48px; padding: 0 .6rem; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-sm); }
  .warnline { margin: 0; font-size: .8rem; color: var(--warn); }
  .link { justify-self: start; border: 0; background: transparent; color: var(--text); font-weight: 700; padding: 0; font-size: .9rem; }
  .edit { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .bar { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-top: 1rem; }
  .bar button { min-height: 52px; border-radius: var(--pill); font-weight: 700; font-size: 1rem; }
  .ghost { border: 1.5px solid var(--text); background: transparent; color: var(--text); }
  .primary { border: 0; background: var(--accent); color: var(--on-accent); }
  .bar button:disabled { opacity: .5; }
</style>
