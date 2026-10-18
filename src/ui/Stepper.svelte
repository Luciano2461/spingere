<script lang="ts">
  let {
    label, value, step = 1, min = 0, max = 9999, unit = '', decimal = false, compact = false, onchange,
  }: {
    label: string
    value: number | undefined
    step?: number
    min?: number
    max?: number
    unit?: string
    decimal?: boolean
    compact?: boolean
    onchange: (v: number) => void
  } = $props()

  const fmt = (v: number | undefined) => (v === undefined ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','))
  let text = $state('')
  $effect(() => {
    text = fmt(value)
  })

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 1000) / 1000))
  function commit() {
    const parsed = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(parsed)) onchange(clamp(parsed))
    else text = fmt(value)
  }

  // Un tocco su − / + cambia il valore di un passo al «click»: se il dito scorre la pagina il click non arriva e nulla cambia.
  // Tenendo premuto, dopo una breve attesa il valore scorre; il click che segue la pressione lunga viene ignorato.
  const HOLD_DELAY_MS = 450
  const REPEAT_MS = 110
  const MOVE_TOLERANCE_PX = 10
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let repeatTimer: ReturnType<typeof setInterval> | undefined
  let repeated = false // la pressione lunga ha già cambiato il valore: il click successivo non conta
  let downAt: { x: number; y: number } | null = null

  // Valore di partenza: quello scritto nel campo (anche se non ancora confermato), altrimenti la prop.
  function base(): number | undefined {
    const parsed = parseFloat(text.replace(',', '.'))
    return Number.isFinite(parsed) ? clamp(parsed) : value
  }

  function bumpOnce(dir: 1 | -1, from: number | undefined): number {
    const next = clamp((from ?? 0) + dir * step)
    text = fmt(next) // subito, senza aspettare la prop: due tocchi rapidi fanno due passi
    onchange(next)
    return next
  }

  function stopHold() {
    clearTimeout(holdTimer)
    clearInterval(repeatTimer)
    downAt = null
  }

  function startHold(dir: 1 | -1, e: PointerEvent) {
    e.preventDefault() // il campo non perde il focus e la tastiera non si chiude
    stopHold()
    repeated = false
    downAt = { x: e.clientX, y: e.clientY }
    holdTimer = setTimeout(() => {
      repeated = true
      let last = bumpOnce(dir, base())
      repeatTimer = setInterval(() => (last = bumpOnce(dir, last)), REPEAT_MS)
    }, HOLD_DELAY_MS)
  }

  // Il dito si sposta (scorrimento): niente pressione lunga.
  function onMove(e: PointerEvent) {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > MOVE_TOLERANCE_PX) stopHold()
  }

  // Tocco, mouse, tastiera e VoiceOver arrivano tutti qui.
  function onClick(dir: 1 | -1) {
    stopHold()
    if (repeated) repeated = false
    else bumpOnce(dir, base())
  }

  $effect(() => stopHold)

  function selectAll(e: FocusEvent) {
    const input = e.currentTarget as HTMLInputElement
    // su iOS la selezione va fatta dopo il focus
    setTimeout(() => input.setSelectionRange(0, input.value.length), 0)
  }
</script>

<div class="stepper" class:compact>
  {#if !compact}<span class="label">{label}</span>{/if}
  <div class="ctl">
    <button type="button" class="step" onpointerdown={(e) => startHold(-1, e)} onpointermove={onMove} onpointerup={stopHold} onpointercancel={stopHold} onpointerleave={stopHold} onclick={() => onClick(-1)} oncontextmenu={(e) => e.preventDefault()} aria-label={`Diminuisci ${label}`}>−</button>
    <input
      bind:value={text}
      onfocus={selectAll}
      onblur={commit}
      onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      inputmode={decimal ? 'decimal' : 'numeric'}
      aria-label={label}
    />
    <button type="button" class="step" onpointerdown={(e) => startHold(1, e)} onpointermove={onMove} onpointerup={stopHold} onpointercancel={stopHold} onpointerleave={stopHold} onclick={() => onClick(1)} oncontextmenu={(e) => e.preventDefault()} aria-label={`Aumenta ${label}`}>+</button>
  </div>
  {#if unit && !compact}<span class="unit">{unit}</span>{/if}
</div>

<style>
  .stepper { display: grid; gap: 2px; min-width: 0; }
  .label { font-family: var(--mono); font-size: .66rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  .ctl { display: flex; align-items: stretch; border: 1px solid var(--line); overflow: hidden; background: var(--bg); }
  button { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; min-width: 40px; min-height: 44px; border: 0; background: transparent; font-size: 1.2rem; font-weight: 700; color: var(--text); }
  input { width: 100%; min-width: 0; text-align: center; border: 0; background: transparent; color: var(--text); font: inherit; font-weight: 600; }
  .compact button { min-width: 32px; font-size: 1.05rem; }
  .compact input { font-size: 16px; }
  @media (max-width: 359px) { .compact button { min-width: 26px; } } /* sotto i 16 px iOS ingrandisce la pagina al tocco */
  .unit { font-size: .7rem; color: var(--muted); text-align: center; }
</style>
