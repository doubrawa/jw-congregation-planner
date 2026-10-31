import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { encode } from 'uqr'
import { dict } from '../i18n/ui'
import { zahlBinden } from '../i18n/zahl-binden'
import type { AusgestellterLink } from '../lib/links-ausstellen'
import { qrBild, zettelSatz } from './zettel-satz'

/**
 * **Der QR-Code auf dem Zettel liest sich** (T121, Phase 8).
 *
 * Gezeichnet wird er als eigener SVG-Pfad — ein Rechteck je Lauf dunkler
 * Module. Ein Fehler darin (ein Lauf zu kurz, eine Zeile verrutscht) sähe auf
 * Papier aus wie ein QR-Code und läse sich nicht. Deshalb zurück: Pfad →
 * Module → Bild → `jsqr`, dieselbe Bibliothek, mit der die Anmeldeseite scannt.
 */

/** Den Pfad zurück in Module lesen. */
function module(groesse: number, pfad: string): boolean[][] {
  const feld = Array.from({ length: groesse }, () => Array<boolean>(groesse).fill(false))
  for (const m of pfad.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [x, y, breite, zurueck] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
    expect(zurueck, 'jedes Rechteck schließt sich').toBe(breite)
    for (let i = 0; i < breite; i++) feld[y]![x + i] = true
  }
  return feld
}

/** Module als Graustufenbild für `jsqr`, mit hellem Rand. */
function bild(feld: boolean[][], massstab = 6, rand = 4): { daten: Uint8ClampedArray; kante: number } {
  const kante = (feld.length + 2 * rand) * massstab
  const daten = new Uint8ClampedArray(kante * kante * 4).fill(255)
  feld.forEach((zeile, y) =>
    zeile.forEach((dunkel, x) => {
      if (!dunkel) return
      for (let dy = 0; dy < massstab; dy++) {
        for (let dx = 0; dx < massstab; dx++) {
          const i = (((y + rand) * massstab + dy) * kante + (x + rand) * massstab + dx) * 4
          daten[i] = daten[i + 1] = daten[i + 2] = 0
        }
      }
    }),
  )
  return { daten, kante }
}

const ZETTEL_URL = 'https://versammlung.app/#code=K7RD2QWM'

describe('Der QR-Code des Zettels', () => {
  it('der Pfad trägt genau die Module, die `uqr` rechnet', () => {
    const { groesse, pfad } = qrBild(ZETTEL_URL)
    expect(module(groesse, pfad)).toEqual(encode(ZETTEL_URL, { ecc: 'M', border: 0 }).data)
  })

  it('und liest sich wieder als der Link des Zettels', () => {
    const { groesse, pfad } = qrBild(ZETTEL_URL)
    const { daten, kante } = bild(module(groesse, pfad))
    expect(jsQR(daten, kante, kante)?.data).toBe(ZETTEL_URL)
  })

  it('auch ein Zettel unter einer längeren Adresse (eigene Domain)', () => {
    const url = 'https://versammlung.example-gemeinde.org/app/#code=HX4P9VTA'
    const { groesse, pfad } = qrBild(url)
    const { daten, kante } = bild(module(groesse, pfad))
    expect(jsQR(daten, kante, kante)?.data).toBe(url)
  })
})

describe('Die Zettel zu ausgestellten Links', () => {
  const link = (personId: string, code: string): AusgestellterLink => ({
    personId,
    url: `https://versammlung.app/#anmelden=${'T'.repeat(43)}`,
    zettelUrl: `https://versammlung.app/#code=${code.replace('-', '')}`,
    code,
    gueltigBis: '2026-11-14T09:00:00.000Z',
  })

  it('je Link ein Zettel mit Name, Code und Datum — in der Folge der Links', () => {
    const satz = zettelSatz([link('p-b', 'K7RD-2QWM'), link('p-a', 'HX4P-9VTA')], {
      namen: new Map([['p-a', 'Anton Alt'], ['p-b', 'Bernd Brand']]),
      lang: 'de',
      t: dict('de'),
      versammlung: 'Musterstadt',
    })
    expect(satz.zettel.map((z) => [z.name, z.code, z.bis])).toEqual([
      ['Bernd Brand', 'K7RD-2QWM', zahlBinden('14. November 2026')],
      ['Anton Alt', 'HX4P-9VTA', zahlBinden('14. November 2026')],
    ])
    expect(satz.adresse).toBe('versammlung.app')
  })

  it('das Datum steht in der Sprache des Zettels, mit Jahr — gebunden, damit es auf dem schmalen Zettel nicht bricht', () => {
    const satz = zettelSatz([link('p-a', 'K7RD-2QWM')], { namen: new Map(), lang: 'en', t: dict('en'), versammlung: 'Musterstadt' })
    expect(satz.zettel[0]!.bis).toBe(zahlBinden('November 14, 2026'))
  })
})
