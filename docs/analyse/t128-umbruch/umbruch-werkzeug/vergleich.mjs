// Vergleicht zwei Läufe (ergebnis-<a>.json, ergebnis-<b>.json) Fall für Fall:
// Was ist nachher dazugekommen, was weggefallen — je Art und Element-Klasse.
// node vergleich.mjs <vorher> <nachher>
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const [vorher, nachher] = process.argv.slice(2)
const lies = (lauf) => JSON.parse(readFileSync(join(HIER, `ergebnis-${lauf}.json`), 'utf8'))

/** Je Fall und Ansicht die Funde als Schlüssel „art | element | stelle". */
function funde(lauf) {
  const out = new Map()
  for (const f of lies(lauf).faelle) {
    for (const a of f.ansichten) {
      const schluessel = `${f.fall} ${a.ansicht}`
      const liste = []
      if (a.fehler) liste.push(`fehler | ${a.fehler}`)
      for (const fund of a.funde ?? [])
        for (const b of fund.b) if (b.art !== 'getrennt') liste.push(`${b.art} | ${fund.el} | ${b.stelle}`)
      if (a.ueber?.zuBreit) liste.push(`zu-breit | ${a.ueber.sw} > ${a.ueber.B}`)
      for (const r of a.ueber?.roll ?? []) liste.push(`rollbalken | ${r}`)
      for (const t of a.textRaus ?? []) liste.push(`ragt | ${t}`)
      out.set(schluessel, liste)
    }
  }
  return out
}

const a = funde(vorher)
const b = funde(nachher)
const neu = new Map()
const weg = new Map()
let summeA = 0
let summeB = 0
for (const [k, liste] of b) {
  const alt = a.get(k) ?? []
  summeA += alt.length
  summeB += liste.length
  const rest = [...alt]
  for (const x of liste) {
    const i = rest.indexOf(x)
    if (i >= 0) rest.splice(i, 1)
    else {
      const art = x.split(' | ').slice(0, 2).join(' | ')
      neu.set(art, [...(neu.get(art) ?? []), `${k}: ${x.split(' | ').slice(2).join(' | ')}`])
    }
  }
  for (const x of rest) {
    const art = x.split(' | ').slice(0, 2).join(' | ')
    weg.set(art, (weg.get(art) ?? 0) + 1)
  }
}
console.log(`Funde vorher ${summeA}, nachher ${summeB} (ohne Trennungen mit Strich)`)
console.log('\n## Neu dazugekommen')
for (const [art, liste] of [...neu].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`${String(liste.length).padStart(4)}  ${art}`)
  for (const z of liste.slice(0, 4)) console.log('        ' + z)
}
console.log('\n## Weggefallen')
for (const [art, n] of [...weg].sort((x, y) => y[1] - x[1])) console.log(`${String(n).padStart(4)}  ${art}`)
