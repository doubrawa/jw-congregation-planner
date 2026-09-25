import { describe, expect, it } from 'vitest'
import {
  currentWeekIndex,
  deutschesDatum,
  meetingDateMs,
  meetingDateText,
  meetingOffset,
  meetingTime,
  montagNach,
  tageZwischen,
  weekEndMs,
} from './meeting-dates'
import type { Week } from './types'

/*
 * Hier standen `meetingDayOffsets` und `meetingTimesOf`: zwei Leser für **einen
 * Anzeigetext** („Di 19:00 · So 10:00"), aus dem Tag und Uhrzeit der Stellung
 * nach zurückgelesen wurden — der erste Treffer war die Wochenmitte, der zweite
 * das Wochenende, und was nicht passte, fiel stumm auf Dienstag/Sonntag zurück.
 *
 * Die Versammlung führt beides seit dem 18. September 2026 als Werte
 * (`Congregation.times`, vier Spalten). Zu prüfen bleibt die Umrechnung in Tage
 * ab Montag, und die steht in `planen/wochentage.test.ts`.
 */

/** Minimale Woche: nur, was die Datumsrechnung liest. */
function woche(start = '', midDate = '', weDate = ''): Week {
  const leer = { end: '', sections: [], helpers: {} }
  return {
    range: '',
    book: '',
    
    start,
    mid: { ...leer, date: midDate },
    we: { ...leer, date: weDate },
  }
}

const MEETINGS = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const MONTAG = '2026-09-07' // ISO-Montag

describe('meetingDateMs', () => {
  it('addiert den Wochentag-Versatz auf den Wochenstart', () => {
    // Montag + 1 Tag = Dienstag 2026-09-08
    expect(meetingDateMs(woche(MONTAG), 'mid', MEETINGS)).toBe(Date.parse('2026-09-08'))
    // Montag + 6 Tage = Sonntag 2026-09-13
    expect(meetingDateMs(woche(MONTAG), 'we', MEETINGS)).toBe(Date.parse('2026-09-13'))
  })

  it('null ohne Startdatum (Demo-/Vorlagen-Wochen) oder bei Unlesbarem', () => {
    expect(meetingDateMs(woche(undefined), 'mid', MEETINGS)).toBeNull()
    expect(meetingDateMs(woche('kein-datum'), 'mid', MEETINGS)).toBeNull()
  })

  it('folgt der Abweichung der Woche statt dem Rhythmus', () => {
    // Der Countdown rechnete den Sondertermin früher NICHT mit: Zeitleiste und
    // Abwesenheitsprüfung nannten den Samstag, die Erinnerung den Dienstag.
    const gedaechtnismahl = woche(MONTAG)
    gedaechtnismahl.dev = { mid: { wd: 6, time: '19:30' } } // Samstag
    expect(meetingDateMs(gedaechtnismahl, 'mid', MEETINGS)).toBe(Date.parse('2026-09-12'))
  })
})

describe('meetingOffset / meetingTime — eine Rangfolge für Tag und Zeit', () => {
  it('ohne Abweichung gilt der Rhythmus der Versammlung', () => {
    expect(meetingOffset(woche(MONTAG), 'mid', MEETINGS)).toBe(1)
    expect(meetingTime(woche(MONTAG), 'we', MEETINGS)).toBe('10:00')
  })

  it('mit Abweichung gilt diese — für Tag UND Zeit', () => {
    const w = woche(MONTAG)
    w.dev = { mid: { wd: 6, time: '19:30' } }
    expect(meetingOffset(w, 'mid', MEETINGS)).toBe(5)
    expect(meetingTime(w, 'mid', MEETINGS)).toBe('19:30')
  })

  it('der Sonntag ist die 0 und darf nicht als „kein Tag" gelten', () => {
    // `?? ` statt `||`: Eine auf Sonntag verlegte Zusammenkunft unter der Woche
    // fiele mit `||` auf den Rhythmus zurück — und niemand käme.
    const w = woche(MONTAG)
    w.dev = { mid: { wd: 0 } }
    expect(meetingOffset(w, 'mid', MEETINGS)).toBe(6)
  })

  it('das date-Feld ist kein Termin mehr, sondern Anzeigetext', () => {
    // Importierte Wochen tragen dort „7.–13. September". Aus dem Feld wurde bis
    // T105 ein Wochentag zurückgelesen — jetzt sagt allein die Abweichung, ob
    // eine Woche vom Rhythmus abweicht.
    const w = woche(MONTAG, 'Samstag, 12. September · 19:30')
    expect(meetingOffset(w, 'mid', MEETINGS)).toBe(1)
    expect(meetingTime(w, 'mid', MEETINGS)).toBe('19:00')
  })
})

describe('currentWeekIndex', () => {
  const wochen = [woche('2026-09-07'), woche('2026-09-14'), woche('2026-09-21')]

  it('findet die Woche, in die heute fällt', () => {
    expect(currentWeekIndex(wochen, new Date(2026, 8, 14, 12))).toBe(1) // Montag
    expect(currentWeekIndex(wochen, new Date(2026, 8, 20, 23))).toBe(1) // Sonntag
    expect(currentWeekIndex(wochen, new Date(2026, 8, 21, 0))).toBe(2)
  })

  it('−1, wenn heute außerhalb aller geladenen Wochen liegt', () => {
    expect(currentWeekIndex(wochen, new Date(2026, 7, 1))).toBe(-1)
    expect(currentWeekIndex(wochen, new Date(2026, 9, 1))).toBe(-1)
  })

  it('überspringt Platzhalter ohne Startdatum', () => {
    const mitLuecke = [woche(undefined), woche(undefined), ...wochen]
    expect(currentWeekIndex(mitLuecke, new Date(2026, 8, 15))).toBe(3)
  })
})

describe('meetingDateText — Termin statt Wochenspanne', () => {
  it('rechnet aus dem Startdatum, wenn nur die Spanne dasteht', () => {
    // Der jw.org-Kopf liefert „7.–13. September": keine Jahreszahl, kein
    // Wochentag, keine Uhrzeit. Genau das stand in „Meine Aufgaben", im
    // S-89-Formular und im Erinnerungstext.
    const w = woche(MONTAG, '7.–13. September', '7.–13. September')
    expect(meetingDateText(w, 'mid', MEETINGS)).toBe('Dienstag, 8. September · 19:00')
    expect(meetingDateText(w, 'we', MEETINGS)).toBe('Sonntag, 13. September · 10:00')
  })

  it('eine verlegte Zusammenkunft nennt den verlegten Tag', () => {
    const w = woche(MONTAG, '7.–13. September')
    w.dev = { mid: { wd: 6, time: '19:30' } } // Samstag
    expect(meetingDateText(w, 'mid', MEETINGS)).toBe('Samstag, 12. September · 19:30')
  })

  it('das Ergebnis ist kanonisch deutsch und damit übersetzbar', () => {
    // Die Datumsregeln in i18n/translate.ts greifen nur auf dieser Schreibweise.
    expect(deutschesDatum(new Date(2026, 8, 8))).toBe('Dienstag, 8. September')
    expect(deutschesDatum(new Date(2026, 2, 1))).toBe('Sonntag, 1. März')
  })
})

describe('weekEndMs', () => {
  it('liefert den Sonntag — das Ende der Kalenderwoche, nicht einen Termin', () => {
    expect(weekEndMs(MONTAG)).toBe(Date.parse('2026-09-13'))
  })
  it('null ohne oder mit unlesbarem Startdatum', () => {
    expect(weekEndMs(undefined)).toBeNull()
    expect(weekEndMs('kein-datum')).toBeNull()
  })
})

describe('tageZwischen', () => {
  it('zählt ganze Kalendertage, unabhängig von der Uhrzeit', () => {
    expect(tageZwischen(new Date(2026, 8, 7, 23, 59), new Date(2026, 8, 8, 0, 1))).toBe(1)
    expect(tageZwischen(new Date(2026, 8, 8), new Date(2026, 8, 7))).toBe(-1)
    expect(tageZwischen(new Date(2026, 8, 7, 6), new Date(2026, 8, 7, 20))).toBe(0)
  })
})

describe('montagNach', () => {
  it('zählt Wochen ab einem Montag — als ISO-Kennung', () => {
    expect(montagNach(MONTAG, 0)).toBe(MONTAG)
    expect(montagNach(MONTAG, 1)).toBe('2026-09-14')
    expect(montagNach(MONTAG, -1)).toBe('2026-08-31')
  })

  it('bleibt über Jahreswechsel und Sommerzeit ein Montag', () => {
    expect(montagNach('2026-12-28', 1)).toBe('2027-01-04')
    expect(montagNach('2026-03-23', 1)).toBe('2026-03-30')
    expect(montagNach('2026-10-19', 1)).toBe('2026-10-26')
  })
})

/**
 * **Der Termin einer fremdsprachigen Woche.**
 *
 * Bei einer Versammlung, die nicht auf Deutsch zusammenkommt, holt der Import
 * die Wochenseite in der Zielsprache — und schreibt deren Kopf in
 * `Meeting.date`: „7–13 de septiembre", „9月7–13日", „٧–١٣ سبتمبر". Die Rangfolge
 * in `meetingOffset`/`meetingDateText` fragt dieses Feld zuerst, und zwar über
 * einen Ausdruck mit **deutschen** Wochentagsnamen.
 *
 * Das geht auf, weil der Kopf einer Wochenseite gar keinen Wochentag nennt —
 * weder deutsch noch sonstwie. Die Regel greift also nicht, und gerechnet wird
 * aus `week.start` plus dem eingestellten Rhythmus; heraus kommt ein kanonisch
 * deutsches Datum, das die Anzeige übersetzt.
 *
 * Geprüft war das nie: Alle Fälle oben tragen einen deutschen Kopf. Ein
 * Ausdruck, der eines Tages auch fremdsprachige Wochentage kennt („Tuesday"),
 * bräche das — die Woche stünde dann auf dem Tag, den der **Kopf** nennt, statt
 * auf dem der Zusammenkunft.
 */
describe('meetingDateText bei fremdsprachiger Versammlung', () => {
  const KOEPFE: Array<[string, string]> = [
    ['spanisch', '7-13 de septiembre'],
    ['japanisch', '9月7–13日'],
    ['arabisch', '٧–١٣ سبتمبر'],
    ['griechisch', '7–13 Σεπτεμβρίου'],
    ['englisch', 'September 7–13'],
    ['ungarisch', 'szeptember 7–13.'],
  ]

  it.each(KOEPFE)('%s: der Termin wird gerechnet, nicht aus dem Kopf gelesen', (_name, kopf) => {
    const w = woche(MONTAG, kopf, kopf)
    expect(meetingDateText(w, 'mid', MEETINGS)).toBe('Dienstag, 8. September · 19:00')
    expect(meetingDateText(w, 'we', MEETINGS)).toBe('Sonntag, 13. September · 10:00')
  })

  it.each(KOEPFE)('%s: und der Versatz kommt aus den Einstellungen', (_name, kopf) => {
    const w = woche(MONTAG, kopf, kopf)
    expect(meetingOffset(w, 'mid', MEETINGS)).toBe(1) // Dienstag
    expect(meetingOffset(w, 'we', MEETINGS)).toBe(6) // Sonntag
  })

  it('eine Abweichung schlägt auch hier den Kopf', () => {
    // T30: Der Planer verlegt die Zusammenkunft. Der fremdsprachige Kopf nennt
    // ohnehin keinen Tag — aber die Rangfolge muss dieselbe bleiben.
    const w = woche(MONTAG, '7-13 de septiembre')
    w.dev = { mid: { wd: 4, time: '18:30' } }
    expect(meetingDateText(w, 'mid', MEETINGS)).toBe('Donnerstag, 10. September · 18:30')
  })

  it('ein verlegter Termin bleibt kanonisch deutsch, auch in einer spanischen Woche', () => {
    // Den rechnet die App selbst aus Kennung, Wochentag und Uhrzeit — deshalb
    // deutsch, ganz gleich, in welcher Sprache die Woche importiert wurde.
    const w = woche(MONTAG, '7.–13. September')
    w.dev = { mid: { wd: 6, time: '19:30' } }
    w.lang = 'es'
    expect(meetingDateText(w, 'mid', MEETINGS)).toBe('Samstag, 12. September · 19:30')
  })
})
