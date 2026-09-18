import { describe, expect, it } from 'vitest'
import { APP_LANGS, LOCALES } from '../i18n/langs'
import { deutschesDatum, versatzAbMontag, wdAusVersatz } from '../data/meeting-dates'
import { VERSAETZE, wochentagName } from './wochentage'
import type { Lang } from '../data/types'

/**
 * **Wochentage — eine Zahl, und ihre 34 Übersetzungen.**
 *
 * Dieses Modul war ungeprüft, obwohl beide Enden daran hängen:
 *
 *  - **Gespeichert** wird der Wochentag als **Zahl** (0 = Sonntag … 6 = Samstag,
 *    wie `Date#getDay()`): `MeetingTime.wd`, `Abweichung.wd`, `Termin.wd`,
 *    `FsRule.wd`. Bis zum 18. September 2026 war es der ausgeschriebene
 *    deutsche Name, und den führten *drei* Listen im Quelltext — `WOCHENTAGE`
 *    hier, `WEEKDAY_OFFSET` (Name → Index) in `meeting-dates.ts` und noch eine
 *    für `deutschesDatum`. Liefen sie auseinander, verschob sich ein Termin
 *    lautlos um einen Tag: Der Planer wählte „Mittwoch", gespeichert wurde ein
 *    Name, den der Leser nicht auflösen konnte — oder schlimmer: einen, den er
 *    auf den falschen Index auflöste.
 *  - **Angezeigt** wird über `Intl`. Das ist Absicht (34 Sprachen × 7 Tage =
 *    238 Übersetzungen, die es geschenkt gibt), verlagert die Prüfung aber auf
 *    die Frage, ob die Laufzeitumgebung für jede Sprache wirklich etwas
 *    Eigenes liefert. Kennt sie eine Locale nicht, fällt sie **still** auf
 *    Englisch zurück.
 *
 * Beides steht hier — die Umrechnung und die Anzeige in allen Sprachen.
 */

const CODES = APP_LANGS.map((l) => l.code)

describe('Die eine Zählung', () => {
  it('die Auswahl hat sieben Tage, Montag zuerst', () => {
    // Montag ist kein Geschmack, sondern die Definition der Programmwoche auf
    // jw.org (siehe `Week.start`). Ein anderer Anfang verschöbe jeden Versatz.
    expect(VERSAETZE).toHaveLength(7)
    expect(VERSAETZE[0]).toBe(0)
    expect(VERSAETZE[6]).toBe(6)
  })

  it('Wochentag und Versatz rechnen verlustfrei ineinander', () => {
    /*
      Die Gegenprobe zur Doppelung: Die Auswahlfelder stehen in Tagen ab Montag
      (dort ist der Montag die 0), gespeichert wird der Wochentag (dort ist der
      Sonntag die 0). Käme aus `wd → Versatz → wd` etwas anderes heraus, stünde
      der Termin am falschen Tag, ohne dass etwas bricht.
    */
    for (let wd = 0; wd < 7; wd++) {
      expect(wdAusVersatz(versatzAbMontag(wd)), `wd ${wd}`).toBe(wd)
    }
    // Und die beiden Ränder ausdrücklich: Sonntag ist die 0 und liegt hinten.
    expect(versatzAbMontag(0)).toBe(6)
    expect(versatzAbMontag(1)).toBe(0)
  })

  it('die Schreibweise in den Wochendaten passt dazu', () => {
    /*
      `deutschesDatum` baut den kanonischen **Anzeigetext** der Wochendaten
      („Dienstag, 8. September") aus einer eigenen Liste in `meeting-dates.ts`.
      Sie darf dort stehen — es ist Text, der angezeigt und nie zurückgelesen
      wird. Geprüft wird deshalb nicht die Liste, sondern ihr Ergebnis: Der
      7. September 2026 ist ein Montag.
    */
    const montag = new Date(2026, 8, 7)
    for (let i = 0; i < 7; i++) {
      const tag = new Date(2026, 8, 7 + i)
      const name = wochentagName(i, 'de')
      expect(deutschesDatum(tag).startsWith(`${name}, `), name).toBe(true)
    }
    expect(deutschesDatum(montag)).toBe('Montag, 7. September')
  })
})

describe('wochentagName in jeder App-Sprache', () => {
  it.each(CODES)('%s: sieben verschiedene Namen, keiner leer', (code) => {
    const namen = VERSAETZE.map((i) => wochentagName(i, code))
    expect(namen.filter(Boolean), code).toHaveLength(7)
    // Sieben verschiedene: Lieferte Intl für die Locale nichts Brauchbares,
    // stünde hier siebenmal dasselbe — oder ein leeres Feld im Auswahlfeld.
    expect(new Set(namen).size, `${code}: ${namen.join(', ')}`).toBe(7)
  })

  it.each(CODES.filter((c) => c !== 'de'))('%s: nicht die deutschen Namen', (code) => {
    // Der stille Rückfall ist die eigentliche Gefahr: Eine unbekannte Locale
    // wirft nicht, sie liefert die Namen der Umgebungssprache. Im Auswahlfeld
    // stünde dann „Montag" — in einer koreanischen Oberfläche.
    const namen = VERSAETZE.map((i) => wochentagName(i, code))
    expect(namen, code).not.toEqual(VERSAETZE.map((i) => wochentagName(i, 'de')))
  })

  it.each(CODES)('%s: der Versatz zeigt auf denselben Tag wie Intl', (code) => {
    /*
      Der Bezugspunkt im Modul ist der 5. Januar 2026 („ist ein Montag"). Wäre
      er es nicht, wären alle sieben Namen um denselben Betrag verschoben —
      lauter gültige Wochentage, nur eben die falschen. Ein Test, der bloß
      „sieben verschiedene" prüft, sähe das nicht.
    */
    const locale = LOCALES[code as Lang]
    for (let i = 0; i < 7; i++) {
      const erwartet = new Date(2026, 0, 5 + i).toLocaleDateString(locale, { weekday: 'long' })
      expect(wochentagName(i, code), `${code} · Versatz ${i}`).toBe(erwartet)
    }
  })

  it('ein unbekanntes Sprachkürzel wirft nicht', () => {
    // `wochentagName` nimmt `string`, nicht `Lang` — der Aufrufer reicht
    // `state.lang` durch, und der kam schon einmal aus dem Debug-Hash.
    expect(() => wochentagName(0, 'gibt-es-nicht')).not.toThrow()
    expect(wochentagName(0, 'gibt-es-nicht')).not.toBe('')
  })

  it('ein Versatz außerhalb der Woche ergibt trotzdem einen Wochentag', () => {
    // Die Datenbank hält `wd` zwischen 0 und 6 (`check`), aber ein
    // Anzeige-Versatz kommt auch aus gerechneten Werten — die Zeile soll daran
    // nicht zerbrechen.
    expect(() => wochentagName(9, 'de')).not.toThrow()
    expect(wochentagName(9, 'de')).toBe('Mittwoch') // 5. Januar + 9 Tage
  })
})

describe('Rechts-nach-links und ostasiatische Schriften', () => {
  it('arabisch, hebräisch, persisch und urdu liefern ihre eigenen Namen', () => {
    // Diese vier laufen zusätzlich durch das gespiegelte Layout (`isRTL`).
    // Käme dort ein lateinischer Name an, fiele es im Auswahlfeld sofort auf —
    // im Test bisher nicht.
    for (const code of ['ar', 'he', 'fa', 'ur'] as const) {
      const montag = wochentagName(0, code)
      expect(montag, code).not.toMatch(/^[A-Za-z]/)
    }
  })

  it('chinesisch, japanisch und koreanisch ebenso', () => {
    for (const code of ['zh', 'ja', 'ko'] as const) {
      expect(wochentagName(0, code), code).not.toMatch(/^[A-Za-z]/)
    }
  })
})
