import { describe, expect, it } from 'vitest'
import { PUSH_SPRACHEN, pushTexte } from './texte'
import { APP_LANGS } from '../../../src/i18n/langs'
import { dict } from '../../../src/i18n/ui'

/**
 * Push-Erinnerungen gingen immer auf Deutsch heraus. Anders als die Glocke in
 * der App lässt sich eine Push-Nachricht nicht beim Anzeigen übersetzen — sie
 * ist fertiger Text, sobald sie das Gerät erreicht.
 */
describe('Push-Texte', () => {
  it('deckt jede App-Sprache ab', () => {
    for (const { code } of APP_LANGS) {
      expect(PUSH_SPRACHEN, code).toContain(code)
    }
  })

  it('keine Sprache fällt still auf Deutsch zurück', () => {
    const de = pushTexte('de')
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      expect(pushTexte(code).erinnerung, code).not.toBe(de.erinnerung)
      expect(pushTexte(code).unerreichbar, code).not.toBe(de.unerreichbar)
    }
  })

  it('unbekannt oder fehlend → Deutsch (Abos von vor migration-014)', () => {
    expect(pushTexte(null).erinnerung).toBe('Erinnerung: Zuteilung bestätigen')
    expect(pushTexte('kli').erinnerung).toBe('Erinnerung: Zuteilung bestätigen')
  })

  it('der deutsche Titel ist derselbe wie der der Glocken-Mitteilung', () => {
    // Die Glocke speichert kanonisch deutsch und wird beim Anzeigen übersetzt
    // (NOTIF_TITLE_KEY). Laufen die Formulierungen auseinander, greift die
    // Zuordnung nicht mehr und der Titel bliebe deutsch stehen.
    expect(pushTexte('de').erinnerung).toBe(dict('de').notifErinnerungBest)
  })
})
