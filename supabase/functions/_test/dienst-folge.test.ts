import { describe, expect, it } from 'vitest'
import { makeTr } from '../_shared/i18n/translate.ts'
import { type Eintrag, inDienstFolge, rumpfVon } from '../_shared/zuteilungen.ts'

/**
 * **Mehrere Hilfsdienste eines Termins alphabetisch — und nur sie.** Die
 * Nachricht einer Person nennt ihre Plätze in der Folge der Termine, das
 * Programm eines Abends vor seinen Diensten. Umgestellt werden nur Dienste
 * desselben Termins, nach dem Namen in der Sprache der Nachricht.
 */

const DI = 'Dienstag, 8. September · 19:00'
const SO = 'Sonntag, 13. September · 10:00'
const dienst = (datum: string, label: string): Eintrag => ({ datum, label, dienst: true })
const punkt = (datum: string, label: string): Eintrag => ({ datum, label })
const labels = (liste: readonly Eintrag[]) => liste.map((e) => e.label)
const ohne = (s: string): string => s

describe('inDienstFolge', () => {
  it('Dienste eines Termins nach dem Namen — das Programm davor bleibt, wo es steht', () => {
    const liste = [punkt(DI, 'Zeugnis geben'), dienst(DI, 'Ton / Video'), dienst(DI, 'Mikrofone')]
    expect(labels(inDienstFolge(liste, (e) => e, ohne, 'de'))).toEqual(['Zeugnis geben', 'Mikrofone', 'Ton / Video'])
  })

  it('Termine werden nicht vermischt — der Sonntag bleibt hinter dem Dienstag', () => {
    const liste = [dienst(DI, 'Ton / Video'), dienst(SO, 'Eingangsordner'), dienst(SO, 'Bühne')]
    expect(labels(inDienstFolge(liste, (e) => e, ohne, 'de'))).toEqual(['Ton / Video', 'Bühne', 'Eingangsordner'])
  })

  it('in der Sprache der Nachricht, Zahlen nach ihrem Wert — die Liste selbst bleibt unberührt', () => {
    const liste = [dienst(DI, 'Mikrofone'), dienst(DI, 'Ton / Video')]
    expect(labels(inDienstFolge(liste, (e) => e, makeTr('en'), 'en'))).toEqual(['Ton / Video', 'Mikrofone'])
    expect(labels(liste)).toEqual(['Mikrofone', 'Ton / Video'])
    const ordner = [dienst(DI, 'Ordner 10'), dienst(DI, 'Ordner 2')]
    expect(labels(inDienstFolge(ordner, (e) => e, ohne, 'de'))).toEqual(['Ordner 2', 'Ordner 10'])
  })

  it('der Rumpf: kanonisch für die Glocke, übersetzt für das Gerät', () => {
    const liste = [dienst(DI, 'Ton / Video'), dienst(DI, 'Mikrofone')]
    expect(rumpfVon(liste)).toBe(`${DI}: Mikrofone · ${DI}: Ton / Video`)
    const en = makeTr('en')
    expect(rumpfVon(liste, en, 'en')).toBe(`${en(DI)}: Audio / video · ${en(DI)}: Microphones`)
  })
})
