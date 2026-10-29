/**
 * Erzeugt alle PNG-Icons der App aus public/logo.svg, das Badge der
 * Push-Meldung aus public/logo-klein.svg — nie von Hand pflegen.
 *
 *   npm run icons
 *
 * Gerendert wird mit Chrome (headless) — demselben Renderer wie in der App, so
 * sieht das Icon aus wie das SVG daneben. (Bis zum 4.10.2026 war es auch
 * nötig: Das alte Logo hatte Verläufe und einen feDropShadow-Filter.) Der SVG
 * umschließt die Kachel eng (viewBox), die Polsterung je Ziel kommt aus
 * `share` unten:
 *
 *  - `any`-Icons (Launcher-Fallback, Notification): fast randfüllend.
 *  - `maskable`: Android legt seine eigene Maske darüber (Kreis, Squircle, …)
 *    und garantiert nur einen Kreis von 80 % Durchmesser — und zeigt dasselbe
 *    Icon groß auf dem Startbildschirm der installierten App. Deshalb
 *    randfüllend in der Kachelfarbe wie `background_color` im Manifest, das
 *    Motiv in der Safe-Zone (siehe TARGETS).
 *  - apple-touch-icon: iOS ignoriert SVG und füllt Transparenz mit Schwarz,
 *    braucht also eine eigene deckende PNG-Datei; die Ecken rundet iOS selbst,
 *    darum dort die Kachelfarbe als Fläche.
 *  - Badge der Push-Meldung: aus public/logo-klein.svg, nur das Motiv (siehe
 *    `maske`).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')

/**
 * Die Kachelfarbe des Logos — die Füllung seines ersten `<rect>`. Sie ist die
 * Fläche des apple-touch-icon (iOS rundet die Ecken selbst, auf Weiß stünde dort
 * eine kleinere Kachel in einer größeren) und des maskable-Icons.
 */
function kachelfarbe(svg) {
  const fill = /<rect\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1]
  if (!fill) throw new Error('logo.svg: keine Kachel (<rect fill="#rrggbb">) gefunden')
  return fill
}

/**
 * **Das Badge einer Push-Meldung ist eine Maske.** Android zeichnet es in der
 * Statusleiste und im Kopf der Meldung und liest davon nur den Alphakanal:
 * Jede deckende Stelle wird einfarbig. Bis zum 29.10.2026 stand dort
 * `icon-192.png`, deckend bis auf die runden Ecken — in der Statusleiste ein
 * weißer Klotz statt der Sitzreihen.
 *
 * Deshalb hier nur das Motiv der kleinen Fassung (3, 5 und 7 Plätze, wie das
 * Favicon), ohne Kachel, jede Reihe voll deckend: Die abgestufte Deckkraft der
 * hinteren Reihen ergäbe in der Maske nur blassere Punkte.
 */
function maske(svg) {
  const ohneKachel = svg.replace(/<rect\b[^>]*>(?:<\/rect>)?/, '')
  if (ohneKachel === svg) throw new Error('logo-klein.svg: keine Kachel (<rect>) gefunden')
  return ohneKachel.replace(/\sfill-opacity="[^"]*"/g, '').replace(/\sfill="#[0-9a-fA-F]{6}"/g, ' fill="#FFFFFF"')
}

/**
 * name, Kantenlänge, Anteil den das Motiv füllt, Hintergrund
 * (`transparent` oder `kachel`).
 *
 *  - `any`-Icons (Launcher/Desktop/Taskleiste, Notification): transparent, damit
 *    unter Windows nur die abgerundete Kachel erscheint statt eines weißen
 *    Quadrats. Das Motiv selbst ist deckend, nur der Rand außen ist frei.
 *  - `maskable`: randfüllend in der Kachelfarbe. Android zeigt dieses Icon
 *    auch groß auf dem Startbildschirm der installierten App, auf
 *    `background_color` — und die ist seit dem 15.10.2026 die Kachelfarbe
 *    (`tests/logo-farben.test.ts`). Bis dahin war sie Weiß, und vollflächig
 *    erschien dort ein Quadrat mit spitzen Ecken (Betreiber, 4.10.2026); auf
 *    der gleichen Farbe geht es im Startbildschirm auf. Die eigene Kachel des
 *    SVG verschwindet in der gleichen Fläche; das Motiv reicht bis 0,41 der
 *    Breite vom Mittelpunkt, mit 0,76 bleibt es bei 0,31 — innerhalb des
 *    Kreises von 0,4, den Android garantiert, und der Ränder der Masken.
 *  - apple-touch-icon: die Kachelfarbe (siehe `kachelfarbe`).
 *  - Badge (`maske`): Android zeigt es mit 24 dp, 96 px reichen bis zur
 *    vierfachen Dichte. Ohne Kachel füllt das Motiv nur 75 % der Breite des
 *    SVG; mit 1,17 reicht es über 88 % des Bilds. Was dabei über den Rand
 *    ragt, ist die leere Fläche, auf der die Kachel lag.
 *
 * Deckende Ziele dürfen NICHT transparent sein, sonst zeigt Androids Maske
 * Löcher bzw. iOS füllt mit Schwarz.
 */
const TARGETS = [
  { file: 'icon-192.png', size: 192, share: 0.9, hintergrund: 'transparent' },
  { file: 'icon-512.png', size: 512, share: 0.9, hintergrund: 'transparent' },
  { file: 'icon-512-maskable.png', size: 512, share: 0.76, hintergrund: 'kachel' },
  { file: 'apple-touch-icon.png', size: 180, share: 0.86, hintergrund: 'kachel' },
  { file: 'badge-96.png', size: 96, share: 1.17, hintergrund: 'maske' },
]

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' })
      return c
    } catch {
      /* nächster Kandidat */
    }
  }
  throw new Error('Chrome nicht gefunden — Pfad über die Umgebungsvariable CHROME setzen.')
}

/**
 * Prüft, dass wirklich ein Icon herauskam: Größe, Ecke (je nach Hintergrund),
 * Motiv in der Mitte. Beim Badge (`maske`) liegt die Bildmitte zwischen zwei
 * Reihen — dort zählt stattdessen die Fläche: Plätze und Pult sind da, die
 * Kachel nicht mehr.
 */
function verify(file, size, hintergrund) {
  const png = PNG.sync.read(readFileSync(file))
  if (png.width !== size || png.height !== size) {
    throw new Error(`${file}: ${png.width}×${png.height} statt ${size}×${size}`)
  }
  const cornerAlpha = png.data[3]
  if (hintergrund !== 'kachel') {
    if (cornerAlpha !== 0) throw new Error(`${file}: Ecke ist nicht transparent (Alpha ${cornerAlpha})`)
  } else if (cornerAlpha !== 255) {
    throw new Error(`${file}: Ecke ist transparent (Alpha ${cornerAlpha})`)
  }
  if (hintergrund === 'maske') {
    let deckend = 0
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] === 255) deckend++
    const anteil = deckend / (size * size)
    // Gemessen am 29.10.2026: 10 % voll deckend — 15 Punkte und das Pult.
    // `icon-192.png` mit seiner Kachel liegt bei 77 %, ein leeres Bild bei null.
    if (anteil < 0.05 || anteil > 0.4) throw new Error(`${file}: ${Math.round(anteil * 100)} % deckend — Motiv fehlt oder Kachel steht noch`)
    return
  }
  const mid = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4
  if (png.data[mid + 3] !== 255) throw new Error(`${file}: Bildmitte ist transparent — Motiv fehlt`)
  const isWhite = png.data[mid] > 245 && png.data[mid + 1] > 245 && png.data[mid + 2] > 245
  if (isWhite) throw new Error(`${file}: Bildmitte ist leer — SVG wurde nicht gerendert`)
}

const chrome = findChrome()
const svg = readFileSync(join(PUBLIC, 'logo.svg'), 'utf8')
const KACHEL = kachelfarbe(svg)
const MASKE = maske(readFileSync(join(PUBLIC, 'logo-klein.svg'), 'utf8'))
const work = mkdtempSync(join(tmpdir(), 'jw-icons-'))

try {
  for (const { file, size, share, hintergrund } of TARGETS) {
    const box = Math.round(size * share)
    const transparent = hintergrund !== 'kachel'
    const bg = { transparent: 'transparent', maske: 'transparent', kachel: KACHEL }[hintergrund]
    if (!bg) throw new Error(`${file}: unbekannter Hintergrund ${hintergrund}`)
    const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
body{width:${size}px;height:${size}px;background:${bg};overflow:hidden;
     display:flex;align-items:center;justify-content:center}
svg{display:block;flex:none;width:${box}px;height:${box}px}
</style>${hintergrund === 'maske' ? MASKE : svg}`
    const page = join(work, `${file}.html`)
    writeFileSync(page, html)
    const out = join(PUBLIC, file)
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      // Transparente Ziele brauchen einen durchsichtigen Standard-Hintergrund,
      // sonst rendert Chrome den Screenshot deckend weiß.
      `--default-background-color=${transparent ? '00000000' : 'ffffffff'}`,
      `--user-data-dir=${join(work, 'profile')}`,
      `--window-size=${size},${size}`,
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--virtual-time-budget=4000',
      `--screenshot=${out}`,
      page,
    ], { stdio: 'ignore' })
    verify(out, size, hintergrund)
    console.log(`  ✓ ${file}  (${size}×${size}, Motiv ${Math.round(share * 100)} %, ${transparent ? 'transparent' : `deckend ${bg}`})`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`Fertig — ${TARGETS.length} Icons aus logo.svg und logo-klein.svg erzeugt.`)
