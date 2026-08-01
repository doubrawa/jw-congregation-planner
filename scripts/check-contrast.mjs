/**
 * Prüft die Farbpaarungen der Paletten (src/styles/tokens.css) gegen WCAG 2.1.
 *
 *   npm run contrast            alle Paletten, Übersicht
 *   npm run contrast -- kontrast   nur eine Palette
 *
 * Geprüft wird, was in der Oberfläche tatsächlich übereinander liegt (Texte auf
 * Flächen, Rahmen gegen ihren Untergrund). Verbindlich ist die Palette „Hoher
 * Kontrast": schlägt dort etwas fehl, endet das Skript mit Fehlercode. Die
 * gestalterischen Paletten werden nur berichtet — sie folgen dem Design-Export
 * und sollen hier nicht stillschweigend umgefärbt werden.
 *
 * Halbtransparente Tokens (rgba) werden über --bg gerechnet, weil sie in der
 * Oberfläche immer auf dem Seitenhintergrund liegen.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSS = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')

/** Palette, die strikt bestehen muss. */
const STRICT = 'kontrast'

/* ---- Farbwerte ----------------------------------------------------------- */

function parseColor(v) {
  const s = v.trim()
  let m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) {
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) {
    const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16))
    return { r, g, b, a: 1 }
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s)
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x))
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }
  }
  return null
}

/** Halbtransparente Farbe über einen Untergrund legen. */
function over(fg, bg) {
  if (fg.a >= 1) return fg
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  }
}

function luminance({ r, g, b }) {
  const f = (c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(fg, bg) {
  const a = luminance(fg) + 0.05
  const b = luminance(bg) + 0.05
  return a > b ? a / b : b / a
}

/* ---- Paletten einlesen --------------------------------------------------- */

function block(selector) {
  const i = CSS.indexOf(selector)
  if (i < 0) return null
  const start = CSS.indexOf('{', i)
  const end = CSS.indexOf('\n}', start)
  const out = {}
  for (const m of CSS.slice(start, end).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim()
  }
  return out
}

const base = block(':root {')
const themes = { weiss: base }
for (const m of CSS.matchAll(/:root\[data-theme='([\w-]+)'\]/g)) {
  themes[m[1]] = { ...base, ...block(`:root[data-theme='${m[1]}']`) }
}

/* ---- Zu prüfende Paarungen ---------------------------------------------- */

// [Vordergrund, Hintergrund, Mindestwert, Beschreibung]
const PAIRS = [
  ['ink', 'bg', 7, 'Fließtext auf Seite'],
  ['ink', 'card', 7, 'Fließtext auf Karte'],
  ['ink', 'tNeu', 7, 'Text auf Sektion neutral'],
  ['ink', 'tNeu2', 7, 'Text auf Sektion neutral 2'],
  ['ink', 'tPet', 7, 'Text auf Sektion Petrol'],
  ['ink', 'tGld', 7, 'Text auf Sektion Gold'],
  ['ink', 'tWein', 7, 'Text auf Sektion Wein'],
  ['ink', 'tAcc', 7, 'Text auf Akzentfläche (aktiver Reiter)'],
  ['mut', 'bg', 4.5, 'Sekundärtext auf Seite'],
  ['mut', 'card', 4.5, 'Sekundärtext auf Karte'],
  ['mut', 'tNeu', 4.5, 'Sektionslabel neutral'],
  ['mut', 'tNeu2', 4.5, 'Sektionslabel neutral 2'],
  ['mut2', 'bg', 4.5, 'Sekundärtext 2 auf Seite'],
  ['acc', 'bg', 4.5, 'Akzenttext auf Seite'],
  ['acc', 'card', 4.5, 'Akzenttext auf Karte'],
  ['acc', 'tAcc', 4.5, 'Blätter-Pfeil auf Akzentfläche'],
  ['onAcc', 'acc', 4.5, 'Text auf gefülltem Button'],
  ['onAcc', 'accD', 4.5, 'Text auf Button (gedrückt)'],
  ['pet', 'tPet', 4.5, 'Sektionslabel Petrol'],
  ['gld', 'tGld', 4.5, 'Sektionslabel Gold'],
  ['wein', 'tWein', 4.5, 'Sektionslabel Wein'],
  ['pet', 'bg', 4.5, 'Petrol-Text auf Seite'],
  ['gld', 'bg', 4.5, 'Gold-Text auf Seite'],
  ['wein', 'bg', 4.5, 'Wein-Text auf Seite'],
  ['bord', 'bg', 3, 'Rahmen auf Seite'],
  ['bord2', 'card', 3, 'Rahmen auf Karte'],
  ['bord3', 'bg', 3, 'Rahmen kräftig'],
  ['bord4', 'bg', 3, 'Rahmen sehr kräftig'],
  ['dash', 'bg', 3, 'gestrichelter Rahmen'],
  ['acc', 'bg', 3, 'Bedienelement-Umriss'],
]

// Nur für „Hoher Kontrast": die Auslastungs-Quadrate sollen sich auch vom
// Untergrund abheben. Die gestalterischen Paletten nutzen bewusst zarte Töne.
const STRICT_ONLY = [
  ['load-free', 'card', 3, 'Quadrat „frei“'],
  ['load-task', 'card', 3, 'Quadrat „Aufgabe“'],
  ['load-helper', 'card', 3, 'Quadrat „Hilfsdienst“'],
]

/* ---- Prüfen -------------------------------------------------------------- */

const only = process.argv[2]
let strictFailed = 0

for (const [name, vars] of Object.entries(themes)) {
  if (only && name !== only) continue
  const strict = name === STRICT
  const pairs = strict ? [...PAIRS, ...STRICT_ONLY] : PAIRS
  const rows = []
  let worst = Infinity

  for (const [fgKey, bgKey, min, label] of pairs) {
    const fgRaw = parseColor(vars[fgKey] ?? '')
    const bgRaw = parseColor(vars[bgKey] ?? '')
    if (!fgRaw || !bgRaw) continue
    const page = parseColor(vars.bg) ?? { r: 255, g: 255, b: 255, a: 1 }
    const bg = over(bgRaw, page)
    const ratio = contrast(over(fgRaw, bg), bg)
    const ok = ratio >= min
    if (!ok) worst = Math.min(worst, ratio)
    if (!ok && strict) strictFailed++
    rows.push({ ok, ratio, min, label, fgKey, bgKey })
  }

  const bad = rows.filter((r) => !r.ok)
  const tag = strict ? ' (verbindlich)' : ''
  console.log(`\n${name}${tag}: ${rows.length - bad.length}/${rows.length} bestanden`)
  for (const r of bad) {
    console.log(
      `  ✗ ${r.ratio.toFixed(2)}:1 (nötig ${r.min}) — ${r.label}  [--${r.fgKey} auf --${r.bgKey}]`,
    )
  }
  if (bad.length === 0) console.log('  alle Paarungen erfüllt')
  else if (worst < Infinity && !strict) console.log(`  (nur berichtet, keine Vorgabe)`)
}

if (strictFailed > 0) {
  console.error(`\nFEHLGESCHLAGEN: ${strictFailed} Paarung(en) in „${STRICT}" unter der Vorgabe.`)
  process.exit(1)
}
console.log(`\nPalette „${STRICT}" erfüllt alle Vorgaben.`)
