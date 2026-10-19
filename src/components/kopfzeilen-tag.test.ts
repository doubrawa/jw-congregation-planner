import { describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { NBSP } from '../i18n/zahl-binden'
import { datumsFormat, kopfzeilenTag } from './datum-anzeige'

/**
 * **Der Tag in der Kopfzeile bricht nur am Wochentag um** (T128).
 *
 * Bei 320 px und großer Schrift stand in der Kopfzeile „poniedziałek, 7" und
 * darunter „września" — Tag und Monat auseinandergerissen. Die Kopfzeile steht
 * auf jedem Bildschirm. Wo der Wochentag steht, bestimmt die Sprache: Türkisch
 * stellt ihn ans Ende, Französisch setzt kein Komma. Eine Regel „nach dem
 * Komma" hätte beides verfehlt.
 */

const MONTAG = new Date(2026, 8, 7)
const CODES = APP_LANGS.map((l) => l.code)

describe('Der Tag in der Kopfzeile', () => {
  it.each(CODES)('%s: derselbe Text wie von Intl — nur Tag und Monat sind gebunden', (code) => {
    const text = kopfzeilenTag(MONTAG, code)
    expect(text.replaceAll(NBSP, ' ')).toBe(datumsFormat(code, 'tag').format(MONTAG).replaceAll(NBSP, ' '))
    // Ohne den Wochentag bleibt kein umbrechbares Leerzeichen übrig.
    const wochentag = datumsFormat(code, 'wochentag').format(MONTAG)
    expect(text, code).toContain(wochentag)
    expect(text.replace(wochentag, '').trim().replace(/^[,،]\s*/, ''), code).not.toMatch(/ /)
  })

  it('auf Deutsch bricht es hinter dem Komma, nie zwischen „7." und „September"', () => {
    expect(kopfzeilenTag(MONTAG, 'de')).toBe(`Montag, 7.${NBSP}September`)
  })

  it('auf Türkisch steht der Wochentag hinten — dort darf es umbrechen', () => {
    expect(kopfzeilenTag(MONTAG, 'tr')).toBe(`7${NBSP}Eylül Pazartesi`)
  })

  it('auf Französisch ohne Komma: zwischen Wochentag und Tag bleibt die Zeile umbrechbar', () => {
    expect(kopfzeilenTag(MONTAG, 'fr')).toBe(`lundi 7${NBSP}septembre`)
  })
})
