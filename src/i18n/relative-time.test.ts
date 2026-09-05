import { describe, expect, it } from 'vitest'
import { APP_LANGS, LOCALES } from './langs'
import { istVorbei } from '../data/meeting-dates'
import { relativeDayLabel, relativeWeekLabel } from './relative-time'

// Fester „Jetzt"-Zeitpunkt, damit die Tage-Differenz deterministisch ist.
const NOW = Date.parse('2026-09-07') // Montag, 00:00 UTC
const day = 864e5

describe('relativeDayLabel', () => {
  it('formatiert künftige Tage in der App-Sprache', () => {
    expect(relativeDayLabel(NOW + 4 * day, 'de', NOW)).toBe('in 4 Tagen')
    expect(relativeDayLabel(NOW + 4 * day, 'en', NOW)).toBe('in 4 days')
  })

  it('nutzt "morgen"/"heute" statt "in 1 Tagen" (numeric: auto, korrekt)', () => {
    expect(relativeDayLabel(NOW + 1 * day, 'de', NOW)).toBe('morgen')
    expect(relativeDayLabel(NOW, 'de', NOW)).toBe('heute')
    expect(relativeDayLabel(NOW + 1 * day, 'en', NOW)).toBe('tomorrow')
  })

  it('zählt ganze Kalendertage, unabhängig von der Uhrzeit', () => {
    // "Jetzt" mittags, Ziel am nächsten Kalendertag früh → trotzdem "morgen".
    const noon = Date.parse('2026-09-07T12:00:00Z')
    const nextMorning = Date.parse('2026-09-08T06:00:00Z')
    expect(relativeDayLabel(nextMorning, 'de', noon)).toBe('morgen')
  })

  it('vergangene Aufgaben → "vor N Tagen"', () => {
    expect(relativeDayLabel(NOW - 3 * day, 'de', NOW)).toBe('vor 3 Tagen')
  })

  /*
    **„Heute" ist ein örtlicher Begriff.**

    Ein Termin ist ein Kalendertag und liegt als UTC-Mitternacht vor
    (`meetingDateMs`). „Jetzt" war dagegen ein Zeitpunkt, und der Tag daraus
    wurde ebenfalls in UTC genommen — zwischen Mitternacht und 01:00 bzw. 02:00
    ist das in Mitteleuropa noch der gestrige. Der Countdown zählte dann einen
    Tag zu viel: Wer am Dienstagmorgen um halb eins nachsah, las über seiner
    Aufgabe „morgen" — für die Zusammenkunft an diesem Abend.

    Die Uhrzeiten stehen hier bewusst als **örtliche** Zeit (`new Date(j, m, t,
    …)`), nicht als UTC-Zeichenkette: Nur so prüft der Fall dasselbe, egal in
    welcher Zeitzone die Prüfung läuft. Die Fälle darüber liegen alle auf
    UTC-Mitternacht und können den Unterschied gar nicht sehen.
  */
  const TERMIN = Date.UTC(2026, 8, 8) // Dienstag, 8. September 2026

  it('am Zusammenkunftstag um 00:30 Ortszeit heißt es „heute"', () => {
    const jetzt = new Date(2026, 8, 8, 0, 30).getTime()
    expect(relativeDayLabel(TERMIN, 'de', jetzt)).toBe('heute')
    // Und die zweite Auskunft über denselben Tag sagt dasselbe.
    expect(istVorbei(TERMIN, new Date(jetzt))).toBe(false)
  })

  it('am Vorabend um 23:30 Ortszeit heißt es „morgen"', () => {
    const jetzt = new Date(2026, 8, 7, 23, 30).getTime()
    expect(relativeDayLabel(TERMIN, 'de', jetzt)).toBe('morgen')
  })

  it('vier Tage vorher um 00:30 Ortszeit sind es vier, nicht fünf', () => {
    const jetzt = new Date(2026, 8, 4, 0, 30).getTime()
    expect(relativeDayLabel(TERMIN, 'de', jetzt)).toBe('in 4 Tagen')
  })

  it('am Tag danach um 00:30 Ortszeit ist er vorbei — beide Auskünfte einig', () => {
    const jetzt = new Date(2026, 8, 9, 0, 30).getTime()
    expect(relativeDayLabel(TERMIN, 'de', jetzt)).toBe('gestern')
    expect(istVorbei(TERMIN, new Date(jetzt))).toBe(true)
  })

  it('kein Zeitpunkt → leerer Chip', () => {
    expect(relativeDayLabel(null, 'de', NOW)).toBe('')
    expect(relativeDayLabel(undefined, 'de', NOW)).toBe('')
  })
})

describe('relativeWeekLabel', () => {
  it('formatiert den Wochenversatz in der App-Sprache', () => {
    expect(relativeWeekLabel(0, 'de')).toBe('diese Woche')
    expect(relativeWeekLabel(1, 'de')).toBe('nächste Woche')
    expect(relativeWeekLabel(-1, 'de')).toBe('letzte Woche')
    expect(relativeWeekLabel(2, 'de')).toBe('in 2 Wochen')
    expect(relativeWeekLabel(-2, 'de')).toBe('vor 2 Wochen')
  })

  it('nutzt die jeweilige Locale', () => {
    expect(relativeWeekLabel(1, 'en')).toBe('next week')
    expect(relativeWeekLabel(-2, 'en')).toBe('2 weeks ago')
  })
})

/**
 * **Ein Sprach-Tag, das die Laufzeitumgebung nicht kennt.**
 *
 * `Intl.RelativeTimeFormat` wirft dann — und der Wurf entstünde mitten im
 * Rendern des Dashboards bzw. der Aufgabenliste, also dort, wo die App
 * anschließend weiß bleibt. Beide Funktionen fangen ihn deshalb ab und liefern
 * lieber gar keinen Chip als einen kaputten. Geprüft mit einem Tag, das kein
 * gültiges BCP-47 ist; die 34 echten App-Sprachen laufen darüber hinweg.
 */
describe('Unbekannte Sprache: lieber kein Chip als ein Absturz', () => {
  const kaputt = 'x' as never

  it('relativeDayLabel bleibt leer, statt zu werfen', () => {
    expect(() => relativeDayLabel(NOW + day, kaputt, NOW)).not.toThrow()
    expect(relativeDayLabel(NOW + day, kaputt, NOW)).toBe('')
  })

  it('relativeWeekLabel ebenso', () => {
    expect(() => relativeWeekLabel(1, kaputt)).not.toThrow()
    expect(relativeWeekLabel(1, kaputt)).toBe('')
  })

  it('die echten App-Sprachen liefern sehr wohl etwas — sonst prüfte das hier nichts', () => {
    expect(relativeDayLabel(NOW + day, 'de', NOW)).not.toBe('')
    expect(relativeWeekLabel(1, 'de')).not.toBe('')
  })
})

/**
 * **Und jetzt alle 34 — nicht nur Deutsch und Englisch.**
 *
 * Die Prüfungen oben messen zwei Sprachen und schließen von ihnen auf den Rest.
 * Genau dieser Schluss ist hier schon einmal danebengegangen: Die Glocke
 * (`i18n/zeit.ts`) baute ihre Zeitangaben aus einer Liste fertiger Sätze, und
 * weil `vor 2 Std.` in den Testdaten vorkam, stand ausgerechnet diese eine
 * Form übersetzt da — jede andere Stundenzahl blieb in 33 Sprachen deutsch.
 * `zeit.test.ts` prüft seither jede Sprache; dieselbe Prüfung fehlte für den
 * Countdown der Aufgaben und für das Wochen-Label.
 *
 * Der Chip ist keine Nebensache: An ihm steht, ob eine Aufgabe „heute" oder
 * „in 4 Tagen" ansteht. Ein deutscher Chip in einer koreanischen Oberfläche ist
 * unbrauchbar; ein **leerer** wäre es auch, und leer wird er genau dann, wenn
 * `Intl` die Locale nicht kennt (dort fängt der Code ab, statt zu werfen).
 */
describe('Jede App-Sprache bekommt ihren eigenen Chip', () => {
  const FREMD = APP_LANGS.map((l) => l.code).filter((c) => c !== 'de')

  /**
   * Gemessen wird die **ganze Reihe**, nicht die einzelne Form.
   *
   * Einzeln verglichen gäbe es falsche Treffer: Niederländisch sagt zu „morgen"
   * tatsächlich „morgen", Dänisch und Norwegisch schreiben „Gruppe" wie das
   * Deutsche. Ein stiller Rückfall sieht anders aus — dann stimmt **jede** Form
   * überein. Geprüft wird deshalb: nichts ist leer, und die Reihe als Ganzes
   * unterscheidet sich.
   */
  const gleich = (a: string[], b: string[]) => a.every((s, i) => s === b[i])

  it.each(FREMD)('%s: der Tages-Countdown ist weder leer noch durchweg deutsch', (code) => {
    const STUFEN = [0, 1, 4, -3]
    const eigen = STUFEN.map((tage) => relativeDayLabel(NOW + tage * day, code, NOW))
    const deutsch = STUFEN.map((tage) => relativeDayLabel(NOW + tage * day, 'de', NOW))
    expect(eigen.filter(Boolean), `${code}: leere Chips`).toHaveLength(STUFEN.length)
    expect(gleich(eigen, deutsch), `${code}: ${eigen.join(' / ')}`).toBe(false)
  })

  it.each(FREMD)('%s: das Wochen-Label ebenso', (code) => {
    const STUFEN = [0, 1, -1, 2, -2]
    const eigen = STUFEN.map((v) => relativeWeekLabel(v, code))
    const deutsch = STUFEN.map((v) => relativeWeekLabel(v, 'de'))
    expect(eigen.filter(Boolean), `${code}: leere Labels`).toHaveLength(STUFEN.length)
    expect(gleich(eigen, deutsch), `${code}: ${eigen.join(' / ')}`).toBe(false)
  })

  it.each(APP_LANGS.map((l) => l.code))('%s: keine Form enthält „undefined" oder „NaN"', (code) => {
    // Der Rand: sehr große Abstände, negative wie positive. `Intl` formatiert
    // sie klaglos — solange die Zahl eine ist.
    for (const tage of [0, 1, -1, 6, 7, 30, 365, -365]) {
      const text = relativeDayLabel(NOW + tage * day, code, NOW)
      expect(text, `${code}/${tage}`).not.toMatch(/undefined|NaN|Invalid/)
    }
    for (const versatz of [0, 1, -1, 52, -52]) {
      expect(relativeWeekLabel(versatz, code), `${code}/${versatz}`).not.toMatch(
        /undefined|NaN|Invalid/,
      )
    }
  })

  it.each(FREMD)('%s: „heute"/„morgen" sind Wörter, keine gezählten Tage', (code) => {
    /*
      `numeric: 'auto'` ist der ganze Grund für diesen Weg: Ohne ihn stünde da
      „in 1 Tag" statt „morgen", und in Sprachen mit Dual, Paukal oder eigenen
      Zählwörtern wäre die Form schlicht falsch.

      Belegt wird es nicht an einer Behauptung über die Wörter — die kennt hier
      niemand für 33 Sprachen —, sondern am **Unterschied zur gezählten Form**:
      Dasselbe `Intl` mit `numeric: 'always'` muss etwas anderes liefern. Tut es
      das nicht, ist die Option wirkungslos geworden.
    */
    const locale = LOCALES[code]
    const gezaehlt = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
    for (const versatz of [0, 1, -1]) {
      const auto = relativeDayLabel(NOW + versatz * day, code, NOW)
      expect(auto, `${code}/${versatz}`).not.toBe(gezaehlt.format(versatz, 'day'))
    }
  })

  it('ein Tag weiter kann trotzdem ein eigenes Wort sein', () => {
    // Japanisch hat für „übermorgen" ein Wort (明後日) und schreibt dort keine
    // Zahl. Wer prüft „ab zwei Tagen steht eine Zahl da", prüft eine deutsche
    // Eigenheit — deshalb steht das hier als Merkposten und nicht als Regel.
    expect(relativeDayLabel(NOW + 2 * day, 'ja', NOW)).not.toMatch(/\p{Nd}/u)
    expect(relativeDayLabel(NOW + 4 * day, 'ja', NOW)).toMatch(/\p{Nd}/u)
  })
})
