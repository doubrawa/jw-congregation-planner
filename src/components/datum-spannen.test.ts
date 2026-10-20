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
