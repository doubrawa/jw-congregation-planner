// Fasst ergebnis-<lauf>.json zusammen: Brüche im Wort ohne Strich, getrennte
// Zahlen, Überbreite — je Element-Klasse und je Fall.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const lauf = process.argv[2] ?? 'vorher'
const e = JSON.parse(readFileSync(join(HIER, `ergebnis-${lauf}.json`), 'utf8'))

const zeilen = []
const proKlasse = new Map()
const zaehl = { faelle: 0, imWort: 0, zahl: 0, getrennt: 0, zuBreit: 0, roll: 0, fehler: 0 }
for (const f of e.faelle) {
  zaehl.faelle++
  for (const a of f.ansichten) {
    if (a.fehler) {
      zaehl.fehler++
      zeilen.push(`${f.fall} ${a.ansicht}: FEHLER ${a.fehler}`)
      continue
    }
    if (a.ueber.zuBreit) {
      zaehl.zuBreit++
      zeilen.push(`${f.fall} ${a.ansicht}: ZU BREIT sw ${a.ueber.sw} > ${a.ueber.B}; ragt: ${a.ueber.ragt.join('; ')}`)
    }
    if (a.ueber.roll.length) {
      zaehl.roll++
      zeilen.push(`${f.fall} ${a.ansicht}: ROLLBALKEN ${a.ueber.roll.join('; ')}`)
    }
    // Text, der aus seinem eigenen Kasten ragt (nur Läufe mit der neueren seite.js).
    if (a.textRaus?.length) {
      zaehl.textRaus = (zaehl.textRaus ?? 0) + a.textRaus.length
      zeilen.push(`${f.fall} ${a.ansicht}: TEXT RAGT AUS DEM KASTEN ${a.textRaus.join('; ')}`)
    }
    // Ragt ein Element aus dem Bild (auch nach links, das macht die Seite nicht breiter)?
    const ragt = a.ueber.ragt.filter((r) => !r.includes('(geklippt)') && !/^div\.sheet-backdrop/.test(r))
    if (ragt.length && !a.ueber.zuBreit) {
      zaehl.ragt = (zaehl.ragt ?? 0) + 1
      zeilen.push(`${f.fall} ${a.ansicht}: RAGT HINAUS ${ragt.join('; ')}`)
    }
    for (const fund of a.funde) {
      for (const b of fund.b) {
        if (b.art === 'getrennt') {
          zaehl.getrennt++
          continue
        }
        if (b.art === 'im-wort') zaehl.imWort++
        else zaehl.zahl++
        const k = `${b.art} ${fund.el}`
        if (!proKlasse.has(k)) proKlasse.set(k, [])
        proKlasse.get(k).push(`${f.fall} ${a.ansicht}: ${b.stelle}`)
      }
    }
  }
}
const aus = [
  `Lauf ${lauf}: ${JSON.stringify(zaehl)}`,
  '',
  ...[...proKlasse].sort((a, b) => b[1].length - a[1].length).flatMap(([k, v]) => [`## ${k} (${v.length})`, ...v.map((x) => '  ' + x)]),
  '',
  '## Überbreite / Rollbalken / Fehler',
  ...zeilen,
]
writeFileSync(join(HIER, `auswertung-${lauf}.txt`), aus.join('\n'))
console.log(aus.slice(0, 3).join('\n'))
for (const [k, v] of [...proKlasse].sort((a, b) => b[1].length - a[1].length)) console.log(String(v.length).padStart(4), k)
console.log('Überbreite/Rollbalken/Fehler-Zeilen:', zeilen.length)
