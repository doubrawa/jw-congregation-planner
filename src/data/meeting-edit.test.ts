import { describe, expect, it } from 'vitest'
import { buildDemoWeeks } from './demo'
import { endeAusStartzeit, endenNachziehen, MEETING_MINUTES } from './meeting-edit'
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
    const next = endenNachziehen(importierteWochen(), 'Di 19:00 · So 10:00', 'Di 18:30 · So 09:30')
    expect(next[0].mid.end).toBe('Ende ca. 20:15')
    expect(next[0].we.end).toBe('Ende ca. 11:15')
    expect(next[1].mid.end).toBe('Ende ca. 20:15') // alle geladenen Wochen
  })

  it('rührt die andere Zusammenkunft nicht an', () => {
    const next = endenNachziehen(importierteWochen(), 'Di 19:00 · So 10:00', 'Di 18:30 · So 10:00')
    expect(next[0].mid.end).toBe('Ende ca. 20:15')
    expect(next[0].we.end).toBe('Ende ca. 11:45') // unverändert
  })

  it('verschiebt, statt neu zu rechnen — die Anpassung des Planers bleibt', () => {
    // Der Planer hat die LAC-Minuten geändert, `shiftEnd` hat das Ende um 10
    // Minuten versetzt (20:55 statt 20:45). Eine Zeitumstellung darf diese
    // Anpassung nicht verwerfen: 20:55 − 30 min = 20:25, nicht 18:30 + 105.
    const weeks = importierteWochen()
    weeks[0].mid.end = 'Ende ca. 20:55'
    const next = endenNachziehen(weeks, 'Di 19:00 · So 10:00', 'Di 18:30 · So 10:00')
    expect(next[0].mid.end).toBe('Ende ca. 20:25')
  })

  it('lässt Wochen mit eigener Uhrzeit im Termin unberührt', () => {
    // Gedächtnismahl, Sondertermine — und ebenso Demo-/Altwochen: steht im
    // `date`-Feld eine Uhrzeit, bestimmt sie auch den Anfang (meetingTime),
    // die Einstellungen bleiben außen vor. Dann bewegt sich das Ende nicht.
    const weeks = importierteWochen()
    weeks[0].mid.date = 'Dienstag, 8. September · 19:45'
    weeks[0].mid.end = 'Ende ca. 21:30'
    const next = endenNachziehen(weeks, 'Di 19:00 · So 10:00', 'Di 18:30 · So 10:00')
    expect(next[0].mid.end).toBe('Ende ca. 21:30') // unverändert
    expect(next[1].mid.end).toBe('Ende ca. 20:15') // mitgezogen
  })

  it('gibt bei unveränderter Zeit dasselbe Array zurück', () => {
    // Identität, damit React nicht ohne Grund neu rendert und die Persistenz
    // nicht 52 unveränderte Wochen schreibt.
    const weeks = importierteWochen()
    expect(endenNachziehen(weeks, 'Di 19:00 · So 10:00', 'Di 19:00 · So 10:00')).toBe(weeks)
    // Nur der Wochentag ändert sich — die Uhrzeit bleibt, das Ende auch.
    expect(endenNachziehen(weeks, 'Di 19:00 · So 10:00', 'Mi 19:00 · So 10:00')).toBe(weeks)
  })

  it('ohne erkennbare Uhrzeit bleibt alles stehen', () => {
    const weeks = importierteWochen()
    expect(endenNachziehen(weeks, 'Di abends · So 10:00', 'Di 18:30 · So 10:00')).toBe(weeks)
  })
})
