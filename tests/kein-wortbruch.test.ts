import { beforeAll, describe, expect, it } from 'vitest'
import { dict, loadOverlay } from '../src/i18n/ui'
import { cssDateien, deklarationen } from './css-quellen'

/**
 * **Kein Bruch mitten im Wort, auch bei großer Schrift** (T128).
 *
 * Gemessen am 18.10.2026 im echten Chrome mit Trennwörterbüchern, zwölf
 * Sprachen, 320 bis 1440 px, Schriftstufe 1 und 1,45: 109 Wörter brachen ohne
 * Strich mitten im Wort („Değerlendir|me"), drei Seiten waren zu breit, acht
 * zeigten einen waagerechten Rollbalken. Geholfen hat Platz statt Trennung —
 * Zeilen, die bei großer Schrift umstellen, und Leisten, die mit der Schrift
 * wachsen — und wo der Platz knapp bleibt, die Trennung nach den Regeln der
 * Sprache. Chrome hat keine für Polnisch, Rumänisch, Türkisch, Arabisch und
 * Persisch; dort bricht `overflow-wrap` notfalls ohne Strich.
 *
 * jsdom rechnet kein Layout. Gesichert ist hier, dass die Regeln dastehen, die
 * es im Browser richten — wie in `bereich-leiste.test.ts`. Das Messwerkzeug
 * liegt in `docs/analyse/t128-umbruch/`.
 */

const EINSTELLUNGEN = 'einstellungen/einstellungen.css'
const SCHMAL = '@container (max-width: 15em)'

describe('Bei großer Schrift bekommt ein langes Wort Platz oder trennt', () => {
  it.each([
    ['bausteine/bausteine.css', '.seitentitel'],
    ['bausteine/bausteine.css', '.schalter-text'],
    ['components/overlays.css', '.sheet-title'],
    ['app/menue.css', '.menue-eintrag-text'],
    [EINSTELLUNGEN, '.einst-zeile-name'],
    ['bausteine/bausteine.css', '.spur-name'],
  ])('%s %s trennt nach den Regeln der Sprache, statt hinauszuragen', (datei, selektor) => {
    const rumpf = deklarationen(datei, selektor)
    expect(rumpf).toMatch(/^\s*hyphens:\s*auto/m)
    // Safari trennt nur mit Präfix.
    expect(rumpf).toMatch(/-webkit-hyphens:\s*auto/)
  })

  it('… und bricht ohne Trennregeln der Sprache notfalls um, statt hinauszuragen', () => {
    for (const [datei, selektor] of [
      ['bausteine/bausteine.css', '.seitentitel'],
      ['bausteine/bausteine.css', '.schalter-text'],
      ['components/overlays.css', '.sheet-title'],
      ['app/menue.css', '.menue-eintrag-text'],
      [EINSTELLUNGEN, '.einst-zeile-name'],
      ['bausteine/bausteine.css', '.spur-name'],
    ] as const) {
      expect(deklarationen(datei, selektor), selektor).toMatch(/overflow-wrap:\s*(break-word|anywhere)/)
    }
  })

  it('steht ein Knopf neben dem Seitentitel, rückt der Knopf in die nächste Zeile, bevor der Titel trennt', () => {
    // Trennung senkt in Chrome die Mindestbreite: „Personen" trennte sonst
    // „Perso-nen", statt „Person anlegen" unter den Titel rücken zu lassen.
    // Eine Regel für alle drei Zeilen; `deklarationen` findet sie an ihrem letzten Selektor.
    const quelle = Object.fromEntries(cssDateien())['bausteine/bausteine.css'] ?? ''
    expect(quelle).toMatch(/\.bereichstitel-zeile > \.seitentitel,\s*\.personen-kopf > \.seitentitel,\s*\.mitteilungen-kopf > \.seitentitel \{/)
    const titel = deklarationen('bausteine/bausteine.css', '.mitteilungen-kopf > .seitentitel')
    expect(titel).toMatch(/flex-shrink:\s*0/)
    expect(titel).toMatch(/max-width:\s*100%/)
    for (const [datei, zeile] of [
      ['bausteine/bausteine.css', '.bereichstitel-zeile'],
      ['personen/personen.css', '.personen-kopf'],
      ['mitteilungen/mitteilungen.css', '.mitteilungen-kopf'],
    ] as const) {
      expect(deklarationen(datei, zeile), zeile).toMatch(/flex-wrap:\s*wrap/)
    }
  })

  it('die Leisten wachsen mit der Schrift — bis Stufe 1 bleiben sie, wie sie waren', () => {
    // 88 px am Tablet, 248 px am Desktop bei Stufe 1; bei 1,45 rund 128 und 304 px.
    expect(deklarationen('app/menue.css', '.schmale-leiste')).toMatch(/width:\s*calc\(88px \* max\(1, var\(--fs\)\)\)/)
    expect(deklarationen('app/menue.css', '.leiste')).toMatch(/width:\s*max\(248px, calc\(124px \* \(1 \+ var\(--fs\)\)\)\)/)
  })

  it('was die Leiste am Desktop dazugewinnt, gibt die Person neben der Personenliste ab — die Liste bleibt so breit', () => {
    // Dieselbe Rechnung wie die Leiste: 124 px je Stufe über 1.
    expect(deklarationen('personen/personen.css', '.personen-raster')).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\) calc\(420px - 124px \* max\(0, var\(--fs\) - 1\)\)/,
    )
  })

  it('wird eine Karte der Einstellungen für die Schrift zu schmal, steht der Wert unter dem Namen', () => {
    expect(deklarationen(EINSTELLUNGEN, '.einst-karte')).toMatch(/container-type:\s*inline-size/)
    expect(deklarationen(EINSTELLUNGEN, '.einst-zeile:not(.einst-zeile--entfernbar)', SCHMAL)).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\) 20px/,
    )
    expect(deklarationen(EINSTELLUNGEN, '.einst-zeile-wert', SCHMAL)).toMatch(/grid-row:\s*2/)
    // Plus und Minus rücken unter den Namen des Dienstes.
    expect(deklarationen(EINSTELLUNGEN, '.hd-zeile', SCHMAL)).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/)
  })

  it('passen zwei Knöpfe im Fuß eines Blatts nicht nebeneinander, rückt der letzte nach unten', () => {
    expect(deklarationen('components/overlays.css', '.sheet-fuss-ende')).toMatch(/flex-wrap:\s*wrap/)
  })
})

/*
 * Platz statt Trennung, ohne Schwelle: Ein Text, der in einer Zeile neben etwas
 * anderem steht, wird nicht schmaler als sein längstes Wort (die Mindestbreite
 * eines Flex-Elements, `min-width: auto`). Passt das nicht mehr, rückt das
 * andere in die nächste Zeile. Ein `min-width: 0` hebt genau das auf — dann
 * schrumpft der Text und bricht mitten im Wort.
 */
describe('Was neben einem Namen steht, rückt darunter, statt ihn zu zerbrechen', () => {
  it('beim Planen rückt die Rolle unter den Namen — „Albr|echt" brach bei großer Schrift am Desktop', () => {
    expect(deklarationen('planen/planen.css', '.platz')).toMatch(/flex-wrap:\s*wrap/)
    const name = deklarationen('planen/planen.css', '.platz-name')
    expect(name).toMatch(/flex:\s*1 1 0/)
    expect(name).not.toMatch(/min-width:\s*0/)
    // Ganz ohne Notbremse ragte ein einzelnes sehr langes Wort hinaus.
    expect(name).toMatch(/max-width:\s*calc\(100% - 24px\)/)
    expect(name).toMatch(/overflow-wrap:\s*break-word/)
    // Die Rolle bleibt am Ende der Zeile, auch darunter.
    expect(deklarationen('planen/planen.css', '.platz-rolle')).toMatch(/margin-inline-start:\s*auto/)
  })

  it('in den Erinnerungen rückt die Einstellung unter den Text — „Pierwsz|e przypo|mnienie" brach bei 320 px', () => {
    expect(deklarationen('einstellungen/erinnerungen.css', '.erin-inhalt')).toMatch(/flex-wrap:\s*wrap/)
    const text = deklarationen('einstellungen/erinnerungen.css', '.erin-text')
    expect(text).toMatch(/flex:\s*1 1 0/)
    expect(text).not.toMatch(/min-width:\s*0/)
    expect(deklarationen('einstellungen/erinnerungen.css', '.erin-inhalt > :not(.erin-text)')).toMatch(
      /margin-inline-start:\s*auto/,
    )
  })
})

describe('Ein Wort ohne Trennregeln seiner Sprache bekommt eine Trennstelle', () => {
  const SHY = String.fromCharCode(0xad)

  beforeAll(async () => {
    await Promise.all([loadOverlay('tr'), loadOverlay('pl')])
  })

  it('Türkisch: „Değerlendirme" passt in keiner Stufe in die schmale Leiste — es trennt nach „Değerlen"', () => {
    expect(dict('tr').navAuswertung).toBe(`Değerlen${SHY}dirme`)
  })

  it('Polnisch: „Przypomnienia" brach als Titel bei 320 px „Przypomnieni|a" — es trennt nach „Przypo"', () => {
    expect(dict('pl').erinnerungenCard).toBe(`Przypo${SHY}mnienia`)
  })
})
