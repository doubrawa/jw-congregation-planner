import { describe, expect, it } from 'vitest'
import { emptyQualifications } from '../data/helpers'
import type { Person } from '../data/types'
import { gesetzteBlattfilter, KEIN_FILTER, passtOhneAuswahl, passtZurAuswahl, type PersonFilter } from './person-filter'

function person(patch: Partial<Person> = {}): Person {
  return {
    id: 'x',
    fn: 'Simon',
    ln: 'Krüger',
    role: 'verkuendiger',
    priv: emptyQualifications(),
    ...patch,
  }
}

const filter = (patch: Partial<PersonFilter>): PersonFilter => ({ ...KEIN_FILTER, ...patch })

describe('Volltextsuche', () => {
  const p = person()

  it('ohne Eingabe bleibt jeder sichtbar', () => {
    expect(passtOhneAuswahl(p, KEIN_FILTER)).toBe(true)
  })

  it('findet über den Namen — Groß-/Kleinschreibung egal', () => {
    expect(passtOhneAuswahl(p, filter({ q: 'krüger' }))).toBe(true)
    expect(passtOhneAuswahl(p, filter({ q: 'Meier' }))).toBe(false)
  })

  it('findet auch so, wie die Liste den Namen zeigt — Nachname zuerst', () => {
    // Die Liste schreibt „Krüger, Simon". Bis zum 1.10.2026 fand genau das
    // nichts, ebenso wenig „krüger s" zum Eingrenzen unter Namensvettern.
    for (const q of ['Krüger, Simon', 'krüger simon', 'krüger s', 'simon krüger']) {
      expect(passtOhneAuswahl(p, filter({ q })), q).toBe(true)
    }
    expect(passtOhneAuswahl(p, filter({ q: 'krüger t' }))).toBe(false)
  })

  it('Umlaute und ß: mit Umlaut, ohne und in Umschrift', () => {
    for (const q of ['krüger', 'kruger', 'krueger', 'KRUGER']) {
      expect(passtOhneAuswahl(p, filter({ q })), q).toBe(true)
    }
    const weiss = person({ fn: 'Sven', ln: 'Weiß', })
    expect(passtOhneAuswahl(weiss, filter({ q: 'weiss' }))).toBe(true)
    expect(passtOhneAuswahl(weiss, filter({ q: 'weiß' }))).toBe(true)
    const boehm = person({ fn: 'Frank', ln: 'Böhm', })
    for (const q of ['böhm', 'bohm', 'boehm']) {
      expect(passtOhneAuswahl(boehm, filter({ q })), q).toBe(true)
    }
    expect(passtOhneAuswahl(boehm, filter({ q: 'bahm' }))).toBe(false)
  })

  it('auch Akzente anderer Sprachen fallen weg — „jose" findet „José"', () => {
    expect(passtOhneAuswahl(person({ fn: 'José', ln: 'Núñez', }), filter({ q: 'jose nunez' }))).toBe(true)
  })

  /*
   * Hier stand „findet auch über den abweichenden Anzeigenamen". Den gibt es
   * seit T110 nicht mehr — gesucht wird über Vor- und Nachname, und die sind
   * je Versammlung eindeutig.
   */
})

describe('Filterfelder', () => {
  it('Geschlecht', () => {
    const bruder = person()
    const schwester = person({ female: true })
    expect(passtOhneAuswahl(bruder, filter({ sex: 'm' }))).toBe(true)
    expect(passtOhneAuswahl(bruder, filter({ sex: 'w' }))).toBe(false)
    expect(passtOhneAuswahl(schwester, filter({ sex: 'w' }))).toBe(true)
  })

  it('Rolle', () => {
    const aeltester = person({ role: 'aeltester' })
    expect(passtOhneAuswahl(aeltester, filter({ role: 'aeltester' }))).toBe(true)
    expect(passtOhneAuswahl(aeltester, filter({ role: 'verkuendiger' }))).toBe(false)
  })

  it('Gruppe — Personen ohne Gruppe fallen heraus', () => {
    expect(passtOhneAuswahl(person({ grp: 'g2' }), filter({ grp: 'g2' }))).toBe(true)
    expect(passtOhneAuswahl(person({ grp: 'g1' }), filter({ grp: 'g2' }))).toBe(false)
    expect(passtOhneAuswahl(person({ grp: null }), filter({ grp: 'g2' }))).toBe(false)
  })

  it('Aufgabenbereich — fest wie dynamisch (svc:<dienst>)', () => {
    const p = person({ priv: { ...emptyQualifications(), gebet: true, 'svc:mik': true } })
    expect(passtOhneAuswahl(p, filter({ priv: 'gebet' }))).toBe(true)
    expect(passtOhneAuswahl(p, filter({ priv: 'vortrag' }))).toBe(false)
    expect(passtOhneAuswahl(p, filter({ priv: 'svc:mik' }))).toBe(true)
    expect(passtOhneAuswahl(p, filter({ priv: 'svc:ton' }))).toBe(false)
  })

  it('mehrere Felder wirken zusammen (UND)', () => {
    const p = person({ role: 'aeltester', grp: 'g1', female: false })
    expect(passtOhneAuswahl(p, filter({ q: 'krüger', role: 'aeltester', grp: 'g1' }))).toBe(true)
    expect(passtOhneAuswahl(p, filter({ q: 'krüger', role: 'aeltester', grp: 'g2' }))).toBe(false)
  })

  it('die Auswahl über der Liste fragt diese Funktion nicht — so zählen ihre Knöpfe unter den übrigen Filtern', () => {
    expect(passtOhneAuswahl(person(), filter({ auswahl: 'abwesend' }))).toBe(true)
  })

  it('am Knopf „Filter" steht, wie viele Felder des Blatts gesetzt sind — Suche und Auswahl zählen nicht', () => {
    expect(gesetzteBlattfilter(KEIN_FILTER)).toBe(0)
    expect(gesetzteBlattfilter(filter({ q: 'x', auswahl: 'abwesend' }))).toBe(0)
    expect(gesetzteBlattfilter(filter({ sex: 'w', grp: 'g1' }))).toBe(2)
  })
})

/**
 * **Die Auswahl über der Liste** (T121, Entwurf `GPersonen`): eine zur Zeit —
 * ein Stand der Anmeldung, „Noch nicht angemeldet" oder wer heute fehlt.
 */
describe('Auswahl', () => {
  const lage = (stand: 'angemeldet' | 'link' | 'ohne', abwesend = false) => ({
    stand,
    abwesenheit: abwesend ? { id: 'a', personId: 'x', userId: null, from: '2026-09-01', to: '2026-09-09', reason: '' } : undefined,
    rechte: { admin: false, planer: false },
  })

  it('leer heißt alle', () => {
    for (const s of ['angemeldet', 'link', 'ohne'] as const) expect(passtZurAuswahl('', lage(s))).toBe(true)
  })

  it('ein Stand trifft genau ihn', () => {
    expect(passtZurAuswahl('link', lage('link'))).toBe(true)
    expect(passtZurAuswahl('link', lage('ohne'))).toBe(false)
    expect(passtZurAuswahl('angemeldet', lage('link'))).toBe(false)
  })

  it('„Noch nicht angemeldet" heißt mit Link oder ohne — nur nicht angemeldet', () => {
    expect(passtZurAuswahl('nichtAngemeldet', lage('link'))).toBe(true)
    expect(passtZurAuswahl('nichtAngemeldet', lage('ohne'))).toBe(true)
    expect(passtZurAuswahl('nichtAngemeldet', lage('angemeldet'))).toBe(false)
  })

  it('„Abwesend" fragt nur die Abwesenheit, nicht den Stand', () => {
    expect(passtZurAuswahl('abwesend', lage('angemeldet', true))).toBe(true)
    expect(passtZurAuswahl('abwesend', lage('angemeldet'))).toBe(false)
  })
})
