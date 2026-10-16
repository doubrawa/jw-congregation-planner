import { describe, expect, it } from 'vitest'
import { personCompare, emptyQualifications } from './helpers'
import { APP_LANGS } from '../i18n/langs'
import type { Person } from './types'

/**
 * **Die Personenliste sortiert in der Sprache des Lesers** (U8/V8).
 *
 * `personCompare` verglich fest mit `'de'`. Für die meisten Schriften fällt das
 * nicht auf — die Wurzel-Sortierung greift ohnehin —, für einige der
 * App-Sprachen aber sehr wohl (Polnisch, Rumänisch, Türkisch). Wer einen Namen
 * sucht, sucht ihn dort, wo seine Sprache ihn hinstellt.
 *
 * Der Prüfstand nennt drei Fälle, die sich gemessen unterscheiden, und hält
 * zusätzlich fest, dass die Sortierung in **keiner** App-Sprache stehen bleibt
 * (kein Rückfall auf eine Locale, die `Intl` nicht kennt).
 *
 * Bis zum 16.10.2026 standen hier Dänisch, Schwedisch und Norwegisch (Å, Ö, Ø
 * hinter Z) — seit dem 15.10. keine App-Sprachen mehr. Die Fälle sind jetzt
 * aus den zwölf, nachgemessen mit denselben Optionen wie `personCompare`.
 */

const person = (ln: string, fn = 'A'): Person => ({
  id: `p-${ln}-${fn}`,
  fn,
  ln,
  role: 'verkuendiger',
  tel: '',
  mail: '',
  priv: emptyQualifications(),
})

/** Nachnamen sortiert — kurz geschrieben. */
const sortiert = (namen: string[], lang: string): string[] =>
  namen
    .map((n) => person(n))
    .sort((a, b) => personCompare(a, b, lang))
    .map((p) => p.ln)

describe('Personen sortieren nach der Sprache des Lesers', () => {
  it('Ł steht auf Polnisch hinter L, auf Deutsch bei L', () => {
    /*
      Polnisch führt Ł als eigenen Buchstaben **hinter** L. Deutsch ordnet es
      bei L ein, und dort entscheidet der nächste Buchstabe. Ein polnischer
      Planer suchte „Łapa" also hinter „Lis" und fand ihn davor.
    */
    expect(sortiert(['Łapa', 'Lis', 'Mazur'], 'de')).toEqual(['Łapa', 'Lis', 'Mazur'])
    expect(sortiert(['Łapa', 'Lis', 'Mazur'], 'pl')).toEqual(['Lis', 'Łapa', 'Mazur'])
  })

  it('das rumänische Ș und das türkische Ç ebenso', () => {
    expect(sortiert(['Șerban', 'Stan', 'Tudor'], 'de')).toEqual(['Șerban', 'Stan', 'Tudor'])
    expect(sortiert(['Șerban', 'Stan', 'Tudor'], 'ro')).toEqual(['Stan', 'Șerban', 'Tudor'])
    expect(sortiert(['Çakır', 'Cem', 'Demir'], 'de')).toEqual(['Çakır', 'Cem', 'Demir'])
    expect(sortiert(['Çakır', 'Cem', 'Demir'], 'tr')).toEqual(['Cem', 'Çakır', 'Demir'])
  })

  it('der Vorname entscheidet bei gleichem Nachnamen — ebenfalls in der Lesersprache', () => {
    const gleich = [person('Nowak', 'Łada'), person('Nowak', 'Lena')]
    const de = [...gleich].sort((a, b) => personCompare(a, b, 'de')).map((p) => p.fn)
    const pl = [...gleich].sort((a, b) => personCompare(a, b, 'pl')).map((p) => p.fn)
    expect(de).toEqual(['Łada', 'Lena']) // Ł bei L, dann a vor e
    expect(pl).toEqual(['Lena', 'Łada']) // Ł hinter L
  })

  it('jede App-Sprache liefert eine brauchbare Ordnung', () => {
    // Kein Rückfall ins Leere: `LOCALES` muss für jede Sprache eine Locale
    // haben, die `Intl` annimmt — sonst wirft `localeCompare`.
    const namen = ['Zahn', 'Łapa', 'Șerban', 'Çakır', 'Müller', 'Ibrahim']
    for (const { code } of APP_LANGS) {
      const raus = sortiert(namen, code)
      expect(raus.length, code).toBe(namen.length)
      expect([...raus].sort(), code).toEqual([...namen].sort())
    }
  })
})
