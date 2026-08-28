import { describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { dict } from '../i18n/ui'
import { authFehlerText } from './auth-text'
import type { AuthFehler } from '../lib/supabase'

/** Die Schlüssel, die `authFehler` (lib/supabase.ts) erzeugen kann. */
const SCHLUESSEL = [
  'authFalsch',
  'authUnbestaetigt',
  'authSchonRegistriert',
  'authPwKurz',
  'authZuVieleVersuche',
] as const satisfies ReadonlyArray<Extract<AuthFehler, { key: string }>['key']>

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

  /**
   * **Alle fünf Meldungen, nicht nur die eine.**
   *
   * Gemessen wurde bisher `authFalsch`. Die anderen vier kommen seltener vor —
   * und genau deshalb fällt dort ein deutscher Satz niemandem auf, der ihn
   * beheben könnte. „Passwort zu kurz" liest man beim Einrichten des eigenen
   * Kontos: der allererste Bildschirm, den ein neuer Nutzer sieht, und der
   * einzige, bei dem er noch gar keine Sprache einstellen konnte.
   */
  it.each(SCHLUESSEL)('%s steht in jeder Sprache eigenständig da', async (key) => {
    const { loadOverlay } = await import('../i18n/ui')
    for (const { code } of APP_LANGS) await loadOverlay(code)
    const deutsch = dict('de')
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      const text = authFehlerText({ key }, dict(code))
      expect(text, `${code}/${key} ist leer`).toBeTruthy()
      expect(text, `${code}/${key} blieb deutsch`).not.toBe(deutsch[key])
    }
  })

  it('die Liste deckt jeden Schlüssel ab, den die Einordnung erzeugt', () => {
    /*
      Der Deckel: `authFehler` in `lib/supabase.ts` ordnet Supabase-Meldungen
      genau diesen fünf Schlüsseln zu. Kommt ein sechster hinzu, ohne dass er
      hier steht, bliebe seine Übersetzung ungemessen — und das ist die Sorte
      Lücke, die hier schon Monate überdauert hat.
    */
    expect([...SCHLUESSEL].sort()).toEqual([
      'authFalsch', 'authPwKurz', 'authSchonRegistriert', 'authUnbestaetigt', 'authZuVieleVersuche',
    ])
    for (const key of SCHLUESSEL) expect(dict('de')[key], key).toBeTruthy()
  })
})
