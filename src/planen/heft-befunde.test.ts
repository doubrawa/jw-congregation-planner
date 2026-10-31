import { describe, expect, it } from 'vitest'
import type { Befund } from '../../supabase/functions/import-week/befunde.ts'
import { APP_LANGS } from '../i18n/langs'
import { dict } from '../i18n/ui'
import { befundZeile } from './heft-befunde'

/**
 * **Jeder Befund aus dem Arbeitsheft hat seinen eigenen Satz** (31.10.2026) —
 * in jeder Sprache der App. Die Zeile im Blatt „Programm holen" ist das
 * Einzige, woran der Planer sieht, dass die App geraten hat; ein Befund, der
 * den Satz eines anderen trüge, schickte ihn an die falsche Stelle.
 */

const ALLE: Befund[] = [
  { art: 'zeitraum' },
  { art: 'lied', abschnitt: 'eroeffnung' },
  { art: 'leer', abschnitt: 'dienst' },
  { art: 'nummern', nr: 7 },
  { art: 'unvollstaendig', nr: 3, titel: 'Bibellesung', fehlt: ['minuten'] },
  { art: 'unbekannt', nr: 5, titel: 'Etwas Neues', form: 'Rollenspiel' },
  { art: 'bibellesung', abschnitt: 'schaetze' },
  { art: 'studium', abschnitt: 'lac' },
  { art: 'gliederung', sprache: 'fr', ist: 'a', soll: 'b' },
]

const ohne = (s: string) => s
const zeile = (b: Befund, code: (typeof APP_LANGS)[number]['code'], name = ohne) => befundZeile(b, dict(code), name, code)!

describe('befundZeile', () => {
  it('jede Art hat einen eigenen Satz — in jeder Sprache der App', () => {
    for (const { code } of APP_LANGS) {
      const saetze = ALLE.map((b) => zeile(b, code).text)
      expect(new Set(saetze).size, code).toBe(ALLE.length)
      for (const s of saetze) expect(s.trim(), code).not.toBe('')
    }
  })

  it('die Stelle: der Punkt mit Nummer und Titel, der Abschnitt über seinen Namen in der Woche, die Sprache beim Namen', () => {
    // Der Abschnitt kommt als Art; seinen Namen gibt das Blatt aus der Woche, die es zeigt.
    const name = (kind: string) => `[${kind}]`
    expect(ALLE.map((b) => zeile(b, 'de', name)).map((z) => [z.stelle, z.titel ?? null])).toEqual([
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

  it('außerhalb des Deutschen steht kein deutscher Satz da', () => {
    for (const { code } of APP_LANGS.filter((l) => l.code !== 'de')) {
      for (const b of ALLE) expect(zeile(b, code).text, `${code} ${b.art}`).not.toBe(zeile(b, 'de').text)
    }
  })

  it('eine Art, die dieses Bündel nicht kennt, ergibt keine Zeile — statt eines Absturzes (Review 31.10.2026)', () => {
    // Die Function wird vor der App ausgerollt, und ein Gerät behält sein
    // Bündel, bis es neu lädt: Eine neue Art kann hier ankommen.
    const neu = { art: 'kuenftig', nr: 3 } as unknown as Befund
    expect(befundZeile(neu, dict('de'), ohne, 'de')).toBeNull()
  })
})
