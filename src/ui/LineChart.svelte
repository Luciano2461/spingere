<script lang="ts">
  import { fmtNumber } from '../domain/format'

  let { points, unit = '', label }: { points: { t: number; v: number }[]; unit?: string; label: string } = $props()

  const W = 320, H = 180, L = 40, R = 12, T = 14, B = 26
  let selected = $state<number | null>(null)
  $effect(() => {
    points
    selected = null
  })

  const tMin = $derived(points[0]?.t ?? 0)
  const tMax = $derived(points[points.length - 1]?.t ?? 1)
  const vMax = $derived(Math.max(...points.map((p) => p.v), 1))
  const vMin = $derived(Math.min(...points.map((p) => p.v), vMax))
  // Asse Y: con un solo valore parte da 0; altrimenti è leggermente zoomato sull'intervallo dei dati, per vedere le variazioni.
  const lo = $derived(vMin === vMax ? 0 : Math.max(0, vMin - (vMax - vMin) * 0.2))
  const hi = $derived(vMax === lo ? lo + 1 : vMax + (vMax - lo) * 0.1)
  const x = (t: number) => (tMax === tMin ? (L + W - R) / 2 : L + ((t - tMin) / (tMax - tMin)) * (W - L - R))
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const path = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '))
  const ticks = $derived([lo, (lo + hi) / 2, hi])
  const fmtDate = (t: number) => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  const shown = $derived(selected !== null ? points[selected] : points[points.length - 1])
</script>

<div class="wrap">
  <p class="readout" aria-live="polite">
    <strong>{shown ? `${fmtNumber(shown.v)} ${unit}` : ''}</strong>
    <span>{shown ? fmtDate(shown.t) : ''}{selected === null && points.length > 1 ? ' · ultima sessione' : ''}</span>
  </p>
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
    {#each ticks as tv}
      <line x1={L} x2={W - R} y1={y(tv)} y2={y(tv)} class="grid" />
      <text x={L - 6} y={y(tv) + 4} class="axis" text-anchor="end">{fmtNumber(Math.round(tv * 10) / 10)}</text>
    {/each}
    {#if points.length > 1}<path d={path} class="line" />{/if}
    {#each points as p, i}
      <circle cx={x(p.t)} cy={y(p.v)} r={selected === i ? 5.5 : 3.5} class="dot" class:sel={selected === i} />
      <circle cx={x(p.t)} cy={y(p.v)} r="16" class="hit" role="button" tabindex="0" aria-label={`${fmtDate(p.t)}: ${fmtNumber(p.v)} ${unit}`}
        onclick={() => (selected = i)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selected = i)} />
    {/each}
    <text x={L} y={H - 6} class="axis">{fmtDate(tMin)}</text>
    {#if points.length > 1}<text x={W - R} y={H - 6} class="axis" text-anchor="end">{fmtDate(tMax)}</text>{/if}
  </svg>
</div>

<style>
  .wrap { background: var(--surface); border: 0; border-radius: 0; padding: .6rem .6rem .3rem; }
  .readout { margin: 0 0 .25rem .4rem; display: flex; gap: .5rem; align-items: baseline; }
  .readout strong { font-size: 1.3rem; }
  .readout span { color: var(--muted); font-size: .85rem; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .axis { fill: var(--muted); font-size: 10px; }
  .line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
  .dot { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
  .dot.sel { stroke: var(--text); }
  .hit { fill: transparent; cursor: pointer; outline: none; }
</style>
