import { describe, expect, it } from 'vitest'
import { zeitenAus, zeitenSpalten } from '../../supabase/functions/_shared/planung.ts'
import { anwesenheitJeMonat } from './anwesenheit'
import { endenNachziehen } from './meeting-edit'
import { isoDay, meetingDate, meetingDateText, meetingOffset, meetingTime, regelzeit } from './meeting-dates'
import { neueWocheEinordnen } from './neue-woche'
import type { MeetingTimes, Week } from './types'
import { kommendeWechsel, ohneWechsel, zeitAb } from './zeit-wechsel'

/**
 * **Die Zusammenkunftszeit wechselt zu einer Woche** (13.11.2026).
 *
 * Der Anwendungsfall: Eine Versammlung teilt sich den Saal und trifft sich ab
 * Januar am Donnerstag um halb acht statt am Dienstag um sieben. Der Admin
 * trägt das im November ein. Bis zum Wechsel zeigt jede Woche den Dienstag,
 * ab der Woche vom 4. Januar den Donnerstag — und die Wochen davor behalten
 * ihren Tag auch dann, wenn später noch einmal gewechselt wird.
 *
 * Bis hierher gab es je Zusammenkunft eine Zeit, und die galt für jede Woche
 * zugleich: Eine Änderung datierte die vergangenen Wochen um (die Auswertung
 * zählte sie am falschen Tag), und im Voraus ließ sich nichts eintragen.
 */

const DIENSTAG = { wd: 2, time: '19:00' }
const DONNERSTAG = { wd: 4, time: '19:30' }
const SONNTAG = { wd: 0, time: '10:00' }
/** Ab der Woche vom 4. Januar 2027 am Donnerstag. */
const AB_JANUAR: MeetingTimes = {
  mid: { ...DIENSTAG, spaeter: [{ ab: '2027-01-04', ...DONNERSTAG }] },
  we: SONNTAG,
}

/** Minimale Woche: nur, was die Datumsrechnung liest. */
function woche(start: string, over: Partial<Week> = {}): Week {
  const leer = { date: '', end: 'Ende ca. 20:45', sections: [], helpers: {} }
  return { range: '', book: '', start, mid: { ...leer }, we: { ...leer, end: 'Ende ca. 11:45' }, ...over }
}

describe('Welche Zeit in einer Woche gilt', () => {
  it('vor dem Wechsel die Grundzeit, ab seiner Woche die neue — auch über den Jahreswechsel', () => {
    expect(regelzeit(AB_JANUAR, 'mid', '2026-11-09')).toEqual(DIENSTAG)
    // Die letzte Woche davor reicht ins neue Jahr (28.12.–3.1.) und gehört noch zum alten Rhythmus.
    expect(regelzeit(AB_JANUAR, 'mid', '2026-12-28')).toEqual(DIENSTAG)
    expect(regelzeit(AB_JANUAR, 'mid', '2027-01-04')).toEqual(DONNERSTAG)
    expect(regelzeit(AB_JANUAR, 'mid', '2027-06-07')).toEqual(DONNERSTAG)
  })

  it('der Wechsel der einen Zusammenkunft lässt die andere', () => {
    expect(regelzeit(AB_JANUAR, 'we', '2027-01-04')).toEqual(SONNTAG)
  })

  it('bei mehreren Wechseln gilt der jüngste, der nicht nach der Woche liegt', () => {
    const zeiten: MeetingTimes = {
      mid: {
        ...DIENSTAG,
        spaeter: [
          { ab: '2026-03-02', wd: 3, time: '19:00' },
          { ab: '2027-01-04', ...DONNERSTAG },
        ],
      },
      we: SONNTAG,
    }
    expect(regelzeit(zeiten, 'mid', '2026-02-23')).toEqual(DIENSTAG)
    expect(regelzeit(zeiten, 'mid', '2026-03-02')).toEqual({ wd: 3, time: '19:00' })
    expect(regelzeit(zeiten, 'mid', '2026-12-28')).toEqual({ wd: 3, time: '19:00' })
    expect(regelzeit(zeiten, 'mid', '2027-01-04')).toEqual(DONNERSTAG)
  })

  it('wer keine Woche kennt, bekommt die Grundzeit', () => {
    expect(regelzeit(AB_JANUAR, 'mid', undefined)).toEqual(DIENSTAG)
  })

  it('das Datum folgt: Dienstag, 29. Dezember — und Donnerstag, 7. Januar', () => {
    const davor = woche('2026-12-28')
    const danach = woche('2027-01-04')
    expect(isoDay(meetingDate(davor, 'mid', AB_JANUAR))).toBe('2026-12-29')
    expect(meetingTime(davor, 'mid', AB_JANUAR)).toBe('19:00')
    expect(isoDay(meetingDate(danach, 'mid', AB_JANUAR))).toBe('2027-01-07')
    expect(meetingTime(danach, 'mid', AB_JANUAR)).toBe('19:30')
    // So steht es in „Meine Aufgaben" und auf dem S-89-Zettel.
    expect(meetingDateText(danach, 'mid', AB_JANUAR)).toBe('Donnerstag, 7. Januar · 19:30')
  })

  it('eine Abweichung der Woche geht auch dem Wechsel vor', () => {
    // Die Woche des Kreisaufsehers: am Dienstag, obwohl der Rhythmus inzwischen Donnerstag sagt.
    const besuch = woche('2027-01-11', { dev: { mid: { wd: 2 } } })
    expect(meetingOffset(besuch, 'mid', AB_JANUAR)).toBe(1)
    // Die Uhrzeit hat die Abweichung nicht gesetzt — sie kommt aus dem Rhythmus dieser Woche.
    expect(meetingTime(besuch, 'mid', AB_JANUAR)).toBe('19:30')
  })
})

describe('Einen Wechsel eintragen', () => {
  it('im Voraus: Er steht an seinem Montag, die Grundzeit bleibt', () => {
    expect(zeitAb(DIENSTAG, '2027-01-04', DONNERSTAG)).toEqual(AB_JANUAR.mid)
  })

  it('ab der laufenden Woche ebenso — die Wochen davor fanden am alten Tag statt', () => {
    const neu = zeitAb(DIENSTAG, '2026-11-09', DONNERSTAG)
    expect(neu).toEqual({ ...DIENSTAG, spaeter: [{ ab: '2026-11-09', ...DONNERSTAG }] })
    const zeiten = { mid: neu, we: SONNTAG }
    expect(regelzeit(zeiten, 'mid', '2026-11-02')).toEqual(DIENSTAG)
    expect(regelzeit(zeiten, 'mid', '2026-11-09')).toEqual(DONNERSTAG)
  })

  it('derselbe Montag noch einmal ersetzt den Wechsel, statt einen zweiten anzulegen', () => {
    const neu = zeitAb(AB_JANUAR.mid, '2027-01-04', { wd: 5, time: '18:00' })
    expect(neu.spaeter).toEqual([{ ab: '2027-01-04', wd: 5, time: '18:00' }])
  })

  it('ein Wechsel auf das, was ohnehin gilt, wird nicht eingetragen', () => {
    // Sonst stünde „geplant: Dienstag 19:00" in den Einstellungen, und nichts änderte sich.
    expect(zeitAb(DIENSTAG, '2027-01-04', DIENSTAG)).toEqual(DIENSTAG)
    expect('spaeter' in zeitAb(DIENSTAG, '2027-01-04', DIENSTAG)).toBe(false)
  })

  it('heute die Uhrzeit verschieben nimmt den für Januar geplanten Wechsel nicht zurück', () => {
    const neu = zeitAb(AB_JANUAR.mid, '2026-11-09', { wd: 2, time: '19:15' })
    expect(neu.spaeter).toEqual([
      { ab: '2026-11-09', wd: 2, time: '19:15' },
      { ab: '2027-01-04', ...DONNERSTAG },
    ])
  })

  it('gleicht der spätere Wechsel danach dem neuen, fällt er weg — er änderte nichts mehr', () => {
    const neu = zeitAb(AB_JANUAR.mid, '2026-11-09', DONNERSTAG)
    expect(neu.spaeter).toEqual([{ ab: '2026-11-09', ...DONNERSTAG }])
  })

  it('die Wechsel stehen nach ihrem Montag geordnet, gleich in welcher Folge sie kamen', () => {
    // Gelesen wird der Reihe nach bis zum ersten, der nach der Woche liegt (`zeitDerWoche`).
    const erst = zeitAb(DIENSTAG, '2027-01-04', DONNERSTAG)
    const dann = zeitAb(erst, '2026-12-07', { wd: 3, time: '19:00' })
    expect(dann.spaeter?.map((w) => w.ab)).toEqual(['2026-12-07', '2027-01-04'])
    expect(regelzeit({ mid: dann, we: SONNTAG }, 'mid', '2026-12-14')).toEqual({ wd: 3, time: '19:00' })
  })

  it('die Zeit davor bleibt, wie sie war — der Reducer vergleicht mit ihr', () => {
    const vorher = structuredClone(AB_JANUAR.mid)
    zeitAb(AB_JANUAR.mid, '2026-11-09', { wd: 2, time: '19:15' })
    expect(AB_JANUAR.mid).toEqual(vorher)
  })
})

describe('Einen geplanten Wechsel streichen', () => {
  it('ab dort gilt wieder, was davor galt — und ohne Wechsel fehlt das Feld ganz', () => {
    const ohne = ohneWechsel(AB_JANUAR.mid, '2027-01-04')
    expect(ohne).toEqual(DIENSTAG)
    // Ein leeres `spaeter` zählte beim Speichern als Änderung (`geaenderteFelder`).
    expect('spaeter' in ohne).toBe(false)
  })

  it('die übrigen bleiben', () => {
    const zwei = zeitAb(AB_JANUAR.mid, '2027-03-01', { wd: 3, time: '19:00' })
    expect(ohneWechsel(zwei, '2027-01-04').spaeter).toEqual([{ ab: '2027-03-01', wd: 3, time: '19:00' }])
  })

  it('gleicht der folgende danach dem davor, fällt auch er weg', () => {
    // Dienstag → Donnerstag (Januar) → Dienstag (März): Ohne den Januar wechselt im März nichts mehr.
    const hinUndZurueck = zeitAb(AB_JANUAR.mid, '2027-03-01', DIENSTAG)
    expect(hinUndZurueck.spaeter).toHaveLength(2)
    expect(ohneWechsel(hinUndZurueck, '2027-01-04')).toEqual(DIENSTAG)
  })

  it('ein Montag ohne Wechsel ändert nichts', () => {
    expect(ohneWechsel(AB_JANUAR.mid, '2027-02-01')).toEqual(AB_JANUAR.mid)
  })
})

describe('Was noch bevorsteht', () => {
  const zeit = zeitAb(zeitAb(DIENSTAG, '2026-11-09', { wd: 2, time: '19:15' }), '2027-01-04', DONNERSTAG)

  it('nur, was nach der laufenden Woche liegt — der Wechsel der laufenden gilt schon', () => {
    expect(kommendeWechsel(zeit, '2026-11-09')).toEqual([{ ab: '2027-01-04', ...DONNERSTAG }])
  })

  it('eine Woche früher steht auch der nächste Montag noch bevor', () => {
    expect(kommendeWechsel(zeit, '2026-11-02').map((w) => w.ab)).toEqual(['2026-11-09', '2027-01-04'])
  })

  it('ist die Woche des Wechsels da, steht nichts mehr bevor', () => {
    expect(kommendeWechsel(zeit, '2027-01-04')).toEqual([])
    expect(kommendeWechsel(DIENSTAG, '2026-11-09')).toEqual([])
  })
})

describe('Spalten und Werte', () => {
  const ZEILE = { mid_wd: 2, mid_time: '19:00:00', we_wd: 0, we_time: '10:00:00' }

  it('hin und zurück bleibt, was eingetragen ist', () => {
    const zeiten: MeetingTimes = { mid: AB_JANUAR.mid, we: zeitAb(SONNTAG, '2027-01-04', { wd: 6, time: '18:00' }) }
    const spalten = zeitenSpalten(zeiten)
    expect(spalten).toEqual({
      mid_wd: 2,
      mid_time: '19:00',
      we_wd: 0,
      we_time: '10:00',
      zeiten_ab: [
        { ab: '2027-01-04', tab: 'mid', wd: 4, time: '19:30' },
        { ab: '2027-01-04', tab: 'we', wd: 6, time: '18:00' },
      ],
    })
    expect(zeitenAus(spalten)).toEqual(zeiten)
  })

  it('aus der Datenbank: je Zusammenkunft, nach dem Montag geordnet, die Uhrzeit ohne Sekunden', () => {
    const zeiten = zeitenAus({
      ...ZEILE,
      zeiten_ab: [
        { ab: '2027-03-01', tab: 'mid', wd: 3, time: '19:00:00' },
        { ab: '2027-01-04', tab: 'we', wd: 6, time: '18:00' },
        { ab: '2027-01-04', tab: 'mid', wd: 4, time: '19:30' },
      ],
    })
    expect(zeiten.mid.spaeter).toEqual([
      { ab: '2027-01-04', wd: 4, time: '19:30' },
      { ab: '2027-03-01', wd: 3, time: '19:00' },
    ])
    expect(zeiten.we.spaeter).toEqual([{ ab: '2027-01-04', wd: 6, time: '18:00' }])
  })

  it('ohne Wechsel sieht die Zeit aus wie eh und je — kein leeres Feld', () => {
    const zeiten = zeitenAus({ ...ZEILE, zeiten_ab: [] })
    expect(zeiten).toEqual({ mid: DIENSTAG, we: SONNTAG })
    expect('spaeter' in zeiten.mid).toBe(false)
    // Ebenso, wenn die Spalte fehlt (eine Abfrage, die sie nicht nennt).
    expect(zeitenAus(ZEILE)).toEqual({ mid: DIENSTAG, we: SONNTAG })
  })

  it('Unlesbares in der Spalte wird übergangen — der Ladevorgang bricht daran nicht ab', () => {
    const kaputt: unknown[] = [
      null,
      'ab Januar',
      { ab: '2027-01-04', wd: 4, time: '19:30' }, // ohne Zusammenkunft
      { ab: 'Januar', tab: 'mid', wd: 4, time: '19:30' },
      { ab: '2027-01-11', tab: 'mid', wd: 9, time: '19:30' },
      { ab: '2027-01-18', tab: 'mid', wd: 4, time: 'abends' },
      { ab: '2027-01-25', tab: 'mid', wd: 4, time: '19:30' }, // der eine lesbare
    ]
    expect(zeitenAus({ ...ZEILE, zeiten_ab: kaputt }).mid.spaeter).toEqual([{ ab: '2027-01-25', ...DONNERSTAG }])
    for (const keineListe of [null, 'x', 7, { ab: '2027-01-04' }]) {
      expect(zeitenAus({ ...ZEILE, zeiten_ab: keineListe }), String(keineListe)).toEqual({ mid: DIENSTAG, we: SONNTAG })
    }
  })

  it('stehen zwei Wechsel am selben Montag, gilt der spätere Eintrag', () => {
    const zeiten = zeitenAus({
      ...ZEILE,
      zeiten_ab: [
        { ab: '2027-01-04', tab: 'mid', wd: 3, time: '19:00' },
        { ab: '2027-01-04', tab: 'mid', wd: 4, time: '19:30' },
      ],
    })
    expect(zeiten.mid.spaeter).toEqual([{ ab: '2027-01-04', ...DONNERSTAG }])
  })
})

describe('Die Endzeiten folgen dem Wechsel — je Woche', () => {
  // `end` steht in den Wochendaten; den Anfang holt die Anzeige aus den
  // Einstellungen. Wechselt die Uhrzeit ab Januar, wandert das Ende der Wochen
  // ab dort mit und das der Wochen davor nicht.
  const wochen = () => [woche('2026-12-28'), woche('2027-01-04'), woche('2027-01-11')]
  const vorher: MeetingTimes = { mid: DIENSTAG, we: SONNTAG }

  it('nur die Wochen ab dem Wechsel wandern, um die Differenz der Uhrzeit', () => {
    const next = endenNachziehen(wochen(), vorher, AB_JANUAR)
    expect(next.map((w) => w.mid.end)).toEqual(['Ende ca. 20:45', 'Ende ca. 21:15', 'Ende ca. 21:15'])
    expect(next.map((w) => w.we.end)).toEqual(['Ende ca. 11:45', 'Ende ca. 11:45', 'Ende ca. 11:45'])
  })

  it('die Woche davor behält ihre Referenz — sie wird nicht geschrieben', () => {
    const alt = wochen()
    const next = endenNachziehen(alt, vorher, AB_JANUAR)
    expect(next[0]).toBe(alt[0])
    expect(next[1]).not.toBe(alt[1])
  })

  it('wird der geplante Wechsel gestrichen, wandern sie zurück', () => {
    const mit = endenNachziehen(wochen(), vorher, AB_JANUAR)
    const ohne = endenNachziehen(mit, AB_JANUAR, vorher)
    expect(ohne.map((w) => w.mid.end)).toEqual(['Ende ca. 20:45', 'Ende ca. 20:45', 'Ende ca. 20:45'])
  })

  it('wechselt nur der Tag, bleibt jedes Ende', () => {
    const nurTag: MeetingTimes = { mid: zeitAb(DIENSTAG, '2027-01-04', { wd: 4, time: '19:00' }), we: SONNTAG }
    const alt = wochen()
    expect(endenNachziehen(alt, vorher, nurTag)).toBe(alt)
  })
})

describe('Wer sonst nach der Zeit einer Woche fragt', () => {
  it('eine neu geholte Woche bekommt ihr Ende aus der Uhrzeit, die in ihr gilt', () => {
    const kontext = { zeiten: AB_JANUAR, auxClass: false, fsRules: [], gruppenbesuche: [], vortraege: [], persons: [], absences: [] }
    // 19:00 + 1:45 davor, 19:30 + 1:45 ab dem Wechsel.
    expect(neueWocheEinordnen(woche('2026-12-28'), kontext).week.mid.end).toBe('Ende ca. 20:45')
    expect(neueWocheEinordnen(woche('2027-01-04'), kontext).week.mid.end).toBe('Ende ca. 21:15')
  })

  it('die Anwesenheit einer nicht geladenen Woche zählt am Tag, der in ihr galt', () => {
    // Die Woche vom 29. März 2027: der Dienstag liegt im März, der Donnerstag
    // schon im April. Seit Januar ist Donnerstag — die Zahl gehört dem April.
    const zahl = [{ woche: '2027-03-29', tab: 'mid' as const, saal: 80, video: 5, pid: null }]
    const monate = anwesenheitJeMonat(zahl, [], AB_JANUAR, '2027-03-01', '2027-04-01', new Date(2027, 4, 1))
    expect(monate.map((m) => [m.monat, m.je.mid.anzahl])).toEqual([['2027-04-01', 1]])
    // Gegenprobe: Ohne den Wechsel bliebe sie im März.
    const ohne = anwesenheitJeMonat(zahl, [], { mid: DIENSTAG, we: SONNTAG }, '2027-03-01', '2027-04-01', new Date(2027, 4, 1))
    expect(ohne.map((m) => [m.monat, m.je.mid.anzahl])).toEqual([['2027-03-01', 1]])
  })
})
