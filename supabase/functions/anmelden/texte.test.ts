import { beforeAll, describe, expect, it } from 'vitest'
import { anmeldeTexte, TEXT_NEUE_ANMELDUNG, TITEL_NEUE_ANMELDUNG } from './texte'
import { APP_LANGS } from '../../../src/i18n/langs'
import { dict, loadOverlay, NOTIF_TEXT_KEY, NOTIF_TITLE_KEY } from '../../../src/i18n/ui'

/*
 * **„Neue Anmeldung" steht zweimal da** (2.11.2026): als Push, fertig
 * übersetzt aus `texte.ts`, und in der Glocke, kanonisch deutsch und erst beim
 * Anzeigen übersetzt aus dem Wörterbuch. Beide müssen wörtlich dasselbe sagen —
 * sonst liest jemand im Push etwas anderes als daneben in der App.
 */
beforeAll(async () => {
  await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
})

describe('Neue Anmeldung — Push und Glocke', () => {
  it('Titel und Text stehen in jeder App-Sprache wörtlich wie im Wörterbuch', () => {
    for (const { code } of APP_LANGS) {
      expect(anmeldeTexte(code).titel, code).toBe(dict(code).notifNeueAnmeldung)
      expect(anmeldeTexte(code).text, code).toBe(dict(code).notifNeueAnmeldungText)
    }
  })

  it('Gegenprobe: übersetzt ist wirklich, nicht bloß deutsch durchgereicht', () => {
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      expect(anmeldeTexte(code).titel, code).not.toBe(TITEL_NEUE_ANMELDUNG)
      expect(anmeldeTexte(code).text, code).not.toBe(TEXT_NEUE_ANMELDUNG)
    }
  })

  it('die deutschen Sätze sind die Schlüssel, unter denen die Glocke übersetzt', () => {
    expect(NOTIF_TITLE_KEY[TITEL_NEUE_ANMELDUNG]).toBe('notifNeueAnmeldung')
    expect(NOTIF_TEXT_KEY[TEXT_NEUE_ANMELDUNG]).toBe('notifNeueAnmeldungText')
  })

  it('unbekannt oder fehlend → Deutsch', () => {
    for (const lang of [null, undefined, '', 'kli']) expect(anmeldeTexte(lang)).toEqual({ titel: TITEL_NEUE_ANMELDUNG, text: TEXT_NEUE_ANMELDUNG })
  })
})
