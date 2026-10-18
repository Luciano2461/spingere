<script lang="ts">
  import ExerciseBrowser from './ExerciseBrowser.svelte'
</script>

<section>
  <a class="back" href="#/impostazioni">‹ Impostazioni</a>
  <h1>Esercizi</h1>
  <ExerciseBrowser />
</section>

<style>
  .back { display: inline-block; min-height: 44px; line-height: 44px; color: var(--text); font-weight: 700; text-decoration: none; }
  h1 { margin-top: 0; }
</style>
