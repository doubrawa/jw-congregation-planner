import { describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import type { AusgestellterLink } from '../lib/links-ausstellen'
import { linkNachricht } from './link-mail'

/**
 * **Link und Code als Nachricht** (24.10.2026, „Teilen" im Blatt „Link
 * senden"): derselbe Text wie die E-Mail, ohne das, was nur zu ihr gehört. Wer
 * per Nachricht kommt, hat oft keine Adresse — „Link senden" auf der
 * Anmeldeseite hülfe ihm nicht, einen neuen Link bekommt er von den Ältesten.
 * Und der Satz „Du bekommst diese E-Mail, weil …" stünde in einem Chat falsch.
 */

const link: AusgestellterLink = {
  personId: 'p-a',
  url: `https://versammlung.app/#anmelden=${'T'.repeat(43)}`,
  zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
  code: 'K7RD-2QWM',
  gueltigBis: '2026-11-14T09:00:00.000Z',
  gesendet: false,
}
const ABSATZ = '\n\n'

describe('Der Text der Nachricht', () => {
  it('kommt in der Sprache der Versammlung — ihr Wörterbuch lädt die App selbst nach', async () => {
    // Zuerst, solange das polnische Overlay noch nicht geladen ist: Sonst stünde
    // still der englische Rückfall da.
    const n = await linkNachricht({ fn: 'Anton' }, link, { lang: 'pl', versammlung: 'Musterstadt' })
    expect(n.titel).toBe('Twój dostęp do zboru Musterstadt')
    expect(n.text).toContain('Cześć Anton')
    expect(n.text).toContain('14 listopada')
  })

  it('trägt Link und Code unverändert — der Code auf eigener Zeile, so wie man ihn abtippt', async () => {
    for (const lang of ['de', 'fr', 'ar'] as const) {
      const n = await linkNachricht({ fn: 'Anton' }, link, { lang, versammlung: 'Musterstadt' })
      expect(n.text, lang).toContain(link.url)
      expect(n.text, lang).toContain('\nK7RD-2QWM\n')
      expect(n.text, lang).not.toMatch(/\{\w+\}/)
    }
  })

  it('in jeder Sprache: die E-Mail ohne ihre letzten zwei Absätze, dann die Ältesten statt „Link senden"', async () => {
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
    for (const { code } of APP_LANGS) {
      const d = dict(code)
      const mail = d.linkMailText.split(ABSATZ)
      const n = await linkNachricht({ fn: 'Anton' }, link, { lang: code, versammlung: 'Musterstadt' })
      const absaetze = n.text.trimEnd().split(ABSATZ)
      // Ein Absatz weniger als die E-Mail: Der vorletzte wird ersetzt, der letzte („Du bekommst diese E-Mail …") fällt weg.
      expect(absaetze, `${code}: Absätze`).toHaveLength(mail.length - 1)
      // Der Schluss beginnt wie der vorletzte der E-Mail (wie lange Link und Code gelten) und endet anders.
      expect(mail[mail.length - 2]!.startsWith(d.linkNachrichtSchluss.slice(0, 20)), `${code}: Schluss`).toBe(true)
      expect(n.text, `${code}: zitiert „${d.linkSenden}"`).not.toContain(d.linkSenden)
      expect(n.text, `${code}: Code nicht auf eigener Zeile`).toContain('\nK7RD-2QWM\n')
      expect(n.text, `${code}: Platzhalter`).not.toMatch(/\{\w+\}/)
    }
  })
})
