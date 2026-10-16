import { describe, expect, it } from 'vitest'
import type { ImportedPart, ImportedWeek } from '../supabase/functions/import-week/parse.ts'
import { befundeDerWoche, strukturBefunde } from './heft-pruefen.mjs'

/**
 * **Die Heft-Probe** (`heft-pruefen.mjs`, Betreiber 16.10.2026): Was an einer
 * geparsten Woche nach einer neuen Form der Seite aussieht. Gegengeprüft am
 * Parser vor der Fehlersuche: Er meldete jede der 65 gecachten Seiten der
 * Form ab 2027 — Eröffnung und Abschluss ohne Liednummer, kein Zwischenlied.
 *
 * Die Wochen hier sind Gerüste mit Platzhaltern, keine Seiten von jw.org.
 */

const punkt = (num: number, title: string, meta = '3 Min.'): ImportedPart => ({
  iid: `p${num}`,
  num,
  title,
  meta,
  mins: 3,
  names: [{ name: '', bereichsKey: 'platz' }],
})

/** Eine Woche, wie der Parser sie aus einer gewöhnlichen Seite macht. */
function woche(): ImportedWeek {
  return {
    range: '1.–7. Muster',
    book: 'BUCH 1-2',
    we: { date: '', end: '', sections: [], helpers: {} },
    mid: {
      date: '',
      end: '',
      helpers: {},
      sections: [
        { label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral', items: [{ iid: 'e', title: 'Lied 12 und Gebet · Einleitende Worte', names: [] }] },
        { label: 'ERSTER TEIL', kind: 'schaetze', farbe: 'petrol', items: [punkt(1, 'Erster Vortrag'), punkt(2, 'Graben'), punkt(3, 'Lesung')] },
        {
          label: 'ZWEITER TEIL',
          kind: 'dienst',
          farbe: 'gold',
          items: [punkt(4, 'Gespräche beginnen', 'VON HAUS ZU HAUS · 3 Min.'), punkt(5, 'Was würdest du sagen?', 'Besprechung · 5 Min.')],
        },
        { label: 'DRITTER TEIL', kind: 'lac', farbe: 'wein', items: [{ song: 'Lied 49' }, punkt(6, 'Örtliches'), punkt(7, 'Studium')] },
        { label: 'ABSCHLUSS', kind: 'abschluss', farbe: 'neutral', items: [{ iid: 'a', title: 'Schlussworte · Lied 61 und Gebet', names: [] }] },
      ],
    },
  }
}

const abschnitt = (w: ImportedWeek, farbe: string) => w.mid.sections.find((s) => s.farbe === farbe)!

describe('befundeDerWoche', () => {
  it('eine gewöhnliche Woche ist in Ordnung', () => {
    expect(befundeDerWoche(woche(), { deutsch: true })).toEqual([])
  })

  it('Eröffnung und Abschluss ohne Liednummer — so kam 2027 die Rückfall-Zeile', () => {
    const w = woche()
    ;(w.mid.sections[0]!.items[0] as ImportedPart).title = 'Lied · Gebet · Einleitende Worte'
    ;(w.mid.sections[4]!.items[0] as ImportedPart).title = 'Schlussworte · Gebet'
    expect(befundeDerWoche(w, { deutsch: false })).toEqual([
      'Eröffnung ohne Liednummer: „Lied · Gebet · Einleitende Worte"',
      'Abschluss ohne Liednummer: „Schlussworte · Gebet"',
    ])
  })

  it('die Liednummer zählt in jeder Schrift', () => {
    const w = woche()
    ;(w.mid.sections[0]!.items[0] as ImportedPart).title = 'سرود ۱۲۲ و دعا'
    expect(befundeDerWoche(w, { deutsch: false })).toEqual([])
  })

  it('kein Lied unter dem dritten Teil — das Zwischenlied fehlte', () => {
    const w = woche()
    const leben = abschnitt(w, 'wein')
    leben.items = leben.items.filter((i) => !('song' in i))
    expect(befundeDerWoche(w, { deutsch: false })).toEqual(['kein Lied unter „DRITTER TEIL"'])
  })

  it('Lücke in den Nummern, Punkt ohne Minuten, ohne Plätze, Abschnitt ohne Punkte', () => {
    const w = woche()
    const dienst = abschnitt(w, 'gold')
    ;(dienst.items[0] as ImportedPart).mins = undefined
    ;(dienst.items[1] as ImportedPart).names = []
    abschnitt(w, 'petrol').items = []
    expect(befundeDerWoche(w, { deutsch: false })).toEqual([
      '„ERSTER TEIL" ohne Punkte',
      'Punkt 4 „Gespräche beginnen" steht an Stelle 1',
      'Punkt 4 „Gespräche beginnen" ohne Minuten',
      'Punkt 5 „Was würdest du sagen?" steht an Stelle 2',
      'Punkt 5 „Was würdest du sagen?" ohne Plätze',
      'Punkt 6 „Örtliches" steht an Stelle 3',
      'Punkt 7 „Studium" steht an Stelle 4',
    ])
  })

  it('fehlt ein Abschnitt, stimmt die Gliederung nicht', () => {
    const w = woche()
    w.mid.sections.splice(2, 1)
    expect(befundeDerWoche(w, { deutsch: false })[0]).toBe('Abschnitte „neutral petrol wein neutral" statt „neutral petrol gold wein neutral"')
  })

  it('auf Deutsch: eine Form, die der Parser nicht kennt — so kam „Vortrag des Vorsitzenden" an', () => {
    const w = woche()
    ;(abschnitt(w, 'gold').items[0] as ImportedPart).meta = 'Vortrag des Vorsitzenden der Woche · 2 Min.'
    expect(befundeDerWoche(w, { deutsch: true })).toEqual([
      'Punkt 4 „Gespräche beginnen": Form „Vortrag des Vorsitzenden der Woche" — der Parser rät die Plätze',
    ])
    // In anderen Sprachen versteht der Parser die Formen ohnehin nicht — die
    // Plätze kommen dort von der deutschen Seite.
    expect(befundeDerWoche(w, { deutsch: false })).toEqual([])
  })
})

describe('strukturBefunde — gliedert sich die Fassung wie die deutsche?', () => {
  it('gleich gegliedert: nichts zu melden', () => {
    expect(strukturBefunde(woche(), woche())).toEqual([])
  })

  it('ein Punkt mehr verschöbe die Plätze, die nach der Stelle übertragen werden', () => {
    const fremd = woche()
    abschnitt(fremd, 'gold').items.push(punkt(8, 'Zusatz'))
    expect(strukturBefunde(woche(), fremd)).toEqual([
      expect.stringContaining('gold: 4 5 8 | wein'),
    ])
  })
})
