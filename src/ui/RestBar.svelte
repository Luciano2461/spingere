<script module lang="ts">
  // Segnali già suonati: a livello di modulo, così cambiare schermata durante il recupero non li fa ripetere.
  const played = new Set<string>()
</script>

<script lang="ts">
  import { fmtDuration } from '../domain/format'
  import { adjustRest, isRestOver, remainingSeconds, upNext } from '../domain/rest'
  import { cueKey, dueCue, restCues } from '../domain/restCues'
  import { playCue } from '../services/audio'
  import { active, commitSession } from '../state/activeSession.svelte'
  import { restSoundPrefs } from '../state/settings.svelte'

  let now = $state(Date.now())
  const rest = $derived(active.session?.rest ?? null)
  const left = $derived(rest ? remainingSeconds(rest, now) : 0)
  const over = $derived(rest ? isRestOver(rest, now) : false)
  const progress = $derived(rest && !over ? Math.min(1, Math.max(0, 1 - left / rest.durationSeconds)) : 1)
  const next = $derived.by(() => {
    const s = active.session
    const n = s ? upNext(s) : null
    return s && n ? `${s.entries[n.entryIndex].nameSnapshot} · serie ${n.setIndex + 1}` : null
  })

  // L'orologio serve solo a ridisegnare: il tempo vero si ricalcola sempre dall'orario di fine.
  $effect(() => {
    if (!rest) return
    now = Date.now()
    const tick = setInterval(() => (now = Date.now()), 250)
    const onVisible = () => (now = Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  // Segnali sonori (preavviso, 3-2-1, fine): ognuno una volta sola, e solo se è appena scattato (non se si riapre l'app molto dopo).
  const prefs = $derived(restSoundPrefs())
  const cues = $derived(rest && prefs.enabled ? restCues(rest, prefs.countdown) : [])
  $effect(() => {
    const cue = dueCue(cues, now, played)
    if (!cue) return
    if (played.size > 200) played.clear()
    played.add(cueKey(cue))
    playCue(cue.kind, prefs)
  })

  const adjust = (delta: number) => active.session && rest && commitSession({ ...active.session, rest: adjustRest(rest, delta) })
  const dismiss = () => {
    if (!active.session) return
    const { rest: _r, ...without } = active.session
    commitSession(without)
  }
</script>

{#if rest}
  <div class="bar" class:over role="timer" aria-live="off">
    <div class="progress" style={`width:${progress * 100}%`}></div>
    <div class="body">
      <div class="time">
        {#if over}<strong>Recupero finito ✓</strong>{:else}<strong>{fmtDuration(left)}</strong><span>recupero</span>{/if}
        {#if next}<small>Prossimo: {next}</small>{/if}
      </div>
      <div class="btns">
        {#if !over}
          <button onclick={() => adjust(-15)} aria-label="Togli 15 secondi">−15</button>
          <button onclick={() => adjust(15)} aria-label="Aggiungi 15 secondi">+15</button>
        {/if}
        <button class="main" onclick={dismiss}>{over ? 'Ok' : 'Salta'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Blocco arancio pieno con il conto alla rovescia grande; a recupero finito si inverte (nero) e pulsa. */
  .bar {
    position: fixed; left: 12px; right: 12px; z-index: 12; bottom: var(--dock);
    background: var(--accent); color: var(--on-accent); overflow: hidden;
  }
  .progress { position: absolute; inset: 0 auto 0 0; background: rgba(0, 0, 0, .14); transition: width .25s linear; }
  .body { position: relative; display: flex; align-items: flex-end; justify-content: space-between; gap: .5rem; padding: .55rem .75rem .65rem; }
  .time { display: grid; min-width: 0; }
  .time strong { font-size: 2.8rem; line-height: .9; font-weight: 700; letter-spacing: -.05em; }
  .time span, .time small { font-family: var(--mono); font-size: .68rem; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .time span { order: -1; margin-bottom: .2rem; }
  .btns { display: flex; gap: .35rem; flex-shrink: 0; }
  button { min-width: 48px; min-height: 44px; padding: 0 .7rem; border: 1.5px solid currentColor; border-radius: var(--pill); background: transparent; color: inherit; font-weight: 700; }
  .main { background: var(--on-accent); border-color: var(--on-accent); color: var(--accent); }
  .over { background: var(--ink); color: var(--on-ink); animation: pulse .8s ease-in-out infinite alternate; }
  .over .time strong { font-size: 1.7rem; color: var(--accent); }
  .over .main { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.02); } }
  @media (prefers-reduced-motion: reduce) { .over { animation: none; } }
</style>
