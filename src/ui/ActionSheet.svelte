<script lang="ts">
  export interface SheetAction {
    label: string
    hint?: string
    danger?: boolean
    selected?: boolean
    disabled?: boolean
    onclick: () => void
  }

  let { title, actions, onclose }: { title?: string; actions: SheetAction[]; onclose: () => void } = $props()

  function pick(a: SheetAction) {
    a.onclick() // prima dell'azione: chiudere il foglio può azzerare lo stato da cui dipende
    onclose()
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title ?? 'Azioni'}>
    {#if title}<p class="title">{title}</p>{/if}
    {#each actions as a}
      <button class="act" class:danger={a.danger} class:selected={a.selected} disabled={a.disabled} onclick={() => pick(a)}>
        <span class="label">{a.label}{#if a.selected} <span aria-hidden="true">✓</span>{/if}</span>
        {#if a.hint}<span class="hint">{a.hint}</span>{/if}
      </button>
    {/each}
    <button class="act cancel" onclick={onclose}>Chiudi</button>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; }
  .sheet {
    width: 100%; max-height: 88%; overflow-y: auto; background: var(--bg); border-top: 2px solid var(--text); display: grid; gap: 4px;
    border-radius: 0; padding: .9rem; padding-bottom: calc(.9rem + env(safe-area-inset-bottom));
  }
  .title { margin: 0 0 .3rem; font-family: var(--mono); font-size: .7rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  .act {
    display: grid; gap: .1rem; text-align: left; min-height: 52px; padding: .5rem .9rem;
    background: var(--surface); border: 0; border-radius: 0; color: var(--text);
  }
  .act.selected { box-shadow: inset 4px 0 0 var(--accent); }
  .act.danger .label { color: var(--danger); }
  .act:disabled { opacity: .4; }
  .label { font-weight: 700; font-size: 1.05rem; letter-spacing: -.02em; }
  .hint { font-size: .8rem; color: var(--muted); }
  .cancel { margin-top: .4rem; text-align: center; background: transparent; border: 1.5px solid var(--text); border-radius: var(--pill); color: var(--text); font-weight: 700; }
</style>
