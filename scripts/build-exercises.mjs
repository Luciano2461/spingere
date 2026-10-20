// Costruisce il database esercizi di Spingere da una copia locale di free-exercise-db (Unlicense).
// Uso: node scripts/build-exercises.mjs <cartella-free-exercise-db>
// Produce: src/data/exercises.json (testo, nel bundle) e public/exercises/<id>/<n>.webp (immagini, in cache al primo uso).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = process.argv[2]
if (!srcDir) throw new Error('Passa la cartella di free-exercise-db come argomento')

const source = JSON.parse(readFileSync(join(srcDir, 'dist/exercises.json'), 'utf8'))
const tr = JSON.parse(readFileSync(join(root, 'data/translations.it.json'), 'utf8'))
const muscleIt = JSON.parse(readFileSync(join(root, 'data/muscles.it.json'), 'utf8'))
const equipIt = JSON.parse(readFileSync(join(root, 'data/equipment.it.json'), 'utf8'))
const overrides = JSON.parse(readFileSync(join(root, 'data/type-overrides.json'), 'utf8'))

function inferType(e) {
  if (overrides[e.id]) return overrides[e.id]
  if (e.category === 'cardio') return 'cardio'
  if (e.category === 'stretching') return 'timed'
  if (!e.equipment || e.equipment === 'body only') return e.force === 'static' ? 'timed' : 'bodyweight'
  return 'weight_reps'
}

const slug = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const out = []
const missing = []
for (const e of source) {
  const nameIt = tr[e.id]
  if (!nameIt) missing.push(e.id)
  for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) if (!muscleIt[m]) throw new Error('Muscolo senza traduzione: ' + m)
  const equipment = e.equipment ?? 'none'
  if (!equipIt[equipment]) throw new Error('Attrezzo senza traduzione: ' + equipment)
  out.push({
    id: 'b:' + slug(e.id),
    source: 'builtin',
    name: nameIt ?? e.name,
    nameOriginal: e.name,
    type: inferType(e),
    equipment,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    images: e.images.map((_, i) => `${slug(e.id)}/${i}.webp`),
    ...(nameIt ? {} : { needsTranslation: true }),
  })
}

mkdirSync(join(root, 'src/data'), { recursive: true })
writeFileSync(
  join(root, 'src/data/exercises.json'),
  JSON.stringify({ datasetVersion: 1, source: 'free-exercise-db (Unlicense)', exercises: out }) + '\n',
)
writeFileSync(join(root, 'src/data/synonyms.json'), JSON.stringify(JSON.parse(readFileSync(join(root, 'data/synonyms.it.json'), 'utf8'))) + '\n')
writeFileSync(join(root, 'src/data/common-names.json'), JSON.stringify(JSON.parse(readFileSync(join(root, 'data/common-names.it.json'), 'utf8'))) + '\n')
writeFileSync(join(root, 'src/data/muscles.json'), JSON.stringify(muscleIt, null, 1) + '\n')
writeFileSync(join(root, 'src/data/equipment.json'), JSON.stringify(equipIt, null, 1) + '\n')

let n = 0
for (const e of source) {
  for (let i = 0; i < e.images.length; i++) {
    const dest = join(root, 'public/exercises', `${slug(e.id)}/${i}.webp`)
    if (existsSync(dest)) continue
    mkdirSync(dirname(dest), { recursive: true })
    await sharp(join(srcDir, 'exercises', e.images[i])).rotate().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 70 }).toFile(dest)
    n++
  }
}
console.log(`Esercizi: ${out.length} | da tradurre: ${missing.length} | immagini convertite: ${n}`)
if (missing.length) console.log('Senza traduzione:', missing.slice(0, 20).join(', '), missing.length > 20 ? '…' : '')
