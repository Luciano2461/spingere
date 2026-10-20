<script lang="ts">
  import ActionSheet from './ActionSheet.svelte'
  import { answer, confirmState } from './confirm.svelte'

  // la tastiera aperta sposterebbe il foglio mentre si tocca: si chiude prima di mostrarlo
  $effect(() => {
    if (confirmState.current && document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
</script>

{#if confirmState.current}
  {@const req = confirmState.current}
  <ActionSheet
    message={req.message}
    actions={[{ label: req.confirmLabel, danger: req.danger, onclick: () => answer(true) }]}
    onclose={() => answer(false)}
  />
{/if}
