/**
 * Prüft die beiden Paletten in src/styles/tokens.css (T121, Graphit · Minze)
 * gegen WCAG 2.1, dazu, dass beide vollständig und richtig gekennzeichnet sind.
 *
 *   npm run contrast            beide Paletten
 *   npm run contrast -- dunkel  nur eine
 *
 * Geprüft wird, was in der Oberfläche übereinander liegt. **Text** muss
 * bestehen (sonst Fehlercode): Fließtext 7:1, alles andere 4.5:1. **Grafik**
 * (Umrisse, Punkte, Ring) wird nur berichtet: Der blasse Punkt „wartet" und die
 * Minze als Fläche sind im Entwurf bewusst zart und tragen ihre Aussage nie
 * allein — daneben steht immer Text oder eine Spur. Halbtransparente Werte
 * (rgba) werden über die Fläche gerechnet, auf der sie liegen.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSS = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')

/* ---- Farbwerte ----------------------------------------------------------- */

function parseColor(v) {
  const s = v.trim()
  let m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) {
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
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

/** Rumpf der Regel mit genau diesem Selektor-Anfang, `null` ohne sie. */
function rumpf(selector) {
  const i = CSS.indexOf(selector)
  if (i < 0) return null
  const start = CSS.indexOf('{', i)
  return CSS.slice(start, CSS.indexOf('\n}', start))
}

function werte(text) {
  return Object.fromEntries([...(text ?? '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const PALETTEN = {
  hell: rumpf(":root[data-theme='hell'] {"),
  dunkel: rumpf(":root[data-theme='dunkel'] {"),
}

/* ---- Zu prüfende Paarungen ---------------------------------------------- */

// [Vordergrund, Hintergrund, Mindestwert, Beschreibung]
const TEXT = [
  ['text', 'grund', 7, 'Fließtext auf Grund'],
  ['text', 'karte', 7, 'Fließtext auf Karte'],
  ['text', 'feld', 7, 'Text im Feld'],
  ['text', 'hoch', 7, 'Text auf erhabener Fläche'],
  ['text2', 'grund', 4.5, 'Sekundärtext auf Grund'],
  ['text2', 'karte', 4.5, 'Sekundärtext auf Karte'],
  ['text2', 'feld', 4.5, 'Sekundärtext im Feld (Wahl, nicht gedrückt)'],
  ['text3', 'grund', 4.5, 'Nebenangaben auf Grund'],
  ['text3', 'karte', 4.5, 'Nebenangaben auf Karte'],
  ['text3', 'feld', 4.5, 'Nebenangaben im Feld'],
  ['akzent-text', 'grund', 4.5, 'Akzenttext auf Grund'],
  ['akzent-text', 'karte', 4.5, 'Akzenttext auf Karte („Fertig")'],
  ['auf-akzent', 'akzent', 4.5, 'Text auf der Hauptaktion'],
  ['grund', 'text', 4.5, 'gedrückter Knopf der Wahl, gewählter Bereich und Tag'],
  ['problem', 'grund', 4.5, 'Problem als Text auf Grund'],
  ['problem', 'karte', 4.5, 'Problem als Text auf Karte'],
  ['sek1', 'karte', 4.5, 'Abschnitt 1 auf Karte'],
  ['sek2', 'karte', 4.5, 'Abschnitt 2 auf Karte'],
  ['sek3', 'karte', 4.5, 'Abschnitt 3 auf Karte'],
  ['leiste-text', 'leiste', 4.5, 'Text in der Aktionsleiste'],
]

const GRAFIK = [
  ['umriss', 'karte', 3, 'Umriss auf Karte'],
  ['umriss', 'grund', 3, 'Umriss auf Grund'],
  ['ring', 'karte', 3, 'gestrichelter Punkt (offen) auf Karte'],
  ['problem', 'karte', 3, 'roter Punkt auf Karte'],
  ['text', 'karte', 3, 'voller Punkt auf Karte'],
  ['wartet', 'karte', 3, 'blasser Punkt (wartet) auf Karte'],
  ['punkt-leer', 'karte', 3, 'leerer Punkt der Auslastung auf Karte'],
  ['akzent', 'karte', 3, 'Minze als Fläche auf Karte'],
]

/* ---- Prüfen -------------------------------------------------------------- */

const only = process.argv[2]
const fehler = []

for (const [name, text] of Object.entries(PALETTEN)) {
  if (only && name !== only) continue
  if (text === null) {
    fehler.push(`Palette „${name}" fehlt in tokens.css.`)
    continue
  }
  const vars = werte(text)
  const zeilen = []
  for (const [art, paare] of [['Text', TEXT], ['Grafik', GRAFIK]]) {
    for (const [fgKey, bgKey, min, label] of paare) {
      const fgRaw = parseColor(vars[fgKey] ?? '')
      const bgRaw = parseColor(vars[bgKey] ?? '')
      if (!fgRaw || !bgRaw) {
        fehler.push(`${name}: --${fgKey} oder --${bgKey} ist keine lesbare Farbe.`)
        continue
      }
      const bg = over(bgRaw, parseColor(vars.grund))
      const ratio = contrast(over(fgRaw, bg), bg)
      zeilen.push({ art, ok: ratio >= min, ratio, min, label, fgKey, bgKey })
    }
  }
  const schlecht = zeilen.filter((z) => !z.ok)
  console.log(`\n${name}: ${zeilen.length - schlecht.length}/${zeilen.length} bestanden`)
  for (const z of schlecht) {
    const marke = z.art === 'Text' ? '✗' : '·'
    console.log(`  ${marke} ${z.ratio.toFixed(2)}:1 (nötig ${z.min}) — ${z.label}  [--${z.fgKey} auf --${z.bgKey}]${z.art === 'Grafik' ? ' (Grafik, nur berichtet)' : ''}`)
    if (z.art === 'Text') fehler.push(`${name}: ${z.label} nur ${z.ratio.toFixed(2)}:1`)
  }
}

/* ---- Vollständigkeit ----------------------------------------------------- */

// Beide Paletten setzen dieselben Namen. Fehlt einer in „dunkel", gälte dort
// still der helle Wert aus `:root` — heller Text auf hellem Grund.
const hell = Object.keys(werte(PALETTEN.hell))
const dunkel = Object.keys(werte(PALETTEN.dunkel))
for (const k of hell) if (!dunkel.includes(k)) fehler.push(`--${k} fehlt in der dunklen Palette.`)
for (const k of dunkel) if (!hell.includes(k)) fehler.push(`--${k} fehlt in der hellen Palette.`)

// `color-scheme` lässt Eingabefelder und Bildlaufleisten passend zeichnen.
for (const [name, schema] of [['hell', 'light'], ['dunkel', 'dark']]) {
  if (!new RegExp(`color-scheme:\\s*${schema}`).test(PALETTEN[name] ?? '')) {
    fehler.push(`Palette „${name}" ohne color-scheme: ${schema}.`)
  }
}

if (fehler.length > 0) {
  console.error('')
  for (const f of fehler) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\nBeide Paletten vollständig, aller Text lesbar.')
