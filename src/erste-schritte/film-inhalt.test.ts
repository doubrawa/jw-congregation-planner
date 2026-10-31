import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { aufgabeWann } from '../aufgaben/aufgabe-anzeige'
import type { Lang } from '../data/types'
import { APP_LANGS } from '../i18n/langs'
import { makeTr } from '../i18n/translate'
import { dict, loadOverlay } from '../i18n/ui'
import { filmInhalt } from './film-inhalt'

/**
 * **Was das Handy im Film zeigt** (22.10.2026).
 *
 * Der Film ist keine Aufnahme: Er zeigt die App dessen, der ihn sieht — seinen
 * Vornamen im Gruß und in der E-Mail, seine Versammlung im Kopf, heute als
 * Datum, morgen als Termin, alles in seiner Sprache. Ein fremder Name im Gruß
 * („Simon") oder ein „undefined" ohne Person sähe aus wie ein Fehler der App.
 *
 * Die E-Mail steht nur bis zum Link im Bild: Auf ihn tippt der Finger. Stünde
 * dahinter der Rest, gehörte der Code dazu — und ein Platzhalter wie
 * `{code}` stünde wörtlich im Bild.
 */

const MONTAG_NEUN_UHR = new Date(2026, 8, 7, 9, 0)
const FREMD = APP_LANGS.map((l) => l.code).filter((c): c is Exclude<Lang, 'de'> => c !== 'de')

beforeAll(async () => {
  await Promise.all(FREMD.map((code) => loadOverlay(code)))
})

afterEach(() => {
  vi.useRealTimers()
})

const inhalt = (lang: Lang, vorname = 'Anton', versammlung = 'Krumbach', jetzt = MONTAG_NEUN_UHR) =>
  filmInhalt({ t: dict(lang), lang, vorname, versammlung }, jetzt)

describe('Das Handy im Film', () => {
  it('grüßt mit dem eigenen Vornamen und nennt die eigene Versammlung', () => {
    const i = inhalt('de')
    expect(i.gruss).toBe('Guten Morgen, Anton')
    expect(i.kopfVersammlung).toBe('Versammlung Krumbach')
    expect(i.nachrichtText.startsWith('Hallo Anton,')).toBe(true)
    expect(i.nachrichtText).toContain('die Versammlung Krumbach plant')
  })

  it('der Gruß folgt der Tageszeit, wie auf Start', () => {
    expect(inhalt('de', 'Anton', 'Krumbach', new Date(2026, 8, 7, 14, 0)).gruss).toBe('Guten Tag, Anton')
    expect(inhalt('de', 'Anton', 'Krumbach', new Date(2026, 8, 7, 20, 0)).gruss).toBe('Guten Abend, Anton')
  })

  it('ohne Person steht kein Name und kein „undefined" da', () => {
    const i = inhalt('de', '')
    expect(i.gruss).toBe('Guten Morgen, …')
    expect(i.nachrichtText.startsWith('Hallo …,')).toBe(true)
  })

  it('die Aufgabe ist morgen — in der Sprache der App, am Satzanfang groß', () => {
    expect(inhalt('de').wann).toMatch(/^Morgen · Dienstag, 8\.\s?September · 19:00$/)
    expect(inhalt('en').wann.startsWith('Tomorrow · ')).toBe(true)
  })

  it.each(APP_LANGS.map((l) => l.code))('%s: die Terminzeile steht wie auf der echten Karte', (lang) => {
    // Bis zum Review vom 22.10.2026 formte `Intl` die Uhrzeit: „07:00 PM" auf
    // Englisch, „07:00 م" auf Arabisch, „۱۹:۰۰" auf Persisch — die Karte der
    // App schreibt sie, wie das Programm sie hat. Verglichen wird mit dem, was
    // die Karte für eine Aufgabe von morgen zeigt.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MONTAG_NEUN_UHR)
    const tr = makeTr(lang)
    const karte = aufgabeWann(
      { id: 'x', title: '', date: 'Dienstag, 8. September · 19:00', at: Date.UTC(2026, 8, 8), status: 'offen', s89: null, lesersprache: true },
      lang,
      { tp: tr, tu: tr },
    )
    expect(inhalt(lang).wann).toBe(karte)
  })

  it.each(APP_LANGS.map((l) => l.code))('%s: die Nachricht steht bis zum Link im Bild, ohne einen Platzhalter', (lang) => {
    const i = inhalt(lang)
    expect(i.nachrichtText.length).toBeGreaterThan(20)
    expect(i.nachrichtText).not.toMatch(/\{\w+\}/)
    expect(i.nachrichtText).toContain('Anton')
    // Der Code steht erst hinter dem Link — im Bild also nicht.
    const [, dahinter = ''] = dict(lang).linkNachrichtText.split('{url}')
    expect(dahinter).toContain('{code}')
  })
})
