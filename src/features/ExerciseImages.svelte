<script lang="ts">
  import { onMount } from 'svelte'
  import { liveQuery } from 'dexie'
  import { db } from '../db/db'
  import type { Exercise, ImageChoice } from '../domain/types'
  import { imageUrl } from '../services/assetCache'

  let { exercise }: { exercise: Exercise } = $props()

  let choice = $state<ImageChoice | undefined>(undefined)
  let photoUrl = $state<string | null>(null)

  onMount(() => {
    const sub = liveQuery(async () => {
      const c = await db.imageChoices.get(exercise.id)
      const photo = c?.kind === 'photo' && c.photoId ? await db.photos.get(c.photoId) : undefined
      return { c, blob: photo?.blob }
    }).subscribe(({ c, blob }) => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
      choice = c
      photoUrl = blob ? URL.createObjectURL(blob) : null
    })
    return () => {
      sub.unsubscribe()
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  })

  const sources = $derived(
    choice?.kind === 'photo'
      ? photoUrl ? [photoUrl] : []
      : choice?.kind === 'builtin' && choice.path
        ? [imageUrl(choice.path)]
        : exercise.images.map(imageUrl),
  )
</script>

<div class="imgs">
  {#each sources as src}
    <img {src} alt={exercise.name} loading="lazy" height="133" />
  {:else}
    <p class="none">Nessuna immagine</p>
  {/each}
</div>
{#if choice}<p class="note">{choice.kind === 'photo' ? 'Foto personale' : 'Immagine scelta da te'}</p>{/if}

<style>
  .imgs { display: flex; gap: .5rem; overflow-x: auto; }
  img { height: 133px; width: auto; border-radius: 0; background: var(--border); }
  .none, .note { color: var(--muted); font-size: .8rem; margin: .25rem 0 0; }
</style>
