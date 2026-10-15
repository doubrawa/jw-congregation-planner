/*
 * Die reinen Bausteine des Anmeldens per Link (`_shared/anmeldung.ts`) und die
 * E-Mail dazu (`_shared/anmelde-mail.ts`, `_shared/anmelde-texte.ts`). Was die
 * App und die Functions gleich rechnen müssen: Form von Code und Token, wo sie
 * in der Adresse stehen, die Prüfsumme — und dass die E-Mail des Servers
 * Wort für Wort die des eigenen Mail-Programms ist.
 */
import { describe, expect, it } from 'vitest'
import { linkDatum, linkMail } from '../_shared/anmelde-mail.ts'
import { linkMailTexte } from '../_shared/anmelde-texte.ts'
import {
  anmeldeUrl,
  CODE_LAENGE,
  codeAnzeige,
  codeAus,
  codeNormal,
  codeUrl,
  codeVollstaendig,
  gueltigBis,
  interneAdresse,
  LINK_TAGE,
  neuerCode,
  neuesToken,
  pruefsumme,
  tokenAus,
} from '../_shared/anmeldung.ts'

describe('Code zum Eintippen', () => {
  it('8 Zeichen, ohne 0/O und 1/I', () => {
    for (let i = 0; i < 200; i++) {
      const code = neuerCode()
      expect(code).toHaveLength(CODE_LAENGE)
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/)
    }
  })

  it('ist zufällig — keine zwei gleich unter vielen', () => {
    const codes = new Set(Array.from({ length: 2000 }, neuerCode))
    expect(codes.size).toBe(2000)
  })

  it('getippt wird großzügig gelesen: klein, mit Strich und Leerzeichen', () => {
    expect(codeNormal(' k7rd-2qwm ')).toBe('K7RD2QWM')
    expect(codeVollstaendig('k7rd 2qwm')).toBe(true)
    expect(codeVollstaendig('K7RD')).toBe(false)
  })

  it('angezeigt in zwei Vierergruppen', () => {
    expect(codeAnzeige('K7RD2QWM')).toBe('K7RD-2QWM')
  })
})

describe('Token und Adressen', () => {
  it('das Token: 43 Zeichen base64url, jedes Mal neu', () => {
    const a = neuesToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(neuesToken()).not.toBe(a)
  })

  it('der Link trägt das Token hinter #, der Zettel den Code — ein vorhandenes # fällt weg', () => {
    expect(anmeldeUrl('https://versammlung.app/#go=start', 'T'.repeat(43))).toBe(`https://versammlung.app/#anmelden=${'T'.repeat(43)}`)
    expect(codeUrl('https://versammlung.app/', 'k7rd-2qwm')).toBe('https://versammlung.app/#code=K7RD2QWM')
  })

  it('und die App liest beides wieder heraus', () => {
    const token = neuesToken()
    expect(tokenAus(`#anmelden=${token}`)).toBe(token)
    expect(tokenAus(`#go=start&anmelden=${token}`)).toBe(token)
    expect(codeAus('#code=K7RD2QWM')).toBe('K7RD2QWM')
  })

  it('was nicht passt, ist kein Token und kein Code', () => {
    expect(tokenAus('#anmelden=kurz')).toBeNull()
    expect(tokenAus('#go=start')).toBeNull()
    expect(codeAus('#code=K7RD')).toBeNull()
    expect(codeAus('')).toBeNull()
  })

  it('die Prüfsumme ist SHA-256 als Hex', async () => {
    expect(await pruefsumme('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('gilt dreißig Tage', () => {
    const jetzt = new Date('2026-10-15T08:00:00Z')
    expect(LINK_TAGE).toBe(30)
    expect(gueltigBis(jetzt)).toBe('2026-11-14T08:00:00.000Z')
  })

  it('die interne Adresse liegt unter .invalid — dorthin geht nie etwas', () => {
    expect(interneAdresse('p-1')).toBe('p-1@konten.invalid')
  })
})

describe('Die E-Mail mit dem Link', () => {
  const werte = { name: 'Anna', versammlung: 'Musterstadt', url: 'https://app.test/#anmelden=T', gueltigBis: '2026-11-14T08:00:00.000Z' }

  it('alle Platzhalter eingesetzt, das Datum in der Sprache der Mail', () => {
    const de = linkMail('de', werte)
    expect(de.betreff).toBe('Dein Zugang zur Versammlung Musterstadt')
    expect(de.text).toContain('Hallo Anna,')
    expect(de.text).toContain('https://app.test/#anmelden=T')
    expect(de.text).toContain('bis 14. November')
    expect(linkMail('en', werte).text).toContain('until November 14')
    for (const lang of ['de', 'en', 'fr', 'ja', 'ar', 'fa']) expect(linkMail(lang, werte).text, lang).not.toMatch(/\{\w+\}/)
  })

  it('eine unbekannte Sprache fällt auf Deutsch zurück — Text und Datum', () => {
    expect(linkMail('xx', werte).betreff).toBe('Dein Zugang zur Versammlung Musterstadt')
    expect(linkDatum(werte.gueltigBis, 'xx')).toBe('14. November')
  })

  it('jede Sprache trägt alle vier Platzhalter und „Link senden" so, wie ihr Knopf heißt', async () => {
    const { APP_LANGS } = await import('../../../src/i18n/langs')
    const { dict, loadOverlay } = await import('../../../src/i18n/ui')
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
    for (const { code } of APP_LANGS) {
      const t = linkMailTexte(code)
      for (const platz of ['{name}', '{versammlung}', '{url}', '{datum}']) expect(t.text, `${code}: ${platz}`).toContain(platz)
      expect(t.betreff, `${code}: Betreff ohne Versammlung`).toContain('{versammlung}')
      // Die Mail zitiert den Knopf der Anmeldeseite — wörtlich, sonst sucht ihn niemand.
      expect(t.text, `${code}: zitiert „${dict(code).linkSenden}" nicht`).toContain(dict(code).linkSenden)
    }
  })

  it('die Tabelle ist die Abschrift des Wörterbuchs — Zeichen für Zeichen', async () => {
    /*
      Zwei Fassungen derselben E-Mail: die des Servers (`anmelde-texte.ts`) und
      die des eigenen Mail-Programms (Wörterbuch). Laufen sie auseinander,
      bekommt derselbe Empfänger je nach Weg einen anderen Wortlaut.
      Neu erzeugen: scratchpad 8-mailtexte-erzeugen.mjs.
    */
    const { APP_LANGS } = await import('../../../src/i18n/langs')
    const { dict, loadOverlay } = await import('../../../src/i18n/ui')
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
    for (const { code } of APP_LANGS) {
      expect(linkMailTexte(code).betreff, `${code}: Betreff`).toBe(dict(code).linkMailBetreff)
      expect(linkMailTexte(code).text, `${code}: Text`).toBe(dict(code).linkMailText)
    }
  })
})
