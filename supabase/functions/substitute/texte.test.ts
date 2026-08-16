import { describe, expect, it } from 'vitest'
import { substituteTexte, TITEL_GEFUNDEN, TITEL_GESUCHT } from './texte'
import { APP_LANGS } from '../../../src/i18n/langs'
import { dict, NOTIF_TITLE_KEY } from '../../../src/i18n/ui'

/*
 * Dieselbe Prüfung, die `send-reminders/texte.ts` seit T24 hat — hier fehlte
 * sie. Zwei Wörterbücher derselben Bauart, eines bewacht, eines nicht: Kommt
 * eine 35. App-Sprache dazu, wird der eine Versand rot und der andere schickt
 * seine Push-Nachrichten still auf Deutsch hinaus.
 *
 * Ein Push ist fertiger Text, sobald er das Gerät erreicht. Anders als die
 * Glocke in der App lässt er sich beim Anzeigen nicht mehr übersetzen — was
 * hier fehlt, ist beim Empfänger nicht mehr zu heilen.
 */
describe('Ersatz-Texte', () => {
  it('deckt jede App-Sprache ab', () => {
    const de = substituteTexte('de')
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      expect(substituteTexte(code).gesucht, code).not.toBe(de.gesucht)
      expect(substituteTexte(code).gefunden, code).not.toBe(de.gefunden)
    }
  })

  it('unbekannt oder fehlend → Deutsch (Abos von vor migration-014)', () => {
    for (const lang of [null, undefined, '', 'kli']) {
      expect(substituteTexte(lang).gesucht).toBe(TITEL_GESUCHT)
      expect(substituteTexte(lang).gefunden).toBe(TITEL_GEFUNDEN)
    }
  })

  it('die deutschen Titel sind die Schlüssel der Glocken-Übersetzung', () => {
    // Die Function schreibt den Titel kanonisch deutsch in die Mitteilung; die
    // App schlägt ihn beim Anzeigen in NOTIF_TITLE_KEY nach. Laufen die
    // Formulierungen auseinander, greift die Zuordnung nicht mehr — und der
    // Titel bliebe in allen 33 Fremdsprachen deutsch stehen.
    for (const titel of [TITEL_GESUCHT, TITEL_GEFUNDEN]) {
      const key = NOTIF_TITLE_KEY[titel]
      expect(key, titel).toBeDefined()
      expect(dict('en')[key as keyof ReturnType<typeof dict>], titel).toBeTruthy()
    }
  })
})
