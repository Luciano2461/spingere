import Sortable from 'sortablejs'

interface Options {
  handle: string
  onmove: (from: number, to: number) => void
}

/** Riordino con trascinamento (funziona col tocco). Riporta il DOM com'era e lascia che sia Svelte a ridisegnare l'ordine nuovo. */
export function sortable(node: HTMLElement, options: Options) {
  let current = options
  const instance = Sortable.create(node, {
    handle: current.handle,
    draggable: '.block',
    animation: 150,
    ghostClass: 'drag-ghost',
    forceFallback: false,
    onEnd(evt) {
      const { oldIndex, newIndex, item, from } = evt
      if (oldIndex == null || newIndex == null || oldIndex === newIndex) return
      from.removeChild(item)
      from.insertBefore(item, from.children[oldIndex] ?? null)
      current.onmove(oldIndex, newIndex)
    },
  })
  return {
    update(next: Options) {
      current = next
    },
    destroy() {
      instance.destroy()
    },
  }
}
