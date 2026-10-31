import { describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { zahlBinden } from '../i18n/zahl-binden'
import type { AusgestellterLink } from '../lib/links-ausstellen'
import { linkNachricht } from './link-nachricht'

/**
 * **Link und Code als Nachricht** (24.10.2026, „Teilen" und „Kopieren" im
 * Blatt „Link senden"; seit dem 31.10.2026 auch in der Liste unter „Links
 * senden"). E-Mails schickt die App keine mehr — einen abgelaufenen Link gibt
 * es von den Ältesten, nicht über „Link senden" auf der Anmeldeseite.
 */

const link: AusgestellterLink = {
  personId: 'p-a',
  url: `https://versammlung.app/#anmelden=${'T'.repeat(43)}`,
  zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
  code: 'K7RD-2QWM',
  gueltigBis: '2026-11-14T09:00:00.000Z',
}
const anton = { fn: 'Anton', ln: 'Alt' }

describe('Der Text der Nachricht', () => {
  it('kommt in der Sprache der Versammlung — ihr Wörterbuch lädt die App selbst nach', async () => {
    // Zuerst, solange das polnische Overlay noch nicht geladen ist: Sonst stünde
    // still der englische Rückfall da.
    const n = await linkNachricht(anton, link, { lang: 'pl', versammlung: 'Musterstadt' })
    expect(n.titel).toBe('Twój dostęp do zboru Musterstadt')
    expect(n.text).toContain('Cześć Anton')
    expect(n.text).toContain(zahlBinden('14 listopada 2026'))
  })

  it('trägt Link und Code unverändert — der Code auf eigener Zeile, so wie man ihn abtippt', async () => {
    for (const lang of ['de', 'fr', 'ar'] as const) {
      const n = await linkNachricht(anton, link, { lang, versammlung: 'Musterstadt' })
      expect(n.text, lang).toContain(link.url)
      expect(n.text, lang).toContain('\nK7RD-2QWM\n')
      expect(n.text, lang).not.toMatch(/\{\w+\}/)
    }
  })

  it('das Datum mit Jahr — der Link gilt ein Jahr, ohne stünde der Tag von heute da', async () => {
    const n = await linkNachricht(anton, link, { lang: 'de', versammlung: 'Musterstadt' })
    expect(n.text).toContain(`bis ${zahlBinden('14. November 2026')}`)
  })

  it('grüßt ohne Vornamen mit dem Nachnamen — bis zum 24.10.2026 stand „Hallo ," da', async () => {
    const n = await linkNachricht({ fn: '', ln: 'Krüger' }, link, { lang: 'de', versammlung: 'Musterstadt' })
    expect(n.text).toMatch(/^Hallo Krüger,\n/)
  })

  it('jede Sprache trägt alle fünf Platzhalter, der Titel die Versammlung, der Code steht auf eigener Zeile', async () => {
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
    for (const { code } of APP_LANGS) {
      const d = dict(code)
      for (const platz of ['{name}', '{versammlung}', '{url}', '{code}', '{datum}']) expect(d.linkNachrichtText, `${code}: ${platz}`).toContain(platz)
      expect(d.linkNachrichtTitel, `${code}: Titel ohne Versammlung`).toContain('{versammlung}')
      expect(d.linkNachrichtText, `${code}: {code} nicht auf eigener Zeile`).toContain('\n{code}\n')
      // Ohne Vornamen grüßt sie mit dem Nachnamen, in jeder Sprache.
      const n = await linkNachricht({ fn: '', ln: 'Krüger' }, link, { lang: code, versammlung: 'Musterstadt' })
      expect(n.text.split('\n')[0], code).toContain('Krüger')
    }
  })

  it('in jeder Sprache: ohne E-Mail, die Ältesten statt „Link senden"', async () => {
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
    for (const { code } of APP_LANGS) {
      const d = dict(code)
      const n = await linkNachricht(anton, link, { lang: code, versammlung: 'Musterstadt' })
      expect(n.text, `${code}: zitiert „${d.linkSenden}"`).not.toContain(d.linkSenden)
      expect(n.text, `${code}: Code nicht auf eigener Zeile`).toContain('\nK7RD-2QWM\n')
      expect(n.text, `${code}: Platzhalter`).not.toMatch(/\{\w+\}/)
      // Der zitierte Knopf heißt wie auf der Anmeldeseite.
      expect(n.text, `${code}: zitiert „${d.codeEintippen}"`).toContain(d.codeEintippen)
    }
  })
})
