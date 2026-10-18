<script lang="ts">
  import { fmtNumber } from '../domain/format'

  let { items, unit = '', compare }: { items: { label: string; value: number }[]; unit?: string; compare?: Map<string, number> } = $props()
  const max = $derived(Math.max(...items.map((i) => i.value), ...(compare ? [...compare.values()] : []), 1))
</script>

<ul>
  {#each items as it (it.label)}
    {@const prev = compare?.get(it.label)}
    <li>
      <span class="name">{it.label}</span>
      <span class="track" role="img" aria-label={`${it.label}: ${fmtNumber(it.value)} ${unit}`}>
        <i class="bar" style={`width:${(it.value / max) * 100}%`}></i>
        {#if prev}<i class="prev" style={`left:${(prev / max) * 100}%`} title={`Periodo precedente: ${fmtNumber(prev)}`}></i>{/if}
      </span>
      <span class="val">{fmtNumber(it.value)}</span>
    </li>
  {/each}
</ul>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
  li { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr) 2.5rem; gap: .5rem; align-items: center; font-size: .9rem; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track { position: relative; height: 14px; background: var(--border); border-radius: 0; overflow: visible; }
  .bar { position: absolute; inset: 0 auto 0 0; background: var(--accent); border-radius: 0; min-width: 4px; }
  .prev { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text); opacity: .6; border-radius: 0; }
  .val { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
</style>
