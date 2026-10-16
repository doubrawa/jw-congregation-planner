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
        APP_LANGS_SORTED[i - 1]!.label.localeCompare(APP_LANGS_SORTED[i]!.label, 'de'),
      ).toBeLessThanOrEqual(0)
    }
  })
})

describe('Sprachcode-Zuordnungen (jw.org ↔ App)', () => {
  it('APP_TO_JW: jede App-Sprache hat ihren jw.org-Code', () => {
    // Bei den zwölf App-Sprachen fallen beide Codes zusammen (seit dem
    // 15.10.2026; Varianten wie pt-pt oder cmn-hans gab es nur bei den
    // entfallenen).
    for (const { code } of APP_LANGS) expect(APP_TO_JW[code], code).toBe(code)
  })

  it('congAppCode: jw.org-Code der Versammlungssprache → App-Code', () => {
    expect(congAppCode('de')).toBe('de')
    expect(congAppCode('gibt-es-nicht')).toBeUndefined()
    // Der deutsche Anzeigename taugt seit September 2026 nicht mehr als
    // Eingabe — er stand bis dahin im Zustand und wäre hier stillschweigend
    // durchgefallen.
    expect(congAppCode('Deutsch')).toBeUndefined()
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
