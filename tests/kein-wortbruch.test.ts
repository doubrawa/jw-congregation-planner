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
  // Die schmale Leiste am Tablet: unter dem Zeichen 76 px für „Zusammenkünfte".
  ['app/menue.css', '.leisten-text'],
  [EINSTELLUNGEN, '.einst-zeile-name'],
  ['bausteine/bausteine.css', '.spur-name'],
  // Die Spalte ist so breit wie die des Plans darunter: „Königreichssaal" ragte bei 320 px hinaus.
  ['trolleys/trolleys.css', '.trolley-spaltenkopf > *'],
  // Zwei Reiter fest nebeneinander: „воскресен|ье", „dimanch|e" bei 320 px.
  ['components/components.css', '.meeting-tab-name'],
  // „вспомогательными" ragte bei 320 px und Stufe 1,45 aus dem Hinweis.
  ['auswertung/auswertung.css', '.aw-hinweis-detail'],
  // „Планирование" ragte bei 1400 px und 1,45 aus der Wochenspalte beim Planen;
  // eine breitere Spalte nahm den Platz dem Plan, dort brach dann „Hoffman|n".
  ['planen/planen.css', '.wochen-spalte-titel'],
  // „Dienstvortrag statt Versammlungsbibelstudium" ragte bei 320 px 39 px aus einer Option.
  ['bausteine/bausteine.css', '.option-text'],
  // „Возвещатель" ragte am Desktop bei 1,45 aus der Spalte neben dem Bild einer Person.
  ['personen/personen.css', '.person-unter'],
  // Die Titel im Kopf am Handy (T144): „Zusammenkünfte" wurde bei 320 px und
  // 1,45 mit „…" abgeschnitten. Dieselbe Regel gilt für den Kopf des Planens
  // (`.planenkopf-titel`); dass „Fertig" dort umrückt, prüft `kopf-titel.test.ts`.
  ['app/menue.css', '.unterseitenkopf-titel'],
  // Die große Karte der nächsten Aufgabe (Start, Meine Aufgaben): „Versammlungsbibelstudium"
  // stand am Handy des Betreibers (393 px, Stufe 1,15) über den Rand hinaus, bei 412 px und
  // Stufe 1,45 um 142 px (26.10.2026).
  ['aufgaben/aufgaben.css', '.aufgabe-titel'],
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

  // Chrome trennt so spät wie möglich. Ein Programmpunkt kommt aus den Daten und
  // kann keine weiche Trennstelle an der Fuge tragen (26.10.2026); ein Name im
  // Menü steht auch als Seitentitel, wo eine feste Stelle nicht passen muss (27.10.2026).
  it.each([
    ['aufgaben/aufgaben.css', '.aufgabe-titel', '„Versammlungsbibel-studium", nicht „…bibelstu-dium"'],
    ['app/menue.css', '.leisten-text', '„Einstel-lungen", nicht „Einstellun-gen"'],
    ['app/menue.css', '.menue-eintrag-text', '„asigna-ciones", nicht „asignacio-nes"'],
  ] as const)('%s %s: nach dem Trennstrich bleiben fünf Buchstaben — %s', (datei, selektor, _beispiel) => {
    expect(deklarationen(datei, selektor)).toMatch(/hyphenate-limit-chars:\s*auto auto 5;/)
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
      /grid-template-columns:[^;]* minmax\(calc\(420px - 124px \* max\(0, var\(--fs\) - 1\)\), 1fr\)/,
    )
  })

  it('am breiten Fenster wird die Personenliste nicht breiter als ein Bildschirm — den Platz bekommt die Person', () => {
    // Am Bildschirm des Betreibers (25.10.2026) war die Liste über 2000 px breit, die Person 420.
    const raster = deklarationen('personen/personen.css', '.personen-raster')
    expect(raster).toMatch(/grid-template-columns:\s*minmax\(0, 760px\) /)
    // Darüber wächst die Person, bis sie ebenso breit ist.
    expect(raster).toMatch(/max-width:\s*1520px/)
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

  it('neben einem langen Wert bleibt der Name einer Einstellung ganz — der Wert gibt nach (T137)', () => {
    /*
     * Am Handy des Betreibers (24.10.2026) stand neben „Rohrbachring 59
     * Ichenhausen" „König-/reichs-/saal" in drei Zeilen: Die Spalte des Namens
     * durfte bis auf null schrumpfen, und Chrome rechnet die Trennstellen zur
     * Mindestbreite. Gemessen im echten Chrome, zwölf Sprachen, 320–768 px,
     * Stufe 1–1,45: vorher in 14 von 288 Lagen ein Bruch im Wort, danach in
     * keiner (Werkzeug aus T128).
     */
    expect(deklarationen(EINSTELLUNGEN, '.einst-zeile')).toMatch(
      /grid-template-columns:\s*minmax\(min-content, 1fr\) minmax\(0, auto\) 20px/,
    )
    const name = deklarationen(EINSTELLUNGEN, '.einst-zeile .einst-zeile-name')
    expect(name).toMatch(/^\s*hyphens:\s*manual/m)
    expect(name).toMatch(/-webkit-hyphens:\s*manual/)
    // Der Wert endet mit „…", statt die Zeile zu sprengen.
    expect(deklarationen(EINSTELLUNGEN, '.einst-zeile-wert')).toMatch(/text-overflow:\s*ellipsis/)
  })

  it('passen zwei Knöpfe im Fuß eines Blatts nicht nebeneinander, rückt der letzte nach unten', () => {
    expect(deklarationen('components/overlays.css', '.sheet-fuss-ende')).toMatch(/flex-wrap:\s*wrap/)
  })
})

/*
 * Knöpfe nebeneinander im Fuß eines Blatts: als zwei feste Spalten ragte bei
 * 320 px und Stufe 1,45 „Hinzufügen" 19 px aus seinem Knopf, „Zurücksetzen"
 * 18 px — in neun Blättern schon auf Deutsch (Rest aus T128, 20.10.2026).
 */
describe('Im Fuß eines Blatts teilen sich die Knöpfe die Breite, bis einer umrückt', () => {
  const O = 'components/overlays.css'

  it('der Fuß und jede Reihe von Knöpfen darin brechen um — eine Regel für beide', () => {
    // `deklarationen` findet eine Regel für mehrere Selektoren an ihrem letzten.
    const quelle = Object.fromEntries(cssDateien())[O] ?? ''
    expect(quelle).toMatch(/\.sheet-fuss,\s*\.knopf-reihe \{/)
    expect(quelle).toMatch(/\.sheet-fuss > \*,\s*\.knopf-reihe > \* \{/)
    expect(deklarationen(O, '.knopf-reihe')).toMatch(/flex-wrap:\s*wrap/)
    const knopf = deklarationen(O, '.knopf-reihe > *')
    expect(knopf).toMatch(/flex:\s*1 1 0/)
    // Trennung und `anywhere` senkten die Mindestbreite: Das Wort bräche, statt dass der Knopf umrückt.
    expect(knopf).not.toMatch(/min-width:\s*0|hyphens|anywhere/)
    expect(knopf).toMatch(/max-width:\s*100%/)
  })

  it('neben dem Hauptknopf bleibt der leise so breit wie sein Wort („Drucken", „Abbrechen")', () => {
    expect(deklarationen(O, '.sheet-fuss--haupt > :first-child')).toMatch(/flex-grow:\s*999/)
    expect(deklarationen(O, '.sheet-fuss--haupt > :last-child')).toMatch(/flex-basis:\s*auto/)
  })

  it('kein Fuß steht mehr als festes Raster', () => {
    // Abgeleitet statt aufgezählt: jede Regel, deren Selektor einen Fuß nennt.
    const raster: string[] = []
    for (const [datei, text] of cssDateien()) {
      const ohneKommentare = text.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of ohneKommentare.matchAll(/([^{}]*fuss[^{}]*)\{([^{}]*)\}/g)) {
        if (/grid-template-columns|grid-auto-columns/.test(m[2] ?? '')) raster.push(`${datei}: ${(m[1] ?? '').trim()}`)
      }
    }
    expect(raster).toEqual([])
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
    // Die Richtung ausdrücklich: `.karte` daneben ist eine Spalte (`flex-richtung.test.ts`).
    expect(deklarationen(A, '.aw-kennzahlen')).toMatch(/flex-flow:\s*row wrap/)
    const kennzahl = deklarationen(A, '.aw-kennzahl')
    expect(kennzahl).toMatch(/flex:\s*1 1 0/)
    expect(kennzahl).not.toMatch(/min-width:\s*0/)
    expect(deklarationen(A, '.aw-kennzahl-text')).not.toMatch(/anywhere/)
  })

  it('die Reiter der Zusammenkünfte teilen sich die Breite — passt ein Wochentag nicht, rückt die Bearbeiten-Karte um', () => {
    // Neben der Karte blieben beim Planen bei 320 px 74 px: „niedziel|a", „Tuesda|y" ab Stufe 1,15.
    const C = 'components/components.css'
    expect(deklarationen(C, '.meeting-tabs')).toMatch(/flex-wrap:\s*wrap/)
    const reiter = deklarationen(C, '.meeting-tab')
    expect(reiter).toMatch(/flex:\s*1 1 0/)
    expect(reiter).not.toMatch(/min-width:\s*0/)
    // `anywhere` senkte die Mindestbreite: Das Wort bräche, statt dass die Karte umrückt.
    expect(deklarationen(C, '.meeting-tab-name')).not.toMatch(/anywhere/)
    const karte = deklarationen(C, '.meeting-tab--icon')
    expect(karte).toMatch(/flex:\s*none/)
    expect(karte).toMatch(/margin-inline-start:\s*auto/)
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
    // Bei den Zusagen ragte neben „Enviar recordatorio" der Satz zur Erinnerung bis 87 px hinaus (320 px).
    ['planen/planen.css', '.zusagen-erinnern', '.zusagen-erinnern > .klein-text', '.zusagen-erinnern > .knopf-pille'],
    // Neben Schalter und Knopf ragte „Interlocuteur" bei 320 px und Stufe 1,15 hinaus.
    ['planen/planen.css', '.s89-druck-row', '.s89-druck-count', '.s89-druck-row > .switch'],
    // Neben der Lage ragte in der Planung die gebundene Spanne bei 320 px bis 38 px aus ihrem Knopf.
    ['planen/planen.css', '.wochen-karte-kopf', '.wochen-karte-knopf', '.wochen-karte-lage'],
    // Neben „vor 2 Stunden" brach der Titel einer Mitteilung bei 320 px in allen Sprachen.
    ['mitteilungen/mitteilungen.css', '.mitteilung-kopf', '.mitteilung-titel', '.mitteilung-zeit'],
    // Neben „Verlegen" ragte in „Woche einrichten" gebunden „Dienstag, 29. September · 19:00" hinaus.
    ['planen/planen.css', '.einrichten-zeile', '.einrichten-zeile-text', '.einrichten-zeile > .verweis-leise'],
  ])('%s %s: passt das Daneben nicht neben den Text, rückt es um', (datei, zeile, text, daneben) => {
    expect(deklarationen(datei, zeile)).toMatch(/flex-wrap:\s*wrap/)
    const spanne = deklarationen(datei, text)
    expect(spanne).toMatch(/flex:\s*1 1 0/)
    expect(spanne).not.toMatch(/min-width:\s*0/)
    expect(deklarationen(datei, daneben)).toMatch(/margin-inline-start:\s*auto/)
  })

  it('bei den Zusagen gelten dieselben Regeln für jede Zeile — „Zuteilen" und der Haken rücken ebenso um', () => {
    // `deklarationen` findet eine Regel für mehrere Selektoren nur an ihrem letzten.
    const quelle = Object.fromEntries(cssDateien())['planen/planen.css'] ?? ''
    expect(quelle).toMatch(/\.zusage-zeile,\s*\.zusagen-erinnern \{/)
    expect(quelle).toMatch(/\.zusage-text,\s*\.zusagen-erinnern > \.klein-text \{/)
    expect(quelle).toMatch(/\.zusage-zeile > :not\(\.zusage-text\),\s*\.zusagen-erinnern > \.knopf-pille \{/)
  })

  it('in der Wochenspalte am Desktop bleibt die Lage, wo sie war — sie steht dort neben der Unterzeile', () => {
    // Der Kopf löst sich dort auf (`display: contents`); ein umgerückter Rand stünde rechts.
    expect(deklarationen('planen/planen.css', '.wochen-spalte .wochen-karte-lage')).toMatch(/margin-inline-start:\s*0/)
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

  it('am Desktop stehen die Trolley-Listen nebeneinander, solange jede ihr längstes Wort fasst — „Programările tale" ragte 52 px hinaus', () => {
    const T = 'trolleys/trolleys.css'
    const DESKTOP = '@media (min-width: 1180px)'
    // In zwei festen Spalten (1180 px, Stufe 1,45) ragten die Titel hinaus, „współpracow|nik" brach.
    const listen = deklarationen(T, '.trolley-ansicht.is-desktop .trolley-listen', DESKTOP)
    expect(listen).toMatch(/flex-flow:\s*row wrap/)
    expect(listen).not.toMatch(/grid-template-columns/)
    const liste = deklarationen(T, '.trolley-ansicht.is-desktop .trolley-listen > *', DESKTOP)
    expect(liste).toMatch(/flex:\s*1 1 0/)
    expect(liste).not.toMatch(/min-width:\s*0/)
  })

  it('in den Bereichen der Auswertung ist die Spalte der Zahl so breit wie ihr breitestes „nie" — „niciodată" ragte 16 px hinaus', () => {
    const A = 'auswertung/auswertung.css'
    expect(deklarationen(A, '.aw-bereiche')).toMatch(
      /grid-template-columns:\s*minmax\(0, 9em\) minmax\(0, 1fr\) minmax\(3\.2em, max-content\)/,
    )
    // Die Zeilen teilen sich die Spalten der Liste — die Balken enden in einer Flucht.
    expect(deklarationen(A, '.aw-bereich')).toMatch(/grid-template-columns:\s*subgrid/)
  })

  it('in den Ballungen der Auswertung rückt das Was unter das Kästchen — „Mikrof|one", „4 Woche|n" brachen bei 320 px', () => {
    const A = 'auswertung/auswertung.css'
    expect(deklarationen(A, '.aw-ballung')).toMatch(/flex-wrap:\s*wrap/)
    const was = deklarationen(A, '.aw-ballung-was')
    expect(was).toMatch(/flex:\s*1 1 0/)
    // Trennung und `anywhere` senkten die Mindestbreite: Das Wort bräche, statt dass das Was umrückt.
    expect(was).not.toMatch(/min-width:\s*0|hyphens|anywhere/)
  })

  it('im Kalender eines Zeitraums steht „Bis" unter „Von", sobald eines sein Datum nicht fasst — „niedz., 25 października" ragte 65 px hinaus', () => {
    const B = 'bausteine/bausteine.css'
    expect(deklarationen(B, '.kal-enden')).toMatch(/flex-wrap:\s*wrap/)
    const ende = deklarationen(B, '.kal-ende')
    expect(ende).toMatch(/flex:\s*1 1 0/)
    expect(ende).toMatch(/max-width:\s*100%/)
    // Trennung und `anywhere` senkten die Mindestbreite: Das Datum bräche, statt dass „Bis" umrückt.
    expect(ende).not.toMatch(/min-width:\s*0|hyphens|anywhere/)
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

  it('Treffpunkte: Wird der Tag zu schmal, steht die Uhrzeit über dem Text — „Congregati|on" bei 320 px', () => {
    expect(deklarationen('programm/programm.css', '.treff-tag')).toMatch(/container-type:\s*inline-size/)
    // Ansehen: unter 12 em.
    expect(deklarationen('programm/programm.css', '.treff-punkt', '@container (max-width: 12em)')).toMatch(
      /grid-template-areas:\s*'zeit zeit'\s*'text text'/,
    )
    // Planen, mit dem ✕ daneben: unter 16 em.
    const P = '@container (max-width: 16em)'
    expect(deklarationen('planen/planen.css', '.treff-planen-kopf', P)).toMatch(/grid-template-areas:\s*'zeit \.'\s*'text text'/)
    expect(deklarationen('planen/planen.css', '.treff-planen-kopf.is-aenderbar', P)).toMatch(
      /grid-template-areas:\s*'zeit \. x'\s*'text text text'/,
    )
    expect(deklarationen('planen/planen.css', '.treff-leiter-zeile', P)).toMatch(/padding-inline-start:\s*0/)
    // Der Grundplan im selben Tag: „Congreg|ation", „Königreich|ssaal" brachen bei 320 px und 1,45.
    expect(deklarationen('planen/planen.css', '.regel-zeile', P)).toMatch(/grid-template-areas:\s*'zeit \. pfeil'\s*'text text text'/)
  })

  it('Hinweise der Auswertung: unter 12 em gibt der Pfeil seinen Platz an den Text ab — „обязанностями: |4" bei 320 px', () => {
    const A = 'auswertung/auswertung.css'
    expect(deklarationen(A, '.aw-hinweise')).toMatch(/container-type:\s*inline-size/)
    expect(deklarationen(A, '.aw-hinweis > .zeichen', '@container (max-width: 12em)')).toMatch(/display:\s*none/)
  })
})

describe('Ein Wort ohne Trennregeln seiner Sprache bekommt eine Trennstelle', () => {
  const SHY = String.fromCharCode(0xad)

  beforeAll(async () => {
    await Promise.all([loadOverlay('tr'), loadOverlay('pl'), loadOverlay('en'), loadOverlay('ro'), loadOverlay('ru')])
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

  // Die Spur: drei Schritte nebeneinander, bei 320 px je ein Drittel (Weiterer
  // Plan, Absage, Woche, Zusagen, „Plan senden"). Die übrigen Sprachen trennen
  // dort nach ihren Regeln („Abge-schlos-sen").
  it.each([
    ['pl', 'spurVeroeffentlicht', 'Opublikowa|ny', `Opubli${SHY}kowany`],
    ['pl', 'spurAbgeschlossen', 'Zakończo|ny', `Zakoń${SHY}czony`],
    ['pl', 'spurDuSagstAb', 'Odwołuje|sz', `Odwo${SHY}łujesz`],
    ['pl', 'spurPlanerErfaehrt', 'informacj|ę', `Planista dostaje infor${SHY}mację`],
    ['pl', 'spurNeuZugeteilt', 'Przydzielon|e', `Przy${SHY}dzielone na nowo`],
    ['pl', 'spurZusagen', 'Potwierdzen|ia', `Potwier${SHY}dzenia`],
    ['ro', 'spurPlanerErfaehrt', 'Planificatoru|l', `Plani${SHY}fica${SHY}torul află`],
    ['ro', 'spurNeuZugeteilt', 'Repartiza|t', `Repar${SHY}tizat din nou`],
    ['ro', 'spurZusagen', 'Confirmăr|i', `Confir${SHY}mări`],
    ['tr', 'spurAbgeschlossen', 'Tamamla|ndı', `Tamam${SHY}landı`],
    ['tr', 'spurDuSagstAb', 'çekiliyors|un', `Görevden çekili${SHY}yorsun`],
    // Ein großgeschriebenes englisches Wort trennt Chrome nie.
    ['en', 'spurAbgeschlossen', 'Complete|d', `Com${SHY}pleted`],
    ['en', 'spurNeuZugeteilt', 'Reassign|ed', `Reas${SHY}signed`],
    ['en', 'spurZusagen', 'Confirmatio|ns', `Confir${SHY}mations`],
  ] as const)('Spur, %s %s: brach bei 320 px „%s" — es trennt an seiner Trennstelle', (lang, schluessel, _bruch, wert) => {
    expect(dict(lang)[schluessel]).toBe(wert)
  })

  it('Englisch: „Assignments" brach fett in der schmalen Leiste „Assignment|s" — es trennt nach „Assign"', () => {
    expect(dict('en').navAufgaben).toBe(`Assign${SHY}ments`)
    // Nicht in „My Assignments": Dort zog Chrome „My Assign-ments" dem Umbruch am
    // Leerzeichen vor — in der Leiste am Desktop schon bei Stufe 1 (27.10.2026).
    expect(dict('en').navAufgabenLong).toBe('My Assignments')
  })

  it('Russisch: Chrome trennt „Планирование" so spät wie möglich („Планирован-ие") — die Trennstelle steht an der Silbe', () => {
    // Der Titel der Wochenspalte beim Planen, bei 1400 px und Stufe 1,45.
    expect(dict('ru').dashPlanung).toBe(`Плани${SHY}рование`)
  })
})
