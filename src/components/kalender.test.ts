import { describe, expect, it } from 'vitest'
import { LOCALES } from '../i18n/langs'
import { wochentagKuerzel } from './kalender'

describe('Die Kürzel der Wochentage über einem Kalender', () => {
  it('ab Montag, in der Sprache des Lesers', () => {
    expect(wochentagKuerzel(LOCALES.de)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'])
    expect(wochentagKuerzel(LOCALES.tr)).toEqual(['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'])
  })

  // Bei 320 px ragten „چهارشنبه" bis 29 px aus seinem Siebtel (Arabisch und
  // Persisch schreiben auch „kurz" den ganzen Namen), „niedz." 13 px und „dum." 3 px (T128).
  it.each(Object.entries(LOCALES))('%s: kein Kürzel länger als drei Zeichen — sonst die Anfangsbuchstaben', (_lang, locale) => {
    const kuerzel = wochentagKuerzel(locale)
    expect(kuerzel).toHaveLength(7)
    for (const tag of kuerzel) expect([...tag].length, tag).toBeLessThanOrEqual(3)
  })

  it('Polnisch steht ganz in Anfangsbuchstaben, nicht nur der Sonntag', () => {
    expect(wochentagKuerzel(LOCALES.pl)).toEqual(['P', 'W', 'Ś', 'C', 'P', 'S', 'N'])
  })
})
