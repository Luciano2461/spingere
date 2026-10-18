<script lang="ts">
  import { active } from '../state/activeSession.svelte'
  import { TABS, route } from './router.svelte'

  // Icone proprie (tratto 1.8, 24×24): niente caratteri unicode, che cambiano aspetto tra versioni di iOS.
  const ICONS: Record<string, string[]> = {
    oggi: ['M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z'],
    schede: ['M9 4h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2V5a1 1 0 0 1 1-1z', 'M9 12h6M9 16h4'],
    calendario: ['M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M4 10h16M8 4v4M16 4v4'],
    statistiche: ['M5 20v-8M12 20V5M19 20v-11'],
    impostazioni: ['M4 7h9M17 7h3M4 17h3M11 17h9', 'M15 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M9 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
  }

  const inSession = $derived(route.tab === 'oggi' && route.sub === 'sessione')
</script>

<div class="dock">
  <nav class="pill" aria-label="Navigazione principale">
    {#each TABS as t (t.id)}
      <a href={`#/${t.id}`} class:active={route.tab === t.id} aria-current={route.tab === t.id ? 'page' : undefined} aria-label={t.label}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#each ICONS[t.id] as d}<path {d} />{/each}
        </svg>
        <span class="label">{t.label}</span>
      </a>
    {/each}
  </nav>
  {#if active.session && !inSession}
    <a class="resume" href="#/oggi/sessione" aria-label="Torna all'allenamento in corso">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
    </a>
  {/if}
</div>

<style>
  .dock {
    position: fixed; z-index: 10; left: 12px; right: 12px; display: flex; gap: 8px; align-items: center;
    bottom: calc(env(safe-area-inset-bottom) * .6 + 10px);
  }
  .pill {
    flex: 1; display: flex; justify-content: space-between; align-items: center; min-width: 0;
    padding: 6px 5px; border-radius: var(--pill); background: var(--ink);
  }
  .pill a {
    display: flex; align-items: center; justify-content: center; height: 44px; min-width: 36px; padding: 0 7px;
    border-radius: var(--pill); color: color-mix(in srgb, var(--on-ink) 70%, transparent); text-decoration: none; overflow: hidden;
    transition: background .28s ease, color .28s ease;
  }
  .label {
    max-width: 0; opacity: 0; margin-left: 0; overflow: hidden; white-space: nowrap; font-size: .85rem; font-weight: 700; letter-spacing: -.01em;
    transition: max-width .32s ease, opacity .2s ease, margin-left .32s ease;
  }
  .pill a.active { background: var(--accent); color: var(--on-accent); padding: 0 12px; }
  .pill a.active .label { max-width: 96px; opacity: 1; margin-left: 6px; }
  .resume {
    flex: 0 0 auto; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; color: var(--on-accent); text-decoration: none; background: var(--accent);
    animation: beat 2.4s ease-in-out infinite;
  }
  @keyframes beat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  @media (prefers-reduced-motion: reduce) { .resume { animation: none; } .label, .pill a { transition: none; } }
</style>
