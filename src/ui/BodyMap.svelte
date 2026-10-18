<script lang="ts">
  import { MUSCLE_LABELS } from '../data/labels'
  import { HEAT_OPACITY, heatLevel } from '../domain/bodymap'
  import { fmtNumber } from '../domain/format'
  import { BACK, BODY_BASE, FRONT, VIEW_HEIGHT, VIEW_WIDTH, type MuscleShape } from './bodyMapShapes'

  let { values, selected = null, onselect }: { values: Map<string, number>; selected?: string | null; onselect: (muscle: string) => void } = $props()

  const max = $derived(Math.max(0, ...values.values()))
  const mirror = `translate(${VIEW_WIDTH},0) scale(-1,1)`
  const views: { title: string; shapes: MuscleShape[] }[] = [
    { title: 'Fronte', shapes: FRONT },
    { title: 'Retro', shapes: BACK },
  ]
  const level = (m: string) => heatLevel(values.get(m) ?? 0, max)
  const label = (m: string) => `${MUSCLE_LABELS[m] ?? m}: ${fmtNumber(values.get(m) ?? 0)} serie`
</script>

<div class="map">
  {#each views as v}
    <figure>
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} role="group" aria-label={`Mappa muscolare, vista ${v.title.toLowerCase()}`}>
        <g class="base">
          <path d={BODY_BASE.outline} />
          <path d={BODY_BASE.outline} transform={mirror} />
          <circle cx={BODY_BASE.head.cx} cy={BODY_BASE.head.cy} r={BODY_BASE.head.r} />
        </g>
        {#each v.shapes as s (s.muscle)}
          {@const lv = level(s.muscle)}
          <g
            class="muscle"
            class:selected={selected === s.muscle}
            role="button"
            tabindex="0"
            aria-label={label(s.muscle)}
            aria-pressed={selected === s.muscle}
            onclick={() => onselect(s.muscle)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onselect(s.muscle))}
          >
            <path class="hit" d={s.d} />
            <path class="hit" d={s.d} transform={mirror} />
            <path class="fill zero" d={s.d} />
            <path class="fill zero" d={s.d} transform={mirror} />
            {#if lv > 0}
              <path class="fill heat" d={s.d} style={`opacity:${HEAT_OPACITY[lv]}`} />
              <path class="fill heat" d={s.d} transform={mirror} style={`opacity:${HEAT_OPACITY[lv]}`} />
            {/if}
          </g>
        {/each}
      </svg>
      <figcaption>{v.title}</figcaption>
    </figure>
  {/each}
</div>

<div class="legend" aria-hidden="true">
  <span>poco</span>
  {#each [1, 2, 3, 4] as l}<i style={`opacity:${HEAT_OPACITY[l as 1 | 2 | 3 | 4]}`}></i>{/each}
  <span>tanto</span>
</div>

<style>
  .map { display: grid; grid-template-columns: 1fr 1fr; gap: .25rem; }
  figure { margin: 0; text-align: center; }
  svg { width: 100%; height: auto; display: block; }
  figcaption { font-size: .8rem; color: var(--muted); }
  .base { fill: var(--surface); stroke: var(--border); stroke-width: 1; }
  .muscle { cursor: pointer; outline: none; }
  .hit { fill: transparent; stroke: transparent; stroke-width: 10; stroke-linejoin: round; }
  .fill { stroke: var(--bg); stroke-width: .8; stroke-linejoin: round; pointer-events: none; }
  .zero { fill: color-mix(in srgb, var(--muted) 30%, var(--bg)); opacity: .9; }
  .heat { fill: var(--accent); }
  .selected .fill { stroke: var(--text); stroke-width: 2; }
  .muscle:focus-visible .fill { stroke: var(--text); stroke-width: 2; }
  .legend { display: flex; align-items: center; justify-content: center; gap: .3rem; margin-top: .4rem; font-size: .75rem; color: var(--muted); }
  .legend i { width: 22px; height: 12px; border-radius: 0; background: var(--accent); display: inline-block; }
</style>
