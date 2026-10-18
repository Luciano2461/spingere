// Genera icone PWA e schermate di avvio iOS da un disegno SVG (solo forme, nessun font): bilanciere nero su arancio pieno.
// Uso: npm run icons
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ORANGE = '#ea4b23'
const INK = '#0e0e0e'
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Bilanciere in un riquadro 100×100: barra e due dischi per lato.
const mark = `
  <rect x="8" y="46.5" width="84" height="7" fill="${INK}"/>
  <rect x="17" y="25" width="10" height="50" fill="${INK}"/>
  <rect x="29" y="33" width="7" height="34" fill="${INK}"/>
  <rect x="73" y="25" width="10" height="50" fill="${INK}"/>
  <rect x="64" y="33" width="7" height="34" fill="${INK}"/>`

/** Icona quadrata: il disegno occupa `scale` del lato (più piccolo per le maskable, che vengono ritagliate). */
const iconSvg = (scale) => {
  const off = (100 - 100 * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${ORANGE}"/><g transform="translate(${off} ${off}) scale(${scale})">${mark}</g></svg>`
}

/** Schermata di avvio: arancio pieno con il bilanciere al centro, largo il 42% dello schermo. */
const splashSvg = (w, h) => {
  const size = w * 0.42
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${ORANGE}"/><g transform="translate(${(w - size) / 2} ${(h - size) / 2}) scale(${size / 100})">${mark}</g></svg>`
}

const out = async (svg, file, size) => {
  mkdirSync(dirname(file), { recursive: true })
  const img = sharp(Buffer.from(svg))
  await (size ? img.resize(size, size) : img).png({ compressionLevel: 9, palette: true }).toFile(file)
}

await out(iconSvg(0.86), join(root, 'icons', 'icon-192.png'), 192)
await out(iconSvg(0.86), join(root, 'icons', 'icon-512.png'), 512)
await out(iconSvg(0.62), join(root, 'icons', 'icon-maskable-512.png'), 512)
await out(iconSvg(0.80), join(root, 'icons', 'apple-touch-icon.png'), 180)

// Schermi iPhone in verticale: [larghezza CSS, altezza CSS, densità]. I file vanno elencati anche in index.html.
export const SPLASH = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2], [320, 568, 2],
]
for (const [w, h, d] of SPLASH) await out(splashSvg(w * d, h * d), join(root, 'splash', `splash-${w * d}x${h * d}.png`))

console.log('Icone e schermate di avvio generate in', root)
for (const [w, h, d] of SPLASH) {
  console.log(`<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)" href="/spingere/splash/splash-${w * d}x${h * d}.png" />`)
}
