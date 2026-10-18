export const TABS = [
  { id: 'oggi', label: 'Oggi', icon: '●' },
  { id: 'schede', label: 'Schede', icon: '☰' },
  { id: 'calendario', label: 'Calendario', icon: '▦' },
  { id: 'statistiche', label: 'Statistiche', icon: '▲' },
  { id: 'impostazioni', label: 'Impostazioni', icon: '⚙' },
] as const

export type TabId = (typeof TABS)[number]['id']

// #/<tab>/<sub>/<third>  es. #/schede/<idScheda>/<idGiorno>
function parse(): { tab: TabId; sub: string | null; third: string | null } {
  const [first, second, third] = location.hash.replace(/^#\/?/, '').split('/')
  const tab = TABS.some((t) => t.id === first) ? (first as TabId) : 'oggi'
  return { tab, sub: second || null, third: third || null }
}

export const route = $state(parse())

window.addEventListener('hashchange', () => {
  Object.assign(route, parse())
  window.scrollTo(0, 0) // ogni schermata parte dall'alto
})

export const go = (hash: string) => {
  location.hash = hash
}
