/*
 * Die reinen Bausteine des Anmeldens per Link (`_shared/anmeldung.ts`). Was die
 * App und die Functions gleich rechnen müssen: Form von Code und Token, wo sie
 * in der Adresse stehen, die Prüfsumme. (Die E-Mail mit dem Link gab es bis zum
 * 31.10.2026; ihren Text prüft jetzt `src/personen/link-nachricht.test.ts` als
 * Nachricht.)
 */
import { describe, expect, it } from 'vitest'
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

  it('gilt ein Jahr — mit dem Zettel meldet man sich so lange selbst wieder an', () => {
    const jetzt = new Date('2026-10-15T08:00:00Z')
    expect(LINK_TAGE).toBe(365)
    expect(gueltigBis(jetzt)).toBe('2027-10-15T08:00:00.000Z')
  })

  it('die interne Adresse liegt unter .invalid — dorthin geht nie etwas', () => {
    expect(interneAdresse('p-1')).toBe('p-1@konten.invalid')
  })
})
