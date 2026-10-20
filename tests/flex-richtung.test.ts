import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cssDateien, cssRegeln } from './css-quellen'
import { klassenlisten } from './klassen-im-code'
import { quelldateien, WURZEL } from './quelldateien'

/**
 * **Eine Zeile, die umbricht, nennt ihre Richtung** — wenn auf demselben
 * Element eine Klasse steht, die eine Spalte ist (T128, 20.10.2026).
 *
 * `.karte` ist eine Spalte (`flex-direction: column`). Als die Kennzahlen der
 * Auswertung vom Raster auf `display: flex; flex-wrap: wrap` umzogen, galt für
 * sie die Richtung der Karte, die mit auf dem Element steht: Die drei Zahlen
 * standen untereinander, am Desktop jede 180 px hoch — ihr `flex-basis` wirkte
 * als Höhe. Die Messung sah nichts (kein Wort brach), die Proben auch nicht
 * (sie lasen `flex-wrap`). Gefunden hat es der Betreiber in der Live-App.
 *
 * Geprüft wird jede Klassenliste eines `className` (`klassen-im-code.ts`): Bricht
 * eine Klasse um, ohne irgendwo eine Richtung zu nennen, darf keine andere
 * Klasse der Liste eine Spalte sein. Gelesen werden die Regeln, deren Selektor
 * genau eine Klasse ist.
 */

const NUR_KLASSE = /^\.([A-Za-z][\w-]*)$/

/** Je Klasse: ob sie umbricht und welche Richtungen sie nennt, aus ihren eigenen Regeln. */
function flexJeKlasse(): { umbrechend: Set<string>; richtungen: Map<string, Set<string>> } {
  const umbrechend = new Set<string>()
  const richtungen = new Map<string, Set<string>>()
  for (const [, css] of cssDateien()) {
    for (const regel of cssRegeln(css)) {
      for (const selektor of regel.selektoren) {
        const klasse = NUR_KLASSE.exec(selektor)?.[1]
        if (!klasse) continue
        for (const [eigenschaft, wert] of regel.deklarationen) {
          if (eigenschaft !== 'flex-direction' && eigenschaft !== 'flex-flow' && eigenschaft !== 'flex-wrap') continue
          const woerter = wert.split(/\s+/)
          if (woerter.some((w) => w === 'wrap' || w === 'wrap-reverse')) umbrechend.add(klasse)
          for (const w of woerter.filter((w) => /^(row|column)(-reverse)?$/.test(w))) {
            richtungen.set(klasse, (richtungen.get(klasse) ?? new Set()).add(w))
          }
        }
      }
    }
  }
  return { umbrechend, richtungen }
}

describe('Wer umbricht, steht als Zeile — auch neben einer Spalte', () => {
  const { umbrechend, richtungen } = flexJeKlasse()
  const istSpalte = (klasse: string) => [...(richtungen.get(klasse) ?? [])].some((r) => r.startsWith('column'))
  const listen = quelldateien({ orte: ['src'], endungen: ['.tsx', '.ts'], ohneTests: true }).flatMap((pfad) =>
    klassenlisten(readFileSync(join(WURZEL, pfad), 'utf8')).map((liste) => [pfad, liste] as const),
  )

  it('die Probe kennt Spalten, Zeilen und Klassenlisten — sonst prüfte sie nichts', () => {
    expect(istSpalte('karte')).toBe(true)
    expect(umbrechend.has('aw-kennzahlen')).toBe(true)
    expect(listen.some(([, liste]) => liste.includes('karte') && liste.includes('aw-kennzahlen'))).toBe(true)
  })

  it('keine Klasse, die umbricht, ohne eine Richtung zu nennen, steht neben einer Spalte', () => {
    const treffer = listen.flatMap(([pfad, liste]) =>
      liste
        .filter((klasse) => umbrechend.has(klasse) && !richtungen.has(klasse))
        .flatMap((zeile) =>
          liste.filter((andere) => andere !== zeile && istSpalte(andere)).map((spalte) => `${pfad}: .${zeile} neben .${spalte}`),
        ),
    )
    expect(treffer, 'Die Zeile nennt ihre Richtung (`flex-flow: row wrap`) — sonst gilt die der Spalte daneben.').toEqual([])
  })
})

describe('der Leser der Klassenlisten', () => {
  it('eine Liste je className — bei einer Bedingung beide Seiten zusammen', () => {
    const tsx = '<a className={offen ? \'karte aw-a\' : \'karte\'} /><b className="x y" /><c className={`z ${w}-v u`} />'
    expect(klassenlisten(tsx)).toEqual([['karte', 'aw-a'], ['x', 'y'], ['z', 'u']])
  })
})
