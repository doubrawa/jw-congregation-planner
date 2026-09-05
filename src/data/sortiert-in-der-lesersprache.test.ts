import { describe, expect, it } from 'vitest'
import { personCompare, emptyQualifications } from './helpers'
import { APP_LANGS } from '../i18n/langs'
import type { Person } from './types'

/**
 * **Die Personenliste sortiert in der Sprache des Lesers** (U8/V8).
 *
 * `personCompare` verglich fest mit `'de'`. Für die meisten Schriften fällt das
 * nicht auf — die Wurzel-Sortierung greift ohnehin —, für eine ganze Reihe der
 * 33 Sprachen aber sehr wohl. Wer einen Namen sucht, sucht ihn dort, wo seine
 * Sprache ihn hinstellt.
 *
 * Der Prüfstand nennt zwei Fälle, die sich gemessen unterscheiden, und hält
 * zusätzlich fest, dass die Sortierung in **keiner** App-Sprache stehen bleibt
 * (kein Rückfall auf eine Locale, die `Intl` nicht kennt).
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
  it('Å steht auf Dänisch hinten, auf Deutsch bei A', () => {
    /*
      Die skandinavischen Sprachen führen Å, Æ und Ø als eigene Buchstaben
      **hinter** Z. Deutsch ordnet sie bei A und O ein. Ein dänischer Planer
      suchte „Ågård" also am Anfang der Liste und fand ihn dort auch — nur
      stand er für ihn an der falschen Stelle.
    */
    expect(sortiert(['Ågård', 'Berg', 'Zahn'], 'de')).toEqual(['Ågård', 'Berg', 'Zahn'])
    expect(sortiert(['Ågård', 'Berg', 'Zahn'], 'da')).toEqual(['Berg', 'Zahn', 'Ågård'])
  })

  it('das schwedische Ö ebenso', () => {
    expect(sortiert(['Öberg', 'Nilsson', 'Sund'], 'de')).toEqual(['Nilsson', 'Öberg', 'Sund'])
    expect(sortiert(['Öberg', 'Nilsson', 'Sund'], 'sv')).toEqual(['Nilsson', 'Sund', 'Öberg'])
  })

  it('der Vorname entscheidet bei gleichem Nachnamen — ebenfalls in der Lesersprache', () => {
    const gleich = [person('Berg', 'Øystein'), person('Berg', 'Bo')]
    const de = [...gleich].sort((a, b) => personCompare(a, b, 'de')).map((p) => p.fn)
    const no = [...gleich].sort((a, b) => personCompare(a, b, 'no')).map((p) => p.fn)
    expect(de).toEqual(['Bo', 'Øystein']) // Ø bei O, also hinter B
    expect(no).toEqual(['Bo', 'Øystein']) // hinter Z — hier ebenfalls hinten
    // Gegenprobe, dass der Vorname überhaupt zieht:
    expect(de[0]).not.toBe(de[1])
  })

  it('jede App-Sprache liefert eine brauchbare Ordnung', () => {
    // Kein Rückfall ins Leere: `LOCALES` muss für jede Sprache eine Locale
    // haben, die `Intl` annimmt — sonst wirft `localeCompare`.
    const namen = ['Zahn', 'Ågård', 'Öberg', 'Müller', 'Ibrahim']
    for (const { code } of APP_LANGS) {
      const raus = sortiert(namen, code)
      expect(raus.length, code).toBe(namen.length)
      expect([...raus].sort(), code).toEqual([...namen].sort())
    }
  })
})
