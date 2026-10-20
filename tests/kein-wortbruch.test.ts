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

/** Wo ein langes Wort trennt, statt hinauszuragen: [Datei, Selektor]. */
const TRENNT = [
  ['bausteine/bausteine.css', '.seitentitel'],
  ['bausteine/bausteine.css', '.schalter-text'],
  ['components/overlays.css', '.sheet-title'],
  ['app/menue.css', '.menue-eintrag-text'],
  [EINSTELLUNGEN, '.einst-zeile-name'],
  ['bausteine/bausteine.css', '.spur-name'],
  // Die Spalte ist so breit wie die des Plans darunter: „Königreichssaal" ragte bei 320 px hinaus.
  ['trolleys/trolleys.css', '.trolley-spaltenkopf > *'],
  // Zwei Reiter fest nebeneinander: „воскресен|ье", „dimanch|e" bei 320 px.
  ['components/components.css', '.meeting-tab-name'],
  // „вспомогательными" ragte bei 320 px und Stufe 1,45 aus dem Hinweis.
  ['auswertung/auswertung.css', '.aw-hinweis-detail'],
] as const

describe('Bei großer Schrift bekommt ein langes Wort Platz oder trennt', () => {
  it.each(TRENNT)('%s %s trennt nach den Regeln der Sprache, statt hinauszuragen', (datei, selektor) => {
    const rumpf = deklarationen(datei, selektor)
    expect(rumpf).toMatch(/^\s*hyphens:\s*auto/m)
    // Safari trennt nur mit Präfix.
    expect(rumpf).toMatch(/-webkit-hyphens:\s*auto/)
  })

  it.each(TRENNT)('%s %s bricht ohne Trennregeln der Sprache notfalls um, statt hinauszuragen', (datei, selektor) => {
    expect(deklarationen(datei, selektor)).toMatch(/overflow-wrap:\s*(break-word|anywhere)/)
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

  it('im Streifen des letzten Stands rückt „Neu laden" unter den Text — bei 320 px stand er in einer Spalte von drei Wörtern', () => {
    // 19.10.2026, mit „Verbindung langsam · Stand von …" (der längere Titel).
    expect(deklarationen('app/shell.css', '.offline-banner-inhalt')).toMatch(/flex-wrap:\s*wrap/)
    expect(deklarationen('app/shell.css', '.offline-banner-text')).toMatch(/flex:\s*1 1 10em/)
    expect(deklarationen('app/shell.css', '.offline-banner-inhalt > .knopf-pille')).toMatch(/margin-inline-start:\s*auto/)
  })

  it('in der Wahl rückt eine ganze Möglichkeit um — „Ciem|ny", „Grup|a 1", „wcześni|ej" brachen bei 320 px', () => {
    const B = 'bausteine/bausteine.css'
    const wahl = deklarationen(B, '.wahl')
    expect(wahl).toMatch(/display:\s*flex/)
    expect(wahl).toMatch(/flex-wrap:\s*wrap/)
    const knopf = deklarationen(B, '.wahl-knopf')
    expect(knopf).toMatch(/flex:\s*1 1 0/)
    // Trennung und `anywhere` senkten die Mindestbreite: Das Wort bräche, statt dass der Knopf umrückt.
    expect(knopf).not.toMatch(/min-width:\s*0|hyphens|anywhere/)
    expect(knopf).toMatch(/max-width:\s*100%/)
    // Vier kleine nebeneinander: Eine ganze Möglichkeit rückt um — nicht „Grupa / 2" neben „Grupa 1".
    expect(deklarationen(B, '.wahl--klein .wahl-knopf')).toMatch(/flex-basis:\s*auto/)
  })

  it('in den Kennzahlen der Auswertung rückt eine Zahl um — „Zuteilung|en" brach bei 320 px', () => {
    const A = 'auswertung/auswertung.css'
    expect(deklarationen(A, '.aw-kennzahlen')).toMatch(/flex-wrap:\s*wrap/)
    const kennzahl = deklarationen(A, '.aw-kennzahl')
    expect(kennzahl).toMatch(/flex:\s*1 1 0/)
    expect(kennzahl).not.toMatch(/min-width:\s*0/)
    expect(deklarationen(A, '.aw-kennzahl-text')).not.toMatch(/anywhere/)
  })

  it('in der Personenliste am Desktop rückt eine Zelle darunter — „Dienstamtgehi|lfe" brach bei 1180 px', () => {
    const P = 'personen/personen.css'
    expect(deklarationen(P, '.personen-zellen')).toMatch(/flex-wrap:\s*wrap/)
    const zelle = deklarationen(P, '.personen-zelle')
    expect(zelle).toMatch(/flex:\s*1 1 0/)
    expect(zelle).not.toMatch(/min-width:\s*0|anywhere/)
  })

  /*
   * Text und Daneben in einer umbrechenden Zeile. Seit Tag und Monat gebunden
   * sind (`wochenSpanne`, `tageSpanne`), wird eine Spanne nicht schmaler als
   * „20. September"; in Zeilen, deren Text auf null schrumpfen durfte, ragte sie
   * bei 320 px hinaus — dort rückt jetzt das Daneben um.
   */
  it.each([
    // In der Spalte der Wochen ragte „Programme pas encore récupéré" aus der Karte „Holen".
    ['planen/planen.css', '.holen-karte', '.holen-karte-text', '.holen-karte > .knopf-pille'],
    ['components/gruppenbesuche.css', '.gb-zeile-inhalt', '.gb-zeile-text', '.gb-zeile-inhalt > .gb-gruppe-pille'],
    ['programm/programm.css', '.gb-liste-zeile', '.gb-liste-woche', '.gb-liste-gruppe'],
    ['components/components.css', '.abw-zeile', '.abw-zeile-text', '.abw-entfernen'],
    ['components/weitere-plaene.css', '.wp-vorschau-zeile', '.wp-vorschau-wann', '.wp-vorschau-zeile > .wp-gruppe-wahl'],
    ['components/weitere-plaene.css', '.wp-liste-zeile', '.wp-liste-woche', '.wp-liste-wer'],
    // Neben „Присоединиться" blieben bei 320 px rund 60 px für Tag und Zeit.
    ['trolleys/trolleys.css', '.trolley-zeile', '.trolley-zeile-text', '.trolley-zeile > .zeichen'],
    // Neben dem 44-px-Pfeil ragte unter „Meine Aufgaben" „współpracownik:" 36 px hinaus.
    ['aufgaben/aufgaben.css', '.aufgaben-zeile', '.aufgaben-zeile > .angebot-text', '.aufgaben-zeile > :last-child'],
  ])('%s %s: passt das Daneben nicht neben den Text, rückt es um', (datei, zeile, text, daneben) => {
    expect(deklarationen(datei, zeile)).toMatch(/flex-wrap:\s*wrap/)
    const spanne = deklarationen(datei, text)
    expect(spanne).toMatch(/flex:\s*1 1 0/)
    expect(spanne).not.toMatch(/min-width:\s*0/)
    expect(deklarationen(datei, daneben)).toMatch(/margin-inline-start:\s*auto/)
  })

  it('im Blatt „Holen" rückt neben der gebundenen Spanne die Zahl der Punkte darunter', () => {
    // Eine Regel für Kopf, Abschnitt und Sprachen; `deklarationen` findet sie am letzten Selektor.
    expect(deklarationen('planen/planen.css', '.holen-sprachen')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('beim Planen der Gruppenbesuche bleibt der Pfeil rechts — er bricht nicht mit um', () => {
    // Zeile und Inhalt sind zweierlei: Nur der Inhalt (Text und Gruppe) bricht um.
    expect(deklarationen('components/gruppenbesuche.css', '.gb-zeile')).not.toMatch(/flex-wrap/)
    // Ein vergangener Besuch hat keinen Pfeil; seine Gruppe steht trotzdem in der
    // Flucht der übrigen (24 px Pfeil und 10 px Abstand).
    expect(deklarationen('components/gruppenbesuche.css', '.gb-zeile.is-vorbei')).toMatch(/padding-inline-end:\s*34px/)
  })

  it('unter „Meine Aufgaben" schrumpft der Text nicht unter sein längstes Wort — auch bei den Angeboten', () => {
    // `.angebot-text` setzt sonst `min-width: 0`; in der Zeile gilt die Mindestbreite des Inhalts.
    expect(deklarationen('aufgaben/aufgaben.css', '.aufgaben-zeile > .angebot-text')).toMatch(/min-width:\s*auto/)
  })
})

/*
 * Platz mit Schwelle: Wo eine Zeile aus Spalten besteht, misst sie sich selbst
 * (`container-type`) — in `em`, so wandert die Schwelle mit der Schriftstufe.
 * Die Schwellen sind im echten Chrome gemessen (20.10.2026); die Begründung
 * steht am CSS.
 */
describe('Wird eine Zeile für die Schrift zu schmal, stehen ihre Teile untereinander', () => {
  it('Personenliste: unter 24 em steht der Name über Gruppe und Stand', () => {
    const P = 'personen/personen.css'
    expect(deklarationen(P, '.personen-liste')).toMatch(/container:\s*personen-liste \/ inline-size/)
    expect(deklarationen(P, '.personen-zelle.personen-name', '@container personen-liste (max-width: 24em)')).toMatch(
      /flex-basis:\s*100%/,
    )
  })

  it('Hilfsdienste im Programm: Die Spalte des Dienstes wächst mit der Schrift, unter 15 em steht er über den Namen', () => {
    const P = 'programm/programm.css'
    const zeile = deklarationen(P, '.prog-dienst')
    expect(zeile).toMatch(/container-type:\s*inline-size/)
    // Mit fester Spalte brach bei 768 px und Stufe 1,3 „Eingangsordne|r".
    expect(zeile).toMatch(/grid-template-columns:\s*minmax\(0, calc\(132px \* var\(--fs\)\)\) minmax\(0, 1fr\)/)
    expect(deklarationen(P, '.prog-dienst-wer', '@container (max-width: 15em)')).toMatch(/grid-column:\s*1 \/ -1/)
  })

  it('Kacheln der Auswertung: unter 20 em steht jede allein — „Однообразное распределение" ragte bei 320 px hinaus', () => {
    const A = 'auswertung/auswertung.css'
    expect(deklarationen(A, '.aw-kacheln')).toMatch(/container-type:\s*inline-size/)
    expect(deklarationen(A, '.aw-kachel', '@container (max-width: 20em)')).toMatch(/grid-column:\s*1 \/ -1/)
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

  it('Polnisch: „współpracownik" ragte als Titel der Karte bei 320 px über den Rand — es trennt nach „współ"', () => {
    expect(dict('pl').trolleyPartnerGesucht).toBe(`Potrzebny współ${SHY}pracownik`)
  })
})
