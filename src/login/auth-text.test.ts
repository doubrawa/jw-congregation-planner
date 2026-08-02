import { describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { dict } from '../i18n/ui'
import { authFehlerText } from './auth-text'

/**
 * Anmeldefehler standen fest auf Deutsch — egal, welche Sprache eingestellt
 * war. Der Login ist ausgerechnet die Stelle, an der niemand Deutsch können
 * muss.
 */
describe('authFehlerText', () => {
  it('nennt den Fehler in der eingestellten Sprache', () => {
    expect(authFehlerText({ key: 'authFalsch' }, dict('de'))).toBe('E-Mail oder Passwort falsch')
    expect(authFehlerText({ key: 'authFalsch' }, dict('en'))).toBe('Email or password incorrect')
  })

  it('gibt Unbekanntes unverändert weiter', () => {
    // Lieber die Originalmeldung von Supabase als gar keine Auskunft.
    expect(authFehlerText({ text: 'Server explodiert' }, dict('de'))).toBe('Server explodiert')
  })

  it('keine Sprache fällt auf Deutsch zurück', async () => {
    const { loadOverlay } = await import('../i18n/ui')
    for (const { code } of APP_LANGS) await loadOverlay(code)
    const deutsch = dict('de')
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      expect(authFehlerText({ key: 'authFalsch' }, dict(code)), code).not.toBe(deutsch.authFalsch)
    }
  })
})
