// Sagoma stilizzata del corpo, disegnata a mano per Spingere (originale, nessuna fonte esterna).
// Ogni forma è la METÀ SINISTRA (x ≤ 100) di una vista di 200×420; il componente la specchia per ottenere l'altra metà.
// Le chiavi dei muscoli sono quelle del database esercizi (data/muscles.json).

export const VIEW_WIDTH = 200
export const VIEW_HEIGHT = 420

export interface MuscleShape {
  muscle: string
  d: string
}

/** Contorno del corpo (sfondo neutro), metà sinistra. */
const OUTLINE =
  'M100 44 L91 52 C80 58 62 62 52 70 C42 78 40 92 40 108 C40 132 38 156 34 178 C32 192 30 204 32 214 L44 218 C48 204 52 190 56 178 ' +
  'L62 184 C62 196 62 206 66 214 C64 236 62 262 64 288 C64 312 66 336 68 356 C68 372 66 384 62 396 L90 396 C88 384 90 372 90 358 ' +
  'C92 334 94 312 96 290 C98 270 100 252 100 232 Z'

const HEAD = { cx: 100, cy: 26, r: 17 }

export const BODY_BASE = { outline: OUTLINE, head: HEAD }

const SHOULDER = 'M64 72 C52 72 45 80 44 96 C44 104 46 110 48 114 L60 112 C62 100 68 90 78 84 C76 78 72 74 64 72 Z'
const ARM_UPPER = 'M48 117 L60 115 C62 130 60 142 56 152 L46 150 C44 138 44 126 48 117 Z'
const FOREARM = 'M45 155 L56 157 C58 172 56 188 52 204 L40 202 C39 186 41 170 45 155 Z'
const CALF_FRONT = 'M69 292 L89 292 C89 316 86 338 82 356 L73 356 C67 336 67 312 69 292 Z'

export const FRONT: MuscleShape[] = [
  { muscle: 'neck', d: 'M100 44 L91 46 L88 58 L100 64 Z' },
  { muscle: 'traps', d: 'M89 58 L70 67 L64 73 L82 74 L100 67 L100 64 Z' },
  { muscle: 'shoulders', d: SHOULDER },
  { muscle: 'chest', d: 'M100 76 L80 80 C71 88 67 100 71 112 C79 121 92 123 100 121 Z' },
  { muscle: 'abdominals', d: 'M100 126 L85 126 C82 142 82 162 86 184 L100 190 Z' },
  { muscle: 'biceps', d: ARM_UPPER },
  { muscle: 'forearms', d: FOREARM },
  { muscle: 'quadriceps', d: 'M100 204 L75 198 C69 222 67 252 71 284 L87 286 C93 264 96 238 98 216 L100 210 Z' },
  { muscle: 'adductors', d: 'M100 212 C99 236 96 264 90 286 L96 288 C99 270 100 252 100 232 Z' },
  { muscle: 'calves', d: CALF_FRONT },
]

export const BACK: MuscleShape[] = [
  { muscle: 'traps', d: 'M100 56 L90 58 L70 68 L66 75 L78 88 L90 106 L100 128 Z' },
  { muscle: 'shoulders', d: SHOULDER },
  { muscle: 'lats', d: 'M78 98 L70 114 C66 134 68 154 76 170 L90 174 L91 132 L86 106 Z' },
  { muscle: 'middle back', d: 'M100 108 L91 108 L92 132 L91 152 L100 156 Z' },
  { muscle: 'lower back', d: 'M100 160 L91 156 L90 174 L96 192 L100 192 Z' },
  { muscle: 'triceps', d: ARM_UPPER },
  { muscle: 'forearms', d: FOREARM },
  { muscle: 'glutes', d: 'M100 196 L78 196 C70 206 70 224 78 238 C88 246 98 242 100 238 Z' },
  { muscle: 'abductors', d: 'M76 190 L66 196 C62 208 64 220 70 230 L77 220 Z' },
  { muscle: 'hamstrings', d: 'M100 244 L79 244 C73 262 73 280 77 292 L92 292 C98 278 100 258 100 244 Z' },
  { muscle: 'calves', d: 'M71 298 L93 298 C93 322 89 342 85 356 L75 356 C69 336 69 316 71 298 Z' },
]

export const ALL_SHAPES = [...FRONT, ...BACK]
