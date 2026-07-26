/*
 * Einmalige, mechanische Umstellung: jede feste Schriftgröße bekommt den
 * Skalierungsfaktor --fs (Profil → Schriftgröße) vorgeschaltet.
 *
 *   font-size: 12.5px   →   font-size: calc(12.5px * var(--fs))
 *
 * Der Originalwert bleibt im Quelltext lesbar — anders als bei einer
 * rem-Umrechnung, die aus 12.5px ein 0.78125rem machen würde. print.css bleibt
 * aussen vor: ein Ausdruck soll unabhängig von der Bildschirmeinstellung immer
 * gleich aussehen.
 *
 * Das Skript ist idempotent (bereits umgestellte Werte werden übersprungen) und
 * liegt nur zur Nachvollziehbarkeit im Repo; im Alltag wird es nicht gebraucht.
 * Aufruf: node scripts/scale-font-sizes.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs'

const DRY = process.argv.includes('--dry')
const files = globSync('src/**/*.css').filter((f) => !f.endsWith('print.css'))

// Nur Werte, die noch nicht in einem calc() stecken.
const PATTERN = /(font-size|line-height):\s*([0-9.]+)px/g

let total = 0
for (const file of files) {
  const before = readFileSync(file, 'utf8')
  let count = 0
  const after = before.replace(PATTERN, (_m, prop, value) => {
    count++
    return `${prop}: calc(${value}px * var(--fs))`
  })
  if (!count) continue
  total += count
  console.log(`${file}: ${count}`)
  if (!DRY) writeFileSync(file, after)
}
console.log(`${DRY ? 'würde ersetzen' : 'ersetzt'}: ${total}`)
