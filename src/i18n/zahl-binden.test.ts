import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from './langs'
import { dict, loadOverlay } from './ui'
import { fill } from './useT'
import { NBSP, zahlBinden } from './zahl-binden'

/**
 * **Eine Zahl bleibt bei ihrer Bezeichnung** (T128).
 *
 * Bei 320 px und großer Schrift brach „Personen: 26" vor der Zahl um, „3 kişi"
 * hinter ihr — gemessen im echten Chrome am 18.10.2026, 94 Stellen in allen
 * zwölf Sprachen. Seitdem schützt `fill` das Leerzeichen dazwischen. Geprüft
 * wird hier nicht eine Handvoll Beispiele, sondern **jede Vorlage aller zwölf
 * Wörterbücher**, in der eine Zahl hinter „: " oder vor einem Wort steht: Ein
 * neuer Text bekommt die Regel ohne Zutun, und bräche sie an einer Schrift oder
 * einem Satzzeichen, würde es hier rot.
 */

const CODES = APP_LANGS.map((l) => l.code)

beforeAll(async () => {
  await Promise.all(CODES.map((code) => loadOverlay(code)))
})

/** Jede Vorlage mit Platzhalter, jeder Platzhalter mit einer Zahl gefüllt. */
function vorlagenMitZahl(code: (typeof CODES)[number]): Array<{ schluessel: string; vorlage: string; text: string }> {
  return Object.entries(dict(code)).flatMap(([schluessel, wert]) => {
    if (typeof wert !== 'string' || !/\{\w+\}/.test(wert)) return []
    const zahlen = Object.fromEntries([...wert.matchAll(/\{(\w+)\}/g)].map((m) => [m[1]!, 26]))
    return [{ schluessel, vorlage: wert, text: fill(wert, zahlen) }]
  })
}

describe('In jeder Vorlage bleibt die Zahl bei ihrer Bezeichnung', () => {
  it.each(CODES)('%s: „Bezeichnung: {n}" bricht nicht vor der Zahl um', (code) => {
    const betroffen = vorlagenMitZahl(code).filter((v) => /: \{\w+\}/.test(v.vorlage))
    // Die Probe prüft echte Vorlagen, nicht keine: Jede Sprache hat solche.
    expect(betroffen.length, code).toBeGreaterThan(10)
    for (const { schluessel, text } of betroffen) {
      expect(text, `${code} ${schluessel}`).not.toMatch(/: 26/)
      expect(text, `${code} ${schluessel}`).toContain(`:${NBSP}26`)
    }
  })

  it.each(CODES)('%s: „{n} Personen" bricht nicht hinter der Zahl um', (code) => {
    const betroffen = vorlagenMitZahl(code).filter((v) => /\{\w+\} \p{L}/u.test(v.vorlage))
    for (const { schluessel, text } of betroffen) {
      expect(text, `${code} ${schluessel}`).not.toMatch(/26 \p{L}/u)
    }
  })

  it('in den Sprachen, die die Zahl voranstellen, gibt es solche Vorlagen auch', () => {
    // Sonst prüfte der Fall darüber nichts: Türkisch und Persisch schreiben
    // „{n} kişi", „{n} نفر".
    for (const code of ['tr', 'fa'] as const) {
      expect(vorlagenMitZahl(code).filter((v) => /\{\w+\} \p{L}/u.test(v.vorlage)).length, code).toBeGreaterThan(0)
    }
  })
})

describe('Was zahlBinden schützt — und was nicht', () => {
  it('der Doppelpunkt bleibt bei seiner Zahl, in jeder Schrift', () => {
    expect(zahlBinden('Personen: 26')).toBe(`Personen:${NBSP}26`)
    // Arabische und persische Ziffern sind Ziffern (\p{Nd}).
    expect(zahlBinden('الأشخاص: ٢٦')).toBe(`الأشخاص:${NBSP}٢٦`)
  })

  it('die Zahl bleibt beim Wort danach — auch mit Punkt, wie im Datum', () => {
    expect(zahlBinden('3 kişi')).toBe(`3${NBSP}kişi`)
    expect(zahlBinden('۲۶ نفر')).toBe(`۲۶${NBSP}نفر`)
    expect(zahlBinden('Montag, 7. September')).toBe(`Montag, 7.${NBSP}September`)
    expect(zahlBinden('1 Tag vorher')).toBe(`1${NBSP}Tag vorher`)
  })

  it('ein Wort vor der Zahl und eine Uhrzeit ohne Leerzeichen bleiben, wie sie sind', () => {
    expect(zahlBinden('Gruppe 1 · Lied 27')).toBe('Gruppe 1 · Lied 27')
    expect(zahlBinden('Beginn 19:30')).toBe('Beginn 19:30')
    // Ein Doppelpunkt vor einem Wort ist keine Bezeichnung einer Zahl.
    expect(zahlBinden('Hinweis: bitte bestätigen')).toBe('Hinweis: bitte bestätigen')
  })

  it('am Ende einer Uhrzeit bleibt „Uhr" bei der Zahl, die übrigen Wörter umbrechbar', () => {
    expect(zahlBinden('Am 7. September um 19:30 Uhr')).toBe(`Am 7.${NBSP}September um 19:30${NBSP}Uhr`)
  })
})
