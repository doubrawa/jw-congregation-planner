import { beforeAll, describe, expect, it } from 'vitest'
import type { Befund } from '../../supabase/functions/import-week/befunde.ts'
import type { Week } from '../data/types'
import { APP_LANGS } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { befundZeile, geratenePunkte, stellenIn, type Stellen } from './heft-befunde'

/**
 * **Jeder Befund aus dem Arbeitsheft hat seinen eigenen Satz** (31.10.2026) —
 * in jeder Sprache der App. Die Zeile im Blatt „Programm holen" und über dem
 * Plan ist das Einzige, woran der Planer sieht, dass die App geraten hat; ein
 * Befund, der den Satz eines anderen trüge, schickte ihn an die falsche Stelle.
 */

const ALLE: Befund[] = [
  { art: 'zeitraum' },
  { art: 'lied', abschnitt: 'eroeffnung' },
  { art: 'leer', abschnitt: 'dienst' },
  { art: 'nummern', nr: 7, iid: 'i7' },
  { art: 'unvollstaendig', nr: 3, iid: 'i3', titel: 'Bibellesung', fehlt: ['minuten'] },
  { art: 'unbekannt', nr: 5, iid: 'i5', titel: 'Etwas Neues', form: 'Rollenspiel' },
  { art: 'bibellesung', abschnitt: 'schaetze', iid: 'i3' },
  { art: 'studium', abschnitt: 'lac', iid: 'i9' },
  { art: 'gliederung', sprache: 'fr', ist: 'a', soll: 'b' },
]

/** Stellen einer Woche, in der es keinen der Punkte mehr gibt: Es gilt, was der Import sah. */
const OHNE: Stellen = { abschnitt: (kind) => kind, punkt: () => null }
const zeile = (b: Befund, code: (typeof APP_LANGS)[number]['code'], stellen = OHNE) => befundZeile(b, dict(code), stellen, code)!

describe('befundZeile', () => {
  // Die Wörterbücher außer en kommen nachgeladen. Ohne das hier las `dict` für
  // zehn Sprachen den englischen Rückfall, und „in jeder Sprache" prüfte nur
  // Englisch (gefunden im Review vom 1.11.2026).
  beforeAll(() => Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code))))

  it('jede Art hat einen eigenen Satz — in jeder Sprache der App', () => {
    for (const { code } of APP_LANGS) {
      const saetze = ALLE.map((b) => zeile(b, code).text)
      expect(new Set(saetze).size, code).toBe(ALLE.length)
      for (const s of saetze) expect(s.trim(), code).not.toBe('')
    }
  })

  it('die Stelle: der Punkt mit Nummer und Titel, der Abschnitt über seinen Namen in der Woche, die Sprache beim Namen', () => {
    // Der Abschnitt kommt als Art; seinen Namen gibt die Woche, die gezeigt wird.
    const stellen: Stellen = { abschnitt: (kind) => `[${kind}]`, punkt: () => null }
    expect(ALLE.map((b) => zeile(b, 'de', stellen)).map((z) => [z.stelle, z.titel ?? null])).toEqual([
      [null, null],
      ['[eroeffnung]', null],
      ['[dienst]', null],
      ['Punkt 7', null],
      ['Punkt 3', 'Bibellesung'],
      ['Punkt 5', 'Etwas Neues'],
      ['[schaetze]', null],
      ['[lac]', null],
      ['Französisch', null],
    ])
  })

  it('einen Punkt nennt sie, wie die Woche ihn jetzt zeigt — nach dem Verschieben trägt er eine andere Nummer (Review Nr. 4)', () => {
    // `swapKeepNums` lässt die Nummern an ihrer Stelle: Der unbekannte Punkt 5
    // steht jetzt als 6 da, und die Woche zeigt ihn auf Englisch.
    const stellen: Stellen = { abschnitt: () => null, punkt: (iid) => (iid === 'i5' ? { nr: 6, titel: 'Something new' } : null) }
    const unbekannt = ALLE.find((b) => b.art === 'unbekannt')!
    expect(zeile(unbekannt, 'de', stellen)).toMatchObject({ stelle: 'Punkt 6', titel: 'Something new' })
    // Ohne Nummer in der Woche bleibt die Stelle, die der Import zählte.
    const ohneNummer: Stellen = { abschnitt: () => null, punkt: () => ({ titel: 'Ohne Nummer' }) }
    expect(zeile(unbekannt, 'de', ohneNummer)).toMatchObject({ stelle: 'Punkt 5', titel: 'Ohne Nummer' })
  })

  it('außerhalb des Deutschen steht kein deutscher Satz da', () => {
    for (const { code } of APP_LANGS.filter((l) => l.code !== 'de')) {
      for (const b of ALLE) expect(zeile(b, code).text, `${code} ${b.art}`).not.toBe(zeile(b, 'de').text)
    }
  })

  it('eine Art, die dieses Bündel nicht kennt, ergibt keine Zeile — statt eines Absturzes (Review 31.10.2026)', () => {
    // Die Function wird vor der App ausgerollt, und ein Gerät behält sein
    // Bündel, bis es neu lädt: Eine neue Art kann hier ankommen.
    const neu = { art: 'kuenftig', nr: 3 } as unknown as Befund
    expect(befundZeile(neu, dict('de'), OHNE, 'de')).toBeNull()
  })
})

describe('stellenIn', () => {
  const woche = {
    mid: {
      sections: [
        { label: 'SCHÄTZE', kind: 'schaetze', farbe: 'teal', items: [{ iid: 'a', num: 1, title: 'Vortrag', names: [] }] },
        { label: 'OHNE ART', farbe: 'gold', items: [{ song: 'Lied 1' }, { iid: 'b', num: 4, title: 'Neu', names: [] }] },
      ],
    },
  } as unknown as Week
  const stellen = stellenIn(woche, (s) => `«${s}»`)

  it('nimmt Überschrift, Nummer und Titel aus der gezeigten Woche, übersetzt wie dort', () => {
    expect(stellen.abschnitt('schaetze')).toBe('«SCHÄTZE»')
    expect(stellen.punkt('b')).toEqual({ nr: 4, titel: '«Neu»' })
  })

  it('was die Woche nicht hat, ist `null` — nie der Schlüssel', () => {
    expect(stellen.abschnitt('lac')).toBeNull()
    expect(stellen.punkt('weg')).toBeNull()
  })
})

describe('geratenePunkte', () => {
  it('die Kennungen der Punkte, an denen etwas geraten ist — Abschnitte, Woche und Sprachen tragen keine', () => {
    expect([...geratenePunkte(ALLE)].sort()).toEqual(['i3', 'i5', 'i9'])
    expect(geratenePunkte(undefined).size).toBe(0)
  })

  it('ohne den Punkt nach einem Nummernsprung — an ihm ist nichts geraten (Review 1.11.2026)', () => {
    // Positivkontrolle: Der Sprung trägt seine Kennung, für die Zeile im Kasten.
    expect(ALLE.find((b) => b.art === 'nummern')).toMatchObject({ iid: 'i7' })
    expect(geratenePunkte(ALLE).has('i7')).toBe(false)
  })
})
