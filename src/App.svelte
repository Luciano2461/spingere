<script lang="ts">
  import Banners from './ui/Banners.svelte'
  import ConfirmHost from './ui/ConfirmHost.svelte'
  import RestBar from './ui/RestBar.svelte'
  import { active } from './state/activeSession.svelte'
  import { disableWakeLock, enableWakeLock } from './services/wakeLock.svelte'
  import { keepAudioUnlocked } from './services/audio'
  import TabBar from './ui/TabBar.svelte'
  import Settings from './features/Settings.svelte'
  import Exercises from './features/Exercises.svelte'
  import Backup from './features/Backup.svelte'
  import Plans from './features/plans/Plans.svelte'
  import ImportPlan from './features/import/ImportPlan.svelte'
  import Today from './features/today/Today.svelte'
  import SessionView from './features/session/SessionView.svelte'
  import PlanDetail from './features/plans/PlanDetail.svelte'
  import DayEditor from './features/plans/DayEditor.svelte'
  import Calendar from './features/calendar/Calendar.svelte'
  import DayView from './features/calendar/DayView.svelte'
  import SessionDetail from './features/calendar/SessionDetail.svelte'
  import ExerciseHistory from './features/calendar/ExerciseHistory.svelte'
  import StatsHome from './features/stats/StatsHome.svelte'
  import ExerciseStats from './features/stats/ExerciseStats.svelte'
  import { route } from './ui/router.svelte'

  // Durante un allenamento: schermo acceso e audio sempre pronto (su tutte le schermate).
  $effect(() => {
    const running = !!active.session
    if (running) enableWakeLock()
    else disableWakeLock()
    keepAudioUnlocked(running)
  })
</script>

<Banners />
<main class:resting={!!active.session?.rest}>
  {#if route.tab === 'oggi'}
    {#if route.sub === 'sessione'}
      <SessionView />
    {:else}
      <Today />
    {/if}
  {:else if route.tab === 'schede'}
    {#if route.sub === 'importa'}
      <ImportPlan />
    {:else if route.sub && route.third}
      {#key route.sub + route.third}<DayEditor planId={route.sub} dayId={route.third} />{/key}
    {:else if route.sub}
      {#key route.sub}<PlanDetail planId={route.sub} />{/key}
    {:else}
      <Plans />
    {/if}
  {:else if route.tab === 'calendario'}
    {#if route.sub === 'giorno' && route.third}
      {#key route.third}<DayView day={route.third} />{/key}
    {:else if route.sub === 'sessione' && route.third}
      {#key route.third}<SessionDetail sessionId={route.third} />{/key}
    {:else if route.sub === 'esercizio' && route.third}
      {#key route.third}<ExerciseHistory exerciseId={decodeURIComponent(route.third)} />{/key}
    {:else}
      <Calendar />
    {/if}
  {:else if route.tab === 'statistiche'}
    {#if route.sub === 'esercizio' && route.third}
      {#key route.third}<ExerciseStats exerciseId={decodeURIComponent(route.third)} />{/key}
    {:else}
      <StatsHome />
    {/if}
  {:else if route.sub === 'esercizi'}
    <Exercises />
  {:else if route.sub === 'backup'}
    <Backup />
  {:else}
    <Settings />
  {/if}
</main>
<RestBar />
<TabBar />
<ConfirmHost />

<style>
  main.resting { padding-bottom: calc(var(--dock) + 6.5rem); }
  main {
    padding: 1rem;
    padding-top: max(1rem, env(safe-area-inset-top));
    padding-bottom: calc(var(--dock) + 1rem);
  }
</style>
