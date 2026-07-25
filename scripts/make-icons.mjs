/**
 * Erzeugt alle PNG-Icons der App aus public/logo.svg — nie von Hand pflegen.
 *
 *   npm run icons
 *
 * Gerendert wird mit Chrome (headless), weil das Logo Gradienten und einen
 * feDropShadow-Filter nutzt; ein einfacher Rasterizer gibt das nicht korrekt
 * wieder. Der SVG umschließt die Kachel eng (viewBox), die Polsterung je Ziel
 * kommt aus `share` unten:
 *
 *  - `any`-Icons (Launcher-Fallback, Notification): fast randfüllend.
 *  - `maskable`: Motiv in der Safe-Zone (Android beschneidet die äußeren ~10 %
 *    und legt eine eigene Maske darüber — Kreis, Squircle, …).
 *  - apple-touch-icon: iOS ignoriert SVG und füllt Transparenz mit Schwarz,
 *    braucht also eine eigene deckende PNG-Datei.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')
const BG = '#ffffff' // deckend: maskable und iOS dürfen nicht transparent sein

/** name, Kantenlänge, Anteil den das Motiv füllt */
const TARGETS = [
  { file: 'icon-192.png', size: 192, share: 0.9 },
  { file: 'icon-512.png', size: 512, share: 0.9 },
  { file: 'icon-512-maskable.png', size: 512, share: 0.64 },
  { file: 'apple-touch-icon.png', size: 180, share: 0.86 },
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

/** Prüft, dass wirklich ein Icon herauskam: Größe, deckende Ecke, Motiv in der Mitte. */
function verify(file, size) {
  const png = PNG.sync.read(readFileSync(file))
  if (png.width !== size || png.height !== size) {
    throw new Error(`${file}: ${png.width}×${png.height} statt ${size}×${size}`)
  }
  if (png.data[3] !== 255) throw new Error(`${file}: Ecke ist transparent`)
  const mid = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4
  const isWhite = png.data[mid] > 245 && png.data[mid + 1] > 245 && png.data[mid + 2] > 245
  if (isWhite) throw new Error(`${file}: Bildmitte ist leer — SVG wurde nicht gerendert`)
}

const chrome = findChrome()
const svg = readFileSync(join(PUBLIC, 'logo.svg'), 'utf8')
const work = mkdtempSync(join(tmpdir(), 'jw-icons-'))

try {
  for (const { file, size, share } of TARGETS) {
    const box = Math.round(size * share)
    const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
body{width:${size}px;height:${size}px;background:${BG};overflow:hidden;
     display:flex;align-items:center;justify-content:center}
svg{display:block;width:${box}px;height:${box}px}
</style>${svg}`
    const page = join(work, `${file}.html`)
    writeFileSync(page, html)
    const out = join(PUBLIC, file)
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(work, 'profile')}`,
      `--window-size=${size},${size}`,
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--virtual-time-budget=4000',
      `--screenshot=${out}`,
      page,
    ], { stdio: 'ignore' })
    verify(out, size)
    console.log(`  ✓ ${file}  (${size}×${size}, Motiv ${Math.round(share * 100)} %)`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`Fertig — ${TARGETS.length} Icons aus logo.svg erzeugt.`)
