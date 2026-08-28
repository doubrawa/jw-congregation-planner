import { describe, expect, it } from 'vitest'
import { APP_LANGS, LOCALES } from '../i18n/langs'
import { WEEKDAY_OFFSET, deutschesDatum } from '../data/meeting-dates'
import { WOCHENTAGE, wochentagName } from './wochentage'
import type { Lang } from '../data/types'

/**
 * **Wochentage — die eine Liste, die alle meinen, und ihre 34 Übersetzungen.**
 *
 * Dieses Modul war ungeprüft, obwohl beide Enden daran hängen:
 *
 *  - **Gespeichert** wird kanonisch deutsch („Montag"), und zwar an *drei*
 *    Stellen im Quelltext: `WOCHENTAGE` hier, `WEEKDAY_OFFSET` (Name → Index)
 *    in `meeting-dates.ts` und noch einmal eine Liste für `deutschesDatum`.
 *    Laufen sie auseinander, verschiebt sich ein Termin lautlos um einen Tag:
 *    Der Planer wählt „Mittwoch", gespeichert wird ein Name, den der Leser
 *    nicht auflösen kann — oder schlimmer: einen, den er auf den falschen Index
 *    auflöst.
 *  - **Angezeigt** wird über `Intl`. Das ist Absicht (34 Sprachen × 7 Tage =
 *    238 Übersetzungen, die es geschenkt gibt), verlagert die Prüfung aber auf
 *    die Frage, ob die Laufzeitumgebung für jede Sprache wirklich etwas
 *    Eigenes liefert. Kennt sie eine Locale nicht, fällt sie **still** auf
 *    Englisch zurück.
 *
 * Beides steht hier — die Struktur und die Anzeige in allen Sprachen.
 */

const CODES = APP_LANGS.map((l) => l.code)

describe('Die deutsche Liste ist überall dieselbe', () => {
  it('WOCHENTAGE hat sieben Tage, Montag zuerst', () => {
    // Montag ist kein Geschmack, sondern die Definition der Programmwoche auf
    // jw.org (siehe `Week.start`). Ein anderer Anfang verschöbe jeden Versatz.
    expect(WOCHENTAGE).toHaveLength(7)
    expect(WOCHENTAGE[0]).toBe('Montag')
    expect(WOCHENTAGE[6]).toBe('Sonntag')
  })

  it('WEEKDAY_OFFSET löst jeden Namen auf denselben Index auf', () => {
    /*
      Die Gegenprobe zur Doppelung: `TerminePanel` speichert `WOCHENTAGE[i]`
      und `TerminListe` liest daraus wieder `WEEKDAY_OFFSET[name]`. Fehlte dort
      ein Name oder stünde er an anderer Stelle, käme aus `i` ein anderes `i`
      zurück — und der Termin stünde am falschen Tag, ohne dass etwas bricht.
    */
    WOCHENTAGE.forEach((tag, i) => {
      expect(WEEKDAY_OFFSET[tag], tag).toBe(i)
    })
  })

  it('auch die Schreibweise in den Wochendaten passt dazu', () => {
    /*
      `deutschesDatum` baut den kanonischen Text der Wochendaten („Dienstag,
      8. September") aus einer **eigenen** Liste in `meeting-dates.ts`. Sie ist
      die dritte Kopie derselben sieben Wörter. Geprüft wird deshalb nicht die
      Liste, sondern ihr Ergebnis: Der 7. September 2026 ist ein Montag.
    */
    const montag = new Date(2026, 8, 7)
    for (let i = 0; i < 7; i++) {
      const tag = new Date(2026, 8, 7 + i)
      expect(deutschesDatum(tag).startsWith(`${WOCHENTAGE[i]}, `), WOCHENTAGE[i]).toBe(true)
    }
    expect(deutschesDatum(montag)).toBe('Montag, 7. September')
  })
})

describe('wochentagName in jeder App-Sprache', () => {
  it.each(CODES)('%s: sieben verschiedene Namen, keiner leer', (code) => {
    const namen = WOCHENTAGE.map((_t, i) => wochentagName(i, code))
    expect(namen.filter(Boolean), code).toHaveLength(7)
    // Sieben verschiedene: Lieferte Intl für die Locale nichts Brauchbares,
    // stünde hier siebenmal dasselbe — oder ein leeres Feld im Auswahlfeld.
    expect(new Set(namen).size, `${code}: ${namen.join(', ')}`).toBe(7)
  })

  it.each(CODES.filter((c) => c !== 'de'))('%s: nicht die deutschen Namen', (code) => {
    // Der stille Rückfall ist die eigentliche Gefahr: Eine unbekannte Locale
    // wirft nicht, sie liefert die Namen der Umgebungssprache. Im Auswahlfeld
    // stünde dann „Montag" — in einer koreanischen Oberfläche.
    const namen = WOCHENTAGE.map((_t, i) => wochentagName(i, code))
    expect(namen, code).not.toEqual(WOCHENTAGE)
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
    // `WEEKDAY_OFFSET` kennt „Sonnabend" als 5 — mehr Werte gibt es nicht. Ein
    // Datensatz mit einem anderen Wert soll die Zeile nicht sprengen.
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
