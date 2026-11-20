import { afterEach, describe, expect, it } from 'vitest'
import { alsFreitext } from '../../supabase/functions/_shared/i18n/freitext.ts'
import { ziffernDerSprache, ziffernSatz } from '../../supabase/functions/_shared/i18n/ziffern-der-sprache.ts'
import { anzeigeSpracheSetzen } from './anzeige-ziffern'
import { APP_LANGS, LOCALES } from './langs'
import { makeTr } from './translate'
import { fill } from './useT'
import { NBSP } from './zahl-binden'

/**
 * **Jede Zahl in der Schrift der Sprache** (Entscheidung des Betreibers,
 * 20.11.2026): Uhrzeiten, Zählungen und Nummern tragen dieselben Ziffern wie
 * das Datum aus `Intl` daneben. In Persisch standen sie in 0–9 neben „۸ سپتامبر".
 */

/** Persische Ziffern, ohne `Intl` gerechnet: U+06F0 ist die Null. */
const persisch = (s: string): string => s.replace(/[0-9]/g, (d) => String.fromCodePoint(0x06f0 + Number(d)))

/** Die Ziffern im Datum, das `Intl` für diese Sprache schreibt — der Maßstab. */
const ziffernImDatum = (code: string): string =>
  [...new Intl.DateTimeFormat(LOCALES[code as keyof typeof LOCALES], { day: 'numeric' }).format(new Date(2026, 0, 7))]
    .filter((c) => /\p{Nd}/u.test(c))
    .join('')

describe('ziffernDerSprache', () => {
  it('Persisch: jede Ziffer in der eigenen Schrift — „19:30" wird „۱۹:۳۰"', () => {
    expect(ziffernDerSprache('19:30', 'fa')).toBe(persisch('19:30'))
    expect(ziffernDerSprache('0123456789', 'fa')).toBe(persisch('0123456789'))
  })

  it('jede App-Sprache schreibt dieselben Ziffern wie ihr Datum aus Intl', () => {
    // Für Arabisch kommt es auf die Laufzeit an (CLDR): westlich oder
    // arabisch-indisch — Uhrzeit und Datum stimmen so oder so überein.
    for (const { code } of APP_LANGS) expect(ziffernDerSprache('7', code), code).toBe(ziffernImDatum(code))
  })

  it('nur die Ziffern 0–9 ändern sich — Text, Zeichen und schon fremde Ziffern bleiben', () => {
    expect(ziffernDerSprache('Lied ۵ · 19:30–20:45', 'fa')).toBe(`Lied ۵ · ${persisch('19:30')}–${persisch('20:45')}`)
  })

  it('Gegenprobe: 0–9-Sprachen und unbekannte Codes bleiben, wie sie sind', () => {
    for (const code of ['de', 'en', 'tr', 'xx-unbekannt', '']) {
      expect(ziffernDerSprache('19:30 · 3/4', code), code).toBe('19:30 · 3/4')
      expect(ziffernSatz(code), code).toBeNull()
    }
  })
})

describe('Der Übersetzer schreibt die Ziffern der Sprache — Namen ausgenommen', () => {
  it('Persisch: Lied und Uhrzeit ohne eine einzige Ziffer 0–9', () => {
    expect(makeTr('fa')('Lied 5')).toContain(persisch('5'))
    expect(makeTr('fa')('Lied 5 · Ende ca. 20:45')).not.toMatch(/[0-9]/)
  })

  it('ein Name behält seine Ziffern: Der Zusatz gegen Namensgleichheit gehört zu ihm', () => {
    const text = makeTr('fa')(`Mikrofone · ${alsFreitext('Paul Beispiel 1')} · Lied 5`)
    expect(text).toContain('Paul Beispiel 1')
    expect(text).toContain(persisch('5'))
  })

  it('auch ein Name, den eine Regel samt seinem Atom verschluckt hat', () => {
    // „Jeremia 32 — <Name>" trifft die Buch-Regel im Ganzen (siehe `ohneAlleMarken`).
    const text = makeTr('fa')(`Bibellesung · Jeremia 32 — ${alsFreitext('Paul Beispiel 2')}`)
    expect(text).toContain('Paul Beispiel 2')
    expect(text).toContain(persisch('32'))
  })

  it('Gegenprobe: Deutsch bleibt bei 0–9', () => {
    expect(makeTr('de')('Lied 5 · Ende ca. 20:45')).toBe('Lied 5 · Ende ca. 20:45')
  })
})

describe('fill: Zahlen in den Ziffern der Oberflächensprache', () => {
  afterEach(() => anzeigeSpracheSetzen('de'))

  it('Persisch: eine Zahl und ein Text nur aus Ziffern („19:30", „20/23")', () => {
    anzeigeSpracheSetzen('fa')
    expect(fill('{n} نفر', { n: 3 })).toBe(`${persisch('3')}${NBSP}نفر`)
    expect(fill('{zeit}', { zeit: '19:30' })).toBe(persisch('19:30'))
    expect(fill('{a}', { a: '20/23' })).toBe(persisch('20/23'))
  })

  it('ein Text mit Buchstaben bleibt: ein Name, ein Anmelde-Code', () => {
    anzeigeSpracheSetzen('fa')
    expect(fill('{name}', { name: 'Paul Beispiel 1' })).toBe('Paul Beispiel 1')
    expect(fill('{code}', { code: 'K7RD 2QWM' })).toBe('K7RD 2QWM')
  })

  it('die Ziffern im Text der Vorlage selbst bleiben — etwa „S-89"', () => {
    anzeigeSpracheSetzen('fa')
    expect(fill('S-89 · {n}', { n: 2 })).toBe(`S-89 · ${persisch('2')}`)
  })

  it('Gegenprobe: Deutsch bleibt bei 0–9', () => {
    anzeigeSpracheSetzen('de')
    expect(fill('{n} Personen', { n: 3 })).toBe(`3${NBSP}Personen`)
  })
})
