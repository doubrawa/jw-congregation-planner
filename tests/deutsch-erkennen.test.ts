import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from '../src/i18n/langs'
import { DE, dict, loadOverlay } from '../src/i18n/ui'
import { codeAnzeige, codeGruppiert, neuerCode } from '../supabase/functions/_shared/anmeldung.ts'
import { CODE_FORM, deutschFinder, ohneCodes } from './deutsch-erkennen'

/**
 * **Ein Anmelde-Code ist kein deutscher Rest** — der Detektor des
 * Sprach-Durchgangs (T123) darf ihn nicht melden, und er darf hinter dieser
 * Ausnahme kein Deutsch verstecken.
 *
 * In Russisch, Ukrainisch, Arabisch und Persisch gilt jedes lateinische Wort
 * als verdächtig. Seit es „Code anzeigen" im Profil gibt und der Link einer
 * Person einen Code trägt, stehen dort Codes wie „K7RD 2QWM" — der volle
 * Durchgang in allen Sprachen meldete sie als Deutsch, dazu einen angefangenen
 * Code im Feld der Anmeldung („XABA B"). Weggelassen wird genau das, was die
 * App selbst als Code zeigt (`codeGruppiert`). Hätte ein Text der App diese
 * Form („PLAN SEND" in Großbuchstaben), sähe der Detektor ihn nicht mehr —
 * darum die Wache über alle Wörterbücher.
 */

const FREMD_UND_NICHT_LATEINISCH = ['ru', 'uk', 'ar', 'fa'] as const

describe('Anmelde-Codes im Sprach-Durchgang', () => {
  beforeAll(async () => {
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
  })

  it.each(FREMD_UND_NICHT_LATEINISCH)('%s: ein Code zum Abtippen ist kein deutscher Rest', (lang) => {
    const finde = deutschFinder(lang, new Set())
    expect(finde('K7RD 2QWM')).toEqual([])
    expect(finde(`${dict(lang).codeEintippen}: K7RD 2QWM`)).toEqual([])
    // Ein angefangener Code im Feld der Anmeldung — so schreibt das Feld eine Eingabe.
    expect(finde('XABA B')).toEqual([])
  })

  it('Positivkontrolle: echte Codes aus der Funktion der App fallen alle heraus, mit und ohne Ziffern', () => {
    const finde = deutschFinder('ru', new Set())
    for (let i = 0; i < 300; i++) {
      const code = codeAnzeige(neuerCode())
      expect(finde(`Код: ${code}`), code).toEqual([])
    }
  })

  it('Gegenprobe: Deutsch und Englisch neben einem Code bleiben gemeldet', () => {
    const finde = deutschFinder('ru', new Set())
    expect(finde('K7RD 2QWM Abbrechen').map((r) => r.wort)).toEqual(['Abbrechen'])
    expect(finde('Show code: K7RD 2QWM').map((r) => r.wort)).toEqual(['Show', 'code'])
    // Großgeschrieben, aber mit I und O — nie ein Code.
    expect(finde('KEIN PLAN').map((r) => r.wort)).toEqual(['KEIN', 'PLAN'])
    // Zu kurz für die erste Gruppe — kein Code, also ein Wort.
    expect(finde('ABC DEF').map((r) => r.wort)).toEqual(['ABC', 'DEF'])
  })

  it('ohneCodes nimmt nur die Code-Form heraus, nicht den Satz drumherum', () => {
    expect(ohneCodes('Gib K7RD 2QWM ein').replace(/\s+/g, ' ')).toBe('Gib ein')
    expect(ohneCodes('PLAN SENDEN')).toBe('PLAN SENDEN')
  })

  it('Wache: kein Text der App sieht aus wie ein Code — sonst versteckte die Ausnahme ihn', () => {
    const inCodeForm: string[] = []
    for (const { code } of APP_LANGS) {
      const woerterbuch = code === 'de' ? DE : dict(code)
      for (const [schluessel, wert] of Object.entries(woerterbuch)) {
        for (const m of wert.matchAll(CODE_FORM)) if (codeGruppiert(m[0]) === m[0]) inCodeForm.push(`${code}.${schluessel}: ${m[0]}`)
      }
    }
    expect(inCodeForm).toEqual([])
    // Voraussetzung: Die Wache sähe einen solchen Text wirklich.
    expect([...'Bitte PLAN SEND drücken'.matchAll(CODE_FORM)].map((m) => m[0]).filter((s) => codeGruppiert(s) === s)).toEqual(['PLAN SEND'])
  })
})
