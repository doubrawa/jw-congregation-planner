import { describe, expect, it } from 'vitest'
import { localizedWeek, localizedWeeks } from './localize'
import { lacAdd, lacAdjust, lacMove, lacRemove } from './planning'
import type { Meeting, PartItem, Week } from './types'

/** Kanonische (deutsche) Beispielwoche mit englischer Sprachvariante. */
function makeWeek(): Week {
  const mid: Meeting = {
    date: 'Dienstag, 8. September · 19:00',
    end: 'Ende ca. 20:45',
    sections: [
      {
        label: 'SCHÄTZE AUS GOTTES WORT',
        farbe: 'petrol',
        items: [
          { num: 1, title: 'Über Jehovas Eigenschaften', meta: '10 Min.', names: [{ name: 'T. Lindner', bereichsKey: 'vortrag' }] },
          { song: 'Lied 5' },
        ],
      },
      {
        label: 'UNSER LEBEN ALS CHRIST',
        farbe: 'wein',
        items: [
          { num: 6, title: 'Punkt A', meta: '15 Min.', names: [{ name: '', bereichsKey: 'vortrag' }] },
          { num: 7, title: 'Versammlungsbibelstudium', meta: '30 Min.', names: [{ name: '', rolle: 'Leiter', bereichsKey: 'studium' }] },
        ],
      },
    ],
    helpers: { mik: ['S. Krüger'] },
  }
  const altMid: Meeting = {
    date: 'Tuesday, September 8 · 19:00',
    end: 'Ends approx. 20:45',
    sections: [
      {
        label: 'TREASURES FROM GOD’S WORD',
        farbe: 'petrol',
        items: [
          { num: 1, title: 'Jehovah’s Qualities', meta: '10 min.', names: [] },
          { song: 'Song 5' },
        ],
      },
      {
        label: 'LIVING AS CHRISTIANS',
        farbe: 'wein',
        items: [
          { num: 6, title: 'Item A', meta: '15 min.', names: [] },
          { num: 7, title: 'Congregation Bible Study', meta: '30 min.', names: [] },
        ],
      },
    ],
    helpers: {},
  }
  const emptyWe: Meeting = { date: '', end: '', sections: [], helpers: {} }
  return {
    range: '7.–13. September',
    book: 'JEREMIA 32–33',
    current: false,
    mid,
    we: structuredClone(emptyWe),
    alt: {
      en: {
        range: 'September 7–13',
        book: 'JEREMIAH 32–33',
        current: false,
        mid: altMid,
        we: structuredClone(emptyWe),
      },
    },
  }
}

describe('localizedWeek (Sprachvarianten)', () => {
  it('übernimmt Texte aus der Variante, behält Zuteilungen und Struktur', () => {
    const week = makeWeek()
    const en = localizedWeek(week, 'en')
    expect(en).not.toBe(week)
    expect(en.range).toBe('September 7–13')
    expect(en.mid.sections[0].label).toBe('TREASURES FROM GOD’S WORD')
    const item = en.mid.sections[0].items[0] as PartItem
    expect(item.title).toBe('Jehovah’s Qualities')
    expect(item.meta).toBe('10 min.')
    // Zuteilungen bleiben kanonisch
    expect(item.names[0].name).toBe('T. Lindner')
    expect(en.mid.helpers.mik).toEqual(['S. Krüger'])
    // Lied aus der Variante
    expect(en.mid.sections[0].items[1]).toEqual({ song: 'Song 5' })
  })

  it('ohne Variante bleibt die Woche identisch (gleiche Referenz)', () => {
    const week = makeWeek()
    expect(localizedWeek(week, 'fr')).toBe(week)
    expect(localizedWeek(week, undefined)).toBe(week)
  })

  it('fällt bei Struktur-Abweichung auf die kanonische Zusammenkunft zurück', () => {
    const week = makeWeek()
    week.alt!.en.mid.sections[0].items.pop() // Variante desynchronisieren
    const en = localizedWeek(week, 'en')
    // mid bleibt komplett kanonisch (falsche Zuordnung wäre schlimmer)
    expect((en.mid.sections[0].items[0] as PartItem).title).toBe('Über Jehovas Eigenschaften')
    // Wochen-Kopf kommt weiterhin aus der Variante
    expect(en.range).toBe('September 7–13')
  })

  it('localizedWeeks lässt Wochen ohne Varianten unangetastet', () => {
    const weeks = [makeWeek()]
    expect(localizedWeeks(weeks, 'fr')).toBe(weeks)
    const localized = localizedWeeks(weeks, 'en')
    expect(localized).not.toBe(weeks)
    expect(localized[0].range).toBe('September 7–13')
  })
})

describe('LAC-Edits halten Sprachvarianten aligned', () => {
  const LAC = 1 // Sektionsindex von UNSER LEBEN ALS CHRIST

  it('lacRemove entfernt das Item auch in der Variante', () => {
    const weeks = [makeWeek()]
    const next = lacRemove(weeks, 0, 'mid', LAC, 0)
    expect(next[0].mid.sections[LAC].items).toHaveLength(1)
    expect(next[0].alt!.en.mid.sections[LAC].items).toHaveLength(1)
    // Anzeige der Variante funktioniert weiterhin (Struktur aligned)
    const en = localizedWeek(next[0], 'en')
    expect((en.mid.sections[LAC].items[0] as PartItem).title).toBe('Congregation Bible Study')
  })

  it('lacAdd fügt den eigenen Punkt in allen Varianten ein', () => {
    const weeks = [makeWeek()]
    const next = lacAdd(weeks, 0, 'mid', LAC, 'Örtliche Bedürfnisse')
    expect(next[0].mid.sections[LAC].items).toHaveLength(3)
    expect(next[0].alt!.en.mid.sections[LAC].items).toHaveLength(3)
    const en = localizedWeek(next[0], 'en')
    // Eigener Punkt bleibt in beiden Sprachen der lokale Text
    expect((en.mid.sections[LAC].items[1] as PartItem).title).toBe('Örtliche Bedürfnisse')
  })

  it('lacAdjust zieht Minuten und Ende in der Variante nach', () => {
    const weeks = [makeWeek()]
    const next = lacAdjust(weeks, 0, 'mid', LAC, 0, 5)
    expect((next[0].mid.sections[LAC].items[0] as PartItem).meta).toBe('20 Min.')
    expect((next[0].alt!.en.mid.sections[LAC].items[0] as PartItem).meta).toBe('20 min.')
    expect(next[0].alt!.en.mid.end).toBe('Ends approx. 20:50')
  })

  it('lacMove tauscht in der Variante dieselben Positionen', () => {
    const weeks = [makeWeek()]
    const next = lacMove(weeks, 0, 'mid', LAC, 0, 1)
    expect((next[0].mid.sections[LAC].items[0] as PartItem).title).toBe('Versammlungsbibelstudium')
    expect((next[0].alt!.en.mid.sections[LAC].items[0] as PartItem).title).toBe('Congregation Bible Study')
    // Nummern bleiben positionsfest — auch in der Variante
    expect((next[0].alt!.en.mid.sections[LAC].items[0] as PartItem).num).toBe(6)
  })
})
