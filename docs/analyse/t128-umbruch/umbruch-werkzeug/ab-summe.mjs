// Fasst Läufe von ab.mjs zusammen: node ab-summe.mjs wurzel-1 wurzel-2 …
// A ist die Ansicht, wie sie ist, B dieselbe mit der Regel aus `--css`. Gezählt
// werden späte Trennungen (höchstens vier Buchstaben nach dem Strich), Brüche
// ohne Strich und Überbreite; dazu jede Trennstelle, die sich ändert, nach
// Wort zusammengefasst („Königreichs|saal → König|reichssaal").
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const laeufe = process.argv.slice(2)
if (!laeufe.length) throw new Error('Aufruf: node ab-summe.mjs <lauf> [<lauf> …]')
const faelle = laeufe.flatMap((lauf) => JSON.parse(readFileSync(join(HIER, `ergebnis-${lauf}.json`), 'utf8')).faelle)

/** Das getrennte Wort aus „…ammlungsbibelstu|dium. Zu…": „Versammlungsbibelstu|dium" (so weit sichtbar). */
const wort = (stelle) => {
  const [l, r] = stelle.split('|')
  return `${l.split(/[\s„“"(]/u).pop()}|${r.split(/[\s,.;:!?“"»)]/u)[0]}`
}
const teile = (s) => {
  const [art, el, stelle, nach] = s.split(' | ')
  return { art, el, stelle, nach }
}
const sprache = (fall) => fall.split(':')[1]

const summe = { faelle: 0, fehler: 0 }
const a = {}
const b = {}
for (const f of faelle) {
  summe.faelle++
  if (f.fehler) {
    summe.fehler++
    continue
  }
  for (const [ziel, quelle] of [
    [a, f.a],
    [b, f.b],
  ])
    for (const [k, v] of Object.entries(quelle)) ziel[k] = (ziel[k] ?? 0) + v
}
console.log(`${laeufe.join(', ')}: ${summe.faelle} Fälle, ${summe.fehler} Fehler`)
console.log('A (wie es ist):', JSON.stringify(a))
console.log('B (mit Regel): ', JSON.stringify(b))

/** Mehrere Fälle unter einem Schlüssel: Zahl und die ersten Fundorte. */
const gruppen = new Map()
const merke = (k, fall) => {
  if (!gruppen.has(k)) gruppen.set(k, [])
  gruppen.get(k).push(fall)
}
for (const f of faelle) {
  if (f.fehler) {
    merke(`FEHLER | ${f.fehler}`, f.fall)
    continue
  }
  // Neue Schäden in B: Bruch ohne Strich, Zahl getrennt, Überbreite, Rollbalken, Text ragt hinaus.
  for (const s of f.neu) if (!s.startsWith('getrennt |')) merke(`NEU ${s.split(' | ').slice(0, 3).join(' | ')}`, f.fall)
  for (const s of f.weg) if (!s.startsWith('getrennt |')) merke(`WEG ${s.split(' | ').slice(0, 3).join(' | ')}`, f.fall)
  // Geänderte Trennstellen: dasselbe Wort im selben Element, an anderer Stelle
  // getrennt. Erkannt am Wortende — vorn schneidet die Stelle nach 16 Zeichen ab.
  const weg = f.weg.filter((s) => s.startsWith('getrennt |')).map(teile)
  const neu = f.neu.filter((s) => s.startsWith('getrennt |')).map(teile)
  const ende = (x) => wort(x.stelle).replace('|', '').slice(-8)
  for (const w of weg) {
    const i = neu.findIndex((n) => n.el === w.el && ende(n) === ende(w))
    const n = i >= 0 ? neu.splice(i, 1)[0] : null
    merke(`TRENNT ${sprache(f.fall)} ${w.el} | ${wort(w.stelle)} (${w.nach}) → ${n ? `${wort(n.stelle)} (${n.nach})` : 'ohne Trennung'}`, f.fall)
  }
  for (const n of neu) merke(`TRENNT ${sprache(f.fall)} ${n.el} | ohne Trennung → ${wort(n.stelle)} (${n.nach})`, f.fall)
  for (const s of f.spaetB) merke(`SPÄT-B ${sprache(f.fall)} ${s.split(' | ')[0]} | ${wort(s.split(' | ')[1])} (${s.split(' | ')[2]})`, f.fall)
}
for (const art of ['FEHLER', 'NEU', 'WEG', 'SPÄT-B', 'TRENNT']) {
  const liste = [...gruppen].filter(([k]) => k.startsWith(art + ' ')).sort((x, y) => y[1].length - x[1].length)
  console.log(`\n## ${art} (${liste.length} Gruppen, ${liste.reduce((s, [, v]) => s + v.length, 0)} Fälle)`)
  for (const [k, v] of liste) console.log(`${String(v.length).padStart(4)}  ${k.slice(art.length + 1)}   z. B. ${v.slice(0, 2).join(', ')}`)
}
