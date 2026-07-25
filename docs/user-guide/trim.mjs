/**
 * Schneidet die von capture-screenshots.sh erzeugten PNGs auf ihren Inhalt zu:
 * entfernt die einfarbige Zentrier-Lücke rundherum (praktisch links/rechts).
 *
 * Aufgenommen wird im Screenshot-Modus (`#…&shot=1`), der den Spaltenschatten
 * abschaltet — die Lücke ist dadurch flach und exakt an der Eck-Hintergrundfarbe
 * erkennbar. Eine Rand-Spalte/-Zeile, deren Pixel alle innerhalb einer kleinen
 * Toleranz dieser Farbe liegen, gilt als Lücke und wird weggeschnitten. Der
 * App-Hintergrund (Sidebar-Weiß, Inhaltsfläche) liegt weiter entfernt und bleibt
 * erhalten. Aufruf:
 *   node docs/user-guide/trim.mjs <datei.png> [...]
 */
import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

const TOL = 6 // erkennt nur die flache Eckfarbe (App-Hintergrund liegt weiter weg → bleibt)
const files = process.argv.slice(2)

for (const file of files) {
  const png = PNG.sync.read(readFileSync(file))
  const { width, height, data } = png
  const at = (x, y) => (y * width + x) * 4
  const [br, bg, bb] = [data[0], data[1], data[2]] // Eckfarbe = flache Lücke
  const isBg = (x, y) => {
    const i = at(x, y)
    return Math.abs(data[i] - br) <= TOL && Math.abs(data[i + 1] - bg) <= TOL && Math.abs(data[i + 2] - bb) <= TOL
  }
  const colBg = (x) => {
    for (let y = 0; y < height; y++) if (!isBg(x, y)) return false
    return true
  }
  const rowBg = (y) => {
    for (let x = 0; x < width; x++) if (!isBg(x, y)) return false
    return true
  }
  let left = 0, right = width - 1, top = 0, bottom = height - 1
  while (left < right && colBg(left)) left++
  while (right > left && colBg(right)) right--
  while (top < bottom && rowBg(top)) top++
  while (bottom > top && rowBg(bottom)) bottom--

  const w = right - left + 1
  const h = bottom - top + 1
  if (w === width && h === height) {
    console.log(`  = ${file.split('/').pop()} (nichts zu schneiden)`)
    continue
  }
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = at(left + x, top + y)
      const d = (y * w + x) * 4
      out.data[d] = data[s]
      out.data[d + 1] = data[s + 1]
      out.data[d + 2] = data[s + 2]
      out.data[d + 3] = data[s + 3]
    }
  }
  writeFileSync(file, PNG.sync.write(out))
  console.log(`  ✂ ${file.split('/').pop()}: ${width}×${height} → ${w}×${h}`)
}
