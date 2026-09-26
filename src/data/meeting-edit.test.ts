import { describe, expect, it } from 'vitest'
import { buildDemoWeeks } from './testdaten'
import {
  editTalkTheme,
  endeAusStartzeit,
  endenNachziehen,
  lacAdd,
  lacMinuten,
  lacMove,
  lacRemove,
  MEETING_MINUTES,
  setClosingSong,
  setOpeningSong,
  togglePartner,
} from './meeting-edit'
import type { Week } from './types'

describe('endeAusStartzeit — Endzeit aus den Zusammenkunftszeiten', () => {
  // Der Import trug feste Werte ein (20:45 / 11:45), unabhängig von den
  // gepflegten Zeiten. Bei einem Beginn um 18:30 stand damit auf jedem
  // Programmblatt eine falsche Endzeit.
  it('rechnet Startzeit + Regeldauer', () => {
    expect(endeAusStartzeit('19:00', 'X')).toBe('Ende ca. 20:45')
    expect(endeAusStartzeit('10:00', 'X')).toBe('Ende ca. 11:45')
    expect(endeAusStartzeit('18:30', 'X')).toBe('Ende ca. 20:15')
  })

  it('bestätigt die bisherigen Festwerte — 1:45 je Zusammenkunft', () => {
    expect(MEETING_MINUTES).toBe(105)
  })

  it('ohne hinterlegte Startzeit bleibt der mitgebrachte Wert', () => {
    expect(endeAusStartzeit('', 'Ende ca. 20:45')).toBe('Ende ca. 20:45')
    expect(endeAusStartzeit('abends', 'Ende ca. 20:45')).toBe('Ende ca. 20:45')
  })
})

describe('endenNachziehen — Endzeiten folgen einer Zeitumstellung', () => {
  // `end` steht in den Wochendaten und wurde nur beim Import gerechnet; die
  // Startzeit holt die Anzeige dagegen jedes Mal frisch aus den Einstellungen.
  // Ohne Nachziehen zeigte der Programmkopf nach einer Umstellung 18:30 und
  // die Fußzeile weiter „Ende ca. 20:45" — 2:15 auf dem Blatt.
  /**
   * Wochen, wie der jw.org-Import sie anlegt: im `date`-Feld steht die
   * Überschrift der Seite, ohne Wochentag und ohne Uhrzeit. Nur für die kommt
   * die Startzeit aus den Einstellungen — und nur bei denen klaffte es.
   */
  function importierteWochen(): Week[] {
    const weeks = buildDemoWeeks().slice(0, 2)
    for (const week of weeks) {
      week.mid.date = '7.–13. September'
      week.we.date = '7.–13. September'
      week.mid.end = 'Ende ca. 20:45'
      week.we.end = 'Ende ca. 11:45'
    }
    return weeks
  }

  it('verschiebt beide Zusammenkünfte um ihre eigene Differenz', () => {
    const next = endenNachziehen(importierteWochen(), { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '09:30' } })
    expect(next[0].mid.end).toBe('Ende ca. 20:15')
    expect(next[0].we.end).toBe('Ende ca. 11:15')
    expect(next[1].mid.end).toBe('Ende ca. 20:15') // alle geladenen Wochen
  })

  it('rührt die andere Zusammenkunft nicht an', () => {
    const next = endenNachziehen(importierteWochen(), { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '10:00' } })
    expect(next[0].mid.end).toBe('Ende ca. 20:15')
    expect(next[0].we.end).toBe('Ende ca. 11:45') // unverändert
  })

  it('verschiebt, statt neu zu rechnen — die Anpassung des Planers bleibt', () => {
    // Der Planer hat die LAC-Minuten geändert, `shiftEnd` hat das Ende um 10
    // Minuten versetzt (20:55 statt 20:45). Eine Zeitumstellung darf diese
    // Anpassung nicht verwerfen: 20:55 − 30 min = 20:25, nicht 18:30 + 105.
    const weeks = importierteWochen()
    weeks[0].mid.end = 'Ende ca. 20:55'
    const next = endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '10:00' } })
    expect(next[0].mid.end).toBe('Ende ca. 20:25')
  })

  it('lässt Zusammenkünfte mit eigener Uhrzeit unberührt', () => {
    // Eine Abweichung (T30) bestimmt auch den Anfang (`meetingTime`), der
    // Rhythmus bleibt außen vor. Dann bewegt sich das Ende nicht.
    //
    // Die eigene Uhrzeit stand bis zum 18.9.2026 als **Text** im `date`-Feld
    // („Dienstag, 8. September · 19:45") und wurde von dort zurückgelesen; seit
    // T30 sagt eine `Abweichung` dasselbe als Wert.
    const weeks = importierteWochen()
    weeks[0].dev = { mid: { time: '19:45' } }
    weeks[0].mid.end = 'Ende ca. 21:30'
    const next = endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '10:00' } })
    expect(next[0].mid.end).toBe('Ende ca. 21:30') // unverändert
    expect(next[1].mid.end).toBe('Ende ca. 20:15') // mitgezogen
  })

  it('eine unberührte Woche behält ihre Referenz', () => {
    /*
      „Unberührt" muss man **sehen** können: `persist.ts` entscheidet an der
      Referenz, welche Woche es zu schreiben gibt. Hier stand ein `{ ...week }`
      vor der Schleife — jede Woche bekam damit eine neue Hülle, auch die, an
      der nichts zu verschieben war. Eine Gedächtnismahl-Woche ging so bei
      jeder Zeitumstellung an die Datenbank; hatte dort inzwischen ein anderer
      Planer geschrieben, meldete der Stand-Vergleich einen Konflikt für eine
      Woche, die niemand angefasst hatte.

      Der Test daneben („dasselbe Array") prüft nur den Fall, dass gar nichts
      geschieht. Dieser hier prüft den, der im Betrieb vorkommt: es geschieht
      etwas — nur nicht überall.
    */
    const weeks = importierteWochen()
    weeks[0]!.dev = { mid: { time: '19:45' }, we: { time: '10:30' } } // eigene Termine
    const next = endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '18:30' }, we: { wd: 0, time: '09:30' } })
    expect(next[0]).toBe(weeks[0]) // keine der beiden Zusammenkünfte betroffen
    expect(next[1]).not.toBe(weeks[1]) // diese schon
  })

  it('gibt bei unveränderter Zeit dasselbe Array zurück', () => {
    // Identität, damit React nicht ohne Grund neu rendert und die Persistenz
    // nicht 52 unveränderte Wochen schreibt.
    const weeks = importierteWochen()
    expect(endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } })).toBe(weeks)
    // Nur der Wochentag ändert sich — die Uhrzeit bleibt, das Ende auch.
    expect(endenNachziehen(weeks, { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }, { mid: { wd: 3, time: '19:00' }, we: { wd: 0, time: '10:00' } })).toBe(weeks)
  })

  /*
   * Hier stand: „ohne erkennbare Uhrzeit bleibt alles stehen" — mit dem Eingang
   * „Di abends · So 10:00". Beide Seiten waren Anzeigetexte, aus denen die
   * Uhrzeiten der Stellung nach gelesen wurden; fehlte in einem eine, rutschte
   * die Zuordnung, und die Verschiebung lag um Stunden daneben. Der Fall ist
   * mit den Werten (`MeetingTimes`) verschwunden, nicht bloß abgestellt: Eine
   * unlesbare Uhrzeit lässt sich nicht mehr übergeben.
   */
})

/*
 * Jede Bearbeitungsfunktion läuft die Kette Woche → Zusammenkunft → Abschnitt →
 * Punkt ab. Zeigt ein Index ins Leere — Lücke im geladenen Fenster (T35), ein
 * Abschnitt, den diese Woche nicht hat (die Kreisaufseher-Woche baut sie um,
 * T62) —, warf der Zugriff bis dahin. Diese Funktionen laufen aus dem Reducer;
 * ein Wurf dort reißt die Ansicht mit. Sie geben jetzt die Wochen unverändert
 * zurück (T42): dieselbe Antwort wie auf jede andere unmögliche Bearbeitung.
 */
describe('Bearbeitung mit einem Index, den es nicht gibt', () => {
  const WEIT_DRAUSSEN = 99
  const w = (): Week[] => buildDemoWeeks()

  it('lacMinuten: fehlende Woche, fehlender Abschnitt, fehlender Punkt', () => {
    const weeks = w()
    expect(lacMinuten(weeks, WEIT_DRAUSSEN, 'mid', 0, 0, 20)).toBe(weeks)
    expect(lacMinuten(weeks, 0, 'mid', WEIT_DRAUSSEN, 0, 20)).toBe(weeks)
    expect(lacMinuten(weeks, 0, 'mid', 0, WEIT_DRAUSSEN, 20)).toBe(weeks)
  })

  it('lacRemove: fehlende Woche, fehlender Abschnitt, fehlender Punkt', () => {
    const weeks = w()
    expect(lacRemove(weeks, WEIT_DRAUSSEN, 'mid', 0, 0)).toBe(weeks)
    expect(lacRemove(weeks, 0, 'mid', WEIT_DRAUSSEN, 0)).toBe(weeks)
    expect(lacRemove(weeks, 0, 'mid', 0, WEIT_DRAUSSEN)).toBe(weeks)
  })

  it('lacMove und lacAdd: fehlende Woche, fehlender Abschnitt', () => {
    const weeks = w()
    expect(lacMove(weeks, WEIT_DRAUSSEN, 'mid', 0, 0, 1)).toBe(weeks)
    expect(lacMove(weeks, 0, 'mid', WEIT_DRAUSSEN, 0, 1)).toBe(weeks)
    expect(lacAdd(weeks, WEIT_DRAUSSEN, 'mid', 0, 'Neu')).toBe(weeks)
    expect(lacAdd(weeks, 0, 'mid', WEIT_DRAUSSEN, 'Neu')).toBe(weeks)
  })

  it('togglePartner auf eine Woche, die es nicht gibt', () => {
    const weeks = w()
    expect(togglePartner(weeks, WEIT_DRAUSSEN, 'mid', 0, 0)).toBe(weeks)
  })

  it('editTalkTheme und die Lieder auf eine Woche, die es nicht gibt', () => {
    const weeks = w()
    expect(editTalkTheme(weeks, WEIT_DRAUSSEN, 0, 0, 'Thema')).toBe(weeks)
    expect(setOpeningSong(weeks, WEIT_DRAUSSEN, '78')).toBe(weeks)
    expect(setClosingSong(weeks, WEIT_DRAUSSEN, '78')).toBe(weeks)
  })

  it('die vorhandene Stelle bleibt bearbeitbar — die Prüfung sperrt nichts zu', () => {
    // Gegenprobe zur Gegenprobe: sonst wären alle Tests oben auch grün, wenn
    // die Funktionen gar nichts mehr täten.
    const weeks = w()
    expect(setOpeningSong(weeks, 0, '78')).not.toBe(weeks)
    expect(togglePartner(weeks, 0, 'mid', 1, 1)).not.toBe(weeks)
  })

  it('eine Liednummer in fremden Ziffern wird gespeichert, nicht verworfen', () => {
    // Eine arabische oder persische Zifferntastatur liefert „٢٥" bzw. „۲۵".
    // Gespeichert wird westlich, wie der ganze kanonische Titel.
    const weeks = w()
    const westlich = setOpeningSong(weeks, 0, '25')[0]!.we
    expect(westlich).not.toEqual(weeks[0]!.we)
    expect(setOpeningSong(weeks, 0, '٢٥')[0]!.we).toEqual(westlich)
    expect(setOpeningSong(weeks, 0, '۲۵')[0]!.we).toEqual(westlich)
  })
})
