import { describe, expect, it } from 'vitest'
import { buildAbsences } from '../data/absence'
import { emptyQualifications, privSetzen, serviceQualKey } from '../data/helpers'
import { helferKey, punktKey, sentKey } from '../data/planning'
import type { Wochenstand } from '../data/planungsstand'
import type { PartItem, Person, SentLog, Service, Week } from '../data/types'
import { lageDerWoche, naechsteHolWoche, wochenKarten, type UebersichtQuellen } from './wochen-uebersicht'

/**
 * **Die Wochen beim Planen** (T121, Phase 10, Entwürfe `GWochen`,
 * `GDesktopPlanen`): jede geladene Woche ab der laufenden, mit ihrer Lage und
 * ihrer Spur, und welche Woche „Holen" als Nächstes holt.
 *
 * Die Versammlung hält die Zusammenkünfte dienstags 19:00 und sonntags 10:00.
 */

const MEETINGS = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Montage im September 2026. */
const A = '2026-09-07'
const B = '2026-09-14'
const C = '2026-09-21'

/** Ein Zeitpunkt im September 2026 (örtlich). */
const am = (tag: number, stunde = 9): Date => new Date(2026, 8, tag, stunde, 0)

const person = (id: string, ...bereiche: string[]): Person => {
  const priv = emptyQualifications()
  for (const b of bereiche) privSetzen(priv, b, true)
  return { id, fn: id, ln: 'Test', role: 'verkuendiger', female: false, priv }
}
const GENUG = ['p1', 'p2', 'p3', 'p4'].map((id) => person(id, 'bibellesung', serviceQualKey('mik')))

/** Eine importierte Woche: eine Bibellesung und je zwei Mikrofone — fünf Plätze, alle offen. */
function woche(start: string): Week {
  return {
    range: `Woche ${start}`,
    book: '',
    start,
    mid: {
      date: '',
      end: '',
      sections: [
        {
          label: 'SCHÄTZE AUS GOTTES WORT',
          farbe: 'petrol',
          items: [{ iid: `i-${start}`, num: 3, title: 'Bibellesung', meta: '', names: [{ name: '', bereichsKey: 'bibellesung' }] }],
        },
      ],
      helpers: { mik: [] },
    },
    we: { date: '', end: '', sections: [], helpers: { mik: [] } },
  }
}

/** Dieselbe Woche, vollständig besetzt. */
function fertig(start: string): Week {
  const w = woche(start)
  ;(w.mid.sections[0]!.items[0] as PartItem).names[0] = { name: 'p1 Test', pid: 'p1', bereichsKey: 'bibellesung' }
  w.mid.helpers.mik = [{ name: 'p2 Test', pid: 'p2' }, { name: 'p3 Test', pid: 'p3' }]
  w.we.helpers.mik = [{ name: 'p2 Test', pid: 'p2' }, { name: 'p4 Test', pid: 'p4' }]
  return w
}

/** Alle Plätze einer fertigen Woche als gesendet. */
function gesendet(w: Week): SentLog {
  const log: SentLog = {}
  const k = (key: string, name: string) => (log[sentKey(key, name)] = '2026-09-01T08:00:00Z')
  k(punktKey(w.start, 'mid', (w.mid.sections[0]!.items[0] as PartItem).iid, 0), 'p1 Test')
  for (const tab of ['mid', 'we'] as const) {
    for (const [pos, slot] of (w[tab].helpers.mik ?? []).entries()) k(helferKey(w.start, tab, 'mik', pos), slot.name)
  }
  return log
}

function quellen(weeks: Week[], over: Partial<UebersichtQuellen> = {}): UebersichtQuellen {
  return {
    weeks,
    fsWeeks: [],
    persons: GENUG,
    services: DIENSTE,
    absences: [],
    abwesend: buildAbsences([], weeks, MEETINGS),
    confirmations: {},
    persoenlich: {},
    sentLog: {},
    zeiten: MEETINGS,
    sendenMoeglich: true,
    ...over,
  }
}

const stand = (over: Partial<Wochenstand>): Wochenstand => ({
  wi: 0, tab: 'mid', konflikte: 0, nichtBesetzbar: 0, offen: 0, nichtGesendet: 0, ...over,
})

describe('Welche Wochen die Übersicht zeigt', () => {
  it('jede geladene Woche ab der laufenden — auch eine fertige, anders als die Karte auf dem Start', () => {
    const weeks = [woche(A), fertig(B), woche(C)]
    const karten = wochenKarten(quellen(weeks, { sentLog: gesendet(weeks[1]!) }), am(7))
    expect(karten.map((k) => weeks[k.wi]!.start)).toEqual([A, B, C])
  })

  it('eine vergangene Woche steht nicht da — am Montag rückt die Liste weiter', () => {
    const weeks = [woche(A), woche(B)]
    expect(wochenKarten(quellen(weeks), am(14)).map((k) => k.wi)).toEqual([1])
  })

  it('am Sonntag ist die laufende Woche noch dabei', () => {
    const weeks = [woche(A), woche(B)]
    expect(wochenKarten(quellen(weeks), am(13, 20)).map((k) => k.wi)).toEqual([0, 1])
  })

  it('die Spur zählt wie bei den Zusagen der Woche — beide Zusammenkünfte', () => {
    const [karte] = wochenKarten(quellen([woche(A)]), am(7))
    expect(karte!.zahlen).toMatchObject({ besetzt: 0, gesamt: 5 })
  })
})

describe('Was eine Woche oben rechts sagt', () => {
  it('Probleme vor offenen Plätzen — Konflikte und nicht Besetzbares zusammen', () => {
    expect(lageDerWoche(stand({ konflikte: 1, nichtBesetzbar: 2, offen: 4 }))).toEqual({ art: 'probleme', n: 3 })
  })

  it('offene Plätze vor dem Versand', () => {
    expect(lageDerWoche(stand({ offen: 4, nichtGesendet: 2 }))).toEqual({ art: 'offen', n: 4 })
  })

  it('alles besetzt, aber noch nicht hinaus: bereit zum Senden', () => {
    expect(lageDerWoche(stand({ nichtGesendet: 2 }))).toEqual({ art: 'bereit' })
  })

  it('ist alles zugeteilt und gesendet, sagt sie nichts — das zeigt die Spur', () => {
    expect(lageDerWoche(stand({}))).toBeNull()
  })

  it('aus den Quellen: eine fertige, gesendete Woche ohne Lage, eine frisch geholte mit offenen Plätzen', () => {
    const weeks = [fertig(A), woche(B)]
    const karten = wochenKarten(quellen(weeks, { sentLog: gesendet(weeks[0]!) }), am(7))
    expect(karten.map((k) => k.lage)).toEqual([null, { art: 'offen', n: 5 }])
  })

  it('offline sagt keine Woche „bereit zum Senden" — gesendet werden kann dann nicht', () => {
    const weeks = [fertig(A)]
    expect(wochenKarten(quellen(weeks), am(7))[0]!.lage).toEqual({ art: 'bereit' })
    expect(wochenKarten(quellen(weeks, { sendenMoeglich: false }), am(7))[0]!.lage).toBeNull()
  })
})

describe('Welche Woche „Holen" als Nächstes holt', () => {
  it('die nach der spätesten geladenen — wie `import-week`', () => {
    expect(naechsteHolWoche([woche(A), woche(C), woche(B)], am(7))).toBe('2026-09-28')
  })

  it('ohne geladene Woche die laufende, ab ihrem Montag', () => {
    expect(naechsteHolWoche([], am(10))).toBe(A)
  })

  it('nach einer Pause die laufende, nicht die nach der zuletzt geladenen (16.10.2026)', () => {
    // Geladen bis zur Woche ab 7.9., heute ist Mittwoch, der 30.
    expect(naechsteHolWoche([woche(A)], am(30))).toBe('2026-09-28')
  })
})
