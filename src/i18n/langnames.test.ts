import { describe, expect, it } from 'vitest'
import { APP_LANGS, APP_TO_JW, JW_LANGS } from './langs'
import { langChoices, langLabel, loadLangNames } from './langnames'

/**
 * Die 482 Sprachnamen in jeder Bediensprache.
 *
 * Sie sind erzeugt (aus dem „LESEN IN"-Umschalter von jw.org), und genau
 * deshalb braucht es diese Prüfung: erzeugte Daten sieht niemand durch. Eine
 * fehlende Sprache oder ein leerer Name fällt sonst erst dem auf, der seine
 * eigene Sprache in der Liste sucht — auf Deutsch.
 */

const CODES = APP_LANGS.map((l) => l.code).filter((c) => c !== 'de')

// Alle Listen einmal laden; danach arbeiten die Prüfungen synchron.
await Promise.all(CODES.map((c) => loadLangNames(c)))

describe('Sprachnamen je Bediensprache', () => {
  it.each(CODES)('%s kennt jede der 482 Sprachen', (code) => {
    const gewaehlt = langChoices(code)
    expect(gewaehlt).toHaveLength(JW_LANGS.length)
    // Kein Eintrag darf beim deutschen Namen hängenbleiben, wo die Sprache eine
    // eigene Schrift hat — geprüft an einer Stichprobe mit fremder Schrift, denn
    // im Lateinischen sind Namensgleichheiten normal („Tagalog", „Bemba").
    const fehlend = gewaehlt.filter((l) => !l.label.trim())
    expect(fehlend, `${code}: leere Namen`).toEqual([])
  })

  /**
   * Sprachen mit eigener Schrift. Nur hier lässt sich hart prüfen, ob wirklich
   * übersetzt wurde: „Tagalog" heißt auf Tagalog „Tagalog“, ein Vergleich mit
   * dem deutschen Namen sagt dort nichts. In einer eigenen Schrift ist die
   * Gleichheit dagegen unmöglich — bleibt lateinischer Text stehen, ist die
   * Liste nicht angekommen.
   */
  const EIGENE_SCHRIFT: Array<[string, RegExp]> = [
    ['ru', /\p{Script=Cyrillic}/u], ['uk', /\p{Script=Cyrillic}/u], ['bg', /\p{Script=Cyrillic}/u],
    ['el', /\p{Script=Greek}/u], ['zh', /\p{Script=Han}/u], ['ja', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u],
    ['ko', /\p{Script=Hangul}/u], ['ar', /\p{Script=Arabic}/u], ['he', /\p{Script=Hebrew}/u],
    ['fa', /\p{Script=Arabic}/u], ['ur', /\p{Script=Arabic}/u],
  ]

  it.each(EIGENE_SCHRIFT)('%s benennt sich selbst in eigener Schrift', (code, schrift) => {
    // Die eigene Sprache ist der Eintrag, den ein Nutzer garantiert ansieht.
    // Hier stand dafür eine handgepflegte Tabelle App-Code → deutscher Name;
    // seit der Schlüssel der jw.org-Code ist, genügt `APP_TO_JW`.
    const eigen = APP_TO_JW[code as (typeof CODES)[number]]!
    const name = langLabel(eigen, code as (typeof CODES)[number])
    expect(name, `${code}: „${name}"`).toMatch(schrift)
  })

  it('deckt jede Sprache mit eigener Schrift ab', () => {
    // Sonst fiele eine aus der Prüfung, sobald jemand eine Sprache hinzufügt.
    const ohneLatein = CODES.filter((c) => !/^(en|es|fr|it|pt|nl|pl|ro|cs|sk|hu|hr|sr|sv|da|fi|no|tr|id|tl|vi|sw)$/.test(c))
    expect(ohneLatein.sort()).toEqual(EIGENE_SCHRIFT.map(([c]) => c).sort())
  })

  it('ohne geladene Liste bleibt der deutsche Name stehen', () => {
    // Der Rückfall muss lesbar sein, nicht leer: bis zum Nachladen — und nach
    // einem Deployment, wenn der alte Chunk fehlt — steht schlicht Deutsch da.
    expect(langLabel('he', 'de')).toBe('Hebräisch')
    expect(langLabel('gibt-es-nicht', 'he')).toBe('gibt-es-nicht')
  })

  it('Deutsch braucht keine eigene Liste', () => {
    const alle = langChoices('de')
    expect(alle).toHaveLength(JW_LANGS.length)
    expect(alle.find((l) => l.key === 'he')?.label).toBe('Hebräisch')
  })

  it('die Liste ist in der Bediensprache sortiert', () => {
    // Sonst stünde eine griechische Liste in deutscher Buchstabenfolge da.
    const el = langChoices('el').map((l) => l.label)
    const sortiert = [...el].sort((a, b) => a.localeCompare(b, 'el'))
    expect(el).toEqual(sortiert)
  })

  it('der gespeicherte Schlüssel ist der jw.org-Code', () => {
    // Er steht so in der Datenbank und so im Zustand — eine Umstellung der
    // Anzeige darf ihn nicht mitnehmen, sonst findet keine bestehende
    // Versammlung ihre Sprache wieder. Bis September 2026 war es der deutsche
    // Name; ein Name ist keine Kennung.
    expect(langChoices('he').every((l) => JW_LANGS.some((j) => j.code === l.key))).toBe(true)
  })

  it('der deutsche Name bleibt für die Suche dabei', () => {
    // Wer nach einem Sprachwechsel nur noch „Hebräisch" weiß, soll עברית finden.
    const he = langChoices('he').find((l) => l.key === 'he')!
    expect(he.deutsch).toBe('Hebräisch')
    expect(he.label).not.toBe('Hebräisch')
  })
})
