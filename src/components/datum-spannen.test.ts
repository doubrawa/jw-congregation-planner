import { describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { NBSP } from '../i18n/zahl-binden'
import { tageSpanne, wochenSpanne, zeitspanne } from './datum-anzeige'
import { zeitleisteDatum } from './zeitleiste-gemeinsam'

/**
 * **Zahl und Wort einer Spanne bleiben zusammen** (T128).
 *
 * In den übersetzten Texten bindet `fill`. Die Spannen aus `Intl` standen
 * daneben ungebunden da — und brachen bei großer Schrift: „5–11|octobre" in
 * den Wochenkarten, „So., 4.|Oktober" bei den Abwesenheiten im Profil,
 * „12|miesięcy" in der Wahl der Auswertung.
 */

const CODES = APP_LANGS.map((l) => l.code)
/** Ein Leerzeichen zwischen einer Ziffer (jeder Schrift) und einem Wort — dort bräche die Zeile. */
const LUECKE = /\p{Nd}\.? (?=\p{L})/u

describe('Spannen und Zeiträume', () => {
  it.each(CODES)('%s: kein Umbruch zwischen Zahl und Wort', (code) => {
    for (const text of [
      wochenSpanne('2026-10-05', code),
      tageSpanne('2026-10-04', '2026-10-04', code, 'kurzerWochentag'),
      tageSpanne('2026-10-04', '2026-10-11', code, 'kurzerWochentag'),
      zeitspanne(1, 'day', code),
      zeitspanne(20, 'week', code),
      zeitspanne(12, 'month', code),
      // Die Zeitleiste einer Person: „воскресенье, 20 |сентября" brach bei 320 px.
      zeitleisteDatum(new Date(2026, 8, 20), code, '10:00'),
    ]) {
      expect(text, `${code}: ${text}`).not.toMatch(LUECKE)
    }
  })

  it('auf Deutsch: „5.–11. Oktober", „So., 4. Oktober", „12 Monate"', () => {
    expect(wochenSpanne('2026-10-05', 'de')).toBe(`5.–11.${NBSP}Oktober`)
    expect(tageSpanne('2026-10-04', '2026-10-04', 'de', 'kurzerWochentag')).toBe(`So., 4.${NBSP}Oktober`)
    expect(zeitspanne(12, 'month', 'de')).toBe(`12${NBSP}Monate`)
  })

  it('auf Polnisch: „12 miesięcy" — brach in der Wahl der Auswertung „12|miesięcy"', () => {
    expect(zeitspanne(12, 'month', 'pl')).toBe(`12${NBSP}miesięcy`)
  })
})

/**
 * **Italienisch ohne führende Null, wie jw.org** („2-8 novembre").
 *
 * ICU setzt in italienische Spannen zweistellige Tage, obwohl `day: 'numeric'`
 * verlangt ist. Die übersetzten Wochenköpfe nahmen die Null längst weg; die
 * Spannen, die der Client selbst baut (Holen-Karten, Gruppenbesuche, Trolleys,
 * Abwesenheiten, Pläne), zeigten „02–08 novembre".
 */
describe('Spannen auf Italienisch', () => {
  /** Gebundene und schmale Leerzeichen (`zahlBinden`, `formatRange`) als gewöhnliche. */
  const ohneBindung = (s: string) => s.replace(/\s/gu, ' ')

  it('Voraussetzung: Intl selbst setzt hier die Null — sonst prüfte der Test nichts', () => {
    const roh = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'long' }).formatRange(new Date(2026, 10, 2), new Date(2026, 10, 8))
    expect(roh).toMatch(/^02/)
  })

  it('die Woche im Monat: „2–8 novembre", über den Monatswechsel „30 novembre – 6 dicembre"', () => {
    expect(ohneBindung(wochenSpanne('2026-11-02', 'it'))).toBe('2–8 novembre')
    expect(ohneBindung(wochenSpanne('2026-11-30', 'it'))).toBe('30 novembre – 6 dicembre')
  })

  it('Zeiträume mit Jahr und Wochentag verlieren die Null am Tag, das Jahr behält seine', () => {
    expect(ohneBindung(tageSpanne('2026-12-28', '2027-01-03', 'it', 'tagMonatJahr'))).toBe('28 dicembre 2026 – 3 gennaio 2027')
    expect(ohneBindung(tageSpanne('2026-11-02', '2026-11-08', 'it', 'kurzerWochentag'))).toBe('lun 2 – dom 8 novembre')
  })

  it('Gegenprobe: zweistellige Tage und andere Sprachen bleiben, wie Intl sie schreibt', () => {
    expect(ohneBindung(wochenSpanne('2026-11-09', 'it'))).toBe('9–15 novembre')
    expect(ohneBindung(wochenSpanne('2026-11-16', 'it'))).toBe('16–22 novembre')
    expect(ohneBindung(wochenSpanne('2026-11-02', 'de'))).toBe('2.–8. November')
    expect(ohneBindung(wochenSpanne('2026-11-02', 'fr'))).toBe('2–8 novembre')
  })
})
