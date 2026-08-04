import { describe, expect, it } from 'vitest'
import {
  APP_LANGS,
  APP_LANGS_SORTED,
  APP_TO_JW,
  CONG_LANGS,
  CONG_TO_JW,
  congAppCode,
  JW_TO_APP,
} from './langs'

describe('App-Sprachlisten', () => {
  it('APP_LANGS_SORTED ist eine sortierte Permutation von APP_LANGS', () => {
    expect(APP_LANGS_SORTED).toHaveLength(APP_LANGS.length)
    expect(new Set(APP_LANGS_SORTED.map((l) => l.code))).toEqual(
      new Set(APP_LANGS.map((l) => l.code)),
    )
    for (let i = 1; i < APP_LANGS_SORTED.length; i++) {
      expect(
        APP_LANGS_SORTED[i - 1].label.localeCompare(APP_LANGS_SORTED[i].label, 'de'),
      ).toBeLessThanOrEqual(0)
    }
  })
})

describe('Sprachcode-Zuordnungen (jw.org ↔ App)', () => {
  it('APP_TO_JW: erster jw-Code gewinnt bei mehreren je App-Sprache', () => {
    expect(APP_TO_JW.de).toBe('de')
    expect(APP_TO_JW.pt).toBe('pt') // nicht pt-pt/pt-ao
    expect(APP_TO_JW.zh).toBe('cmn-hans')
    expect(APP_TO_JW.sr).toBe('sr-latn')
  })

  it('congAppCode: deutscher Versammlungssprach-Name → App-Code', () => {
    expect(congAppCode('Deutsch')).toBe('de')
    expect(congAppCode('gibt-es-nicht')).toBeUndefined()
  })

  it('jede App-Sprache taugt auch als Versammlungssprache', () => {
    // Fehlt hier eine, bleibt für eine Versammlung dieser Sprache das GANZE
    // Programm deutsch stehen — genau so war es für ar/he/fa/ur.
    const ohneZuordnung = APP_LANGS.map((l) => l.code).filter(
      (code) => !Object.values(JW_TO_APP).includes(code),
    )
    expect(ohneZuordnung).toEqual([])
  })

  it('Versammlungssprachen: vollständige jw.org-Liste mit Codes', () => {
    expect(CONG_LANGS.length).toBeGreaterThan(400)
    expect(CONG_TO_JW['Deutsch']).toBe('de')
  })
})
