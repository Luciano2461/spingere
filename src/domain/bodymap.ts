/** Livello di intensità 0-4 di un muscolo rispetto al massimo della mappa: 0 = nessuna serie, 1-4 = da poco a tanto. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export function heatLevel(value: number, max: number): HeatLevel {
  if (!(value > 0) || !(max > 0)) return 0
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as HeatLevel
}

/** Opacità del colore per ogni livello (0 = muscolo non allenato). */
export const HEAT_OPACITY: Record<HeatLevel, number> = { 0: 0, 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 }
