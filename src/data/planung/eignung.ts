/**
 * **Wer auf einen Platz passt** — die Regel, nach der das Zuteilungsblatt
 * seine Auswahl filtert (`kandidaten`), als eigene Funktion.
 *
 * Gebraucht wird sie an zwei Stellen, und an beiden muss sie dasselbe sagen:
 * beim Zuteilen (wer steht zur Wahl?) und wenn sich eine Person ändert (an
 * welchen ihrer künftigen Plätze passt sie danach nicht mehr? — T182,
 * `freiwerden.ts`). Lagen die Regeln nur im Blatt, gäbe ein Platz frei, den
 * das Blatt ihr gleich wieder anböte, oder er bliebe besetzt, obwohl sie dort
 * niemand mehr wählen könnte.
 *
 * Nicht Teil der Regel ist, was das Blatt nur **anzeigt**: abwesend, an diesem
 * Tag schon eingeteilt, die Auslastung. Wer abwesend ist, steht dort trotzdem
 * zur Wahl — weiter unten, mit Hinweis.
 */

import { ratgeberSlot, slotsOf } from '../aux-class'
import { isQualified, isSong, passtZumPaar } from '../helpers'
import type { Person, SlotSelection, Week } from '../types'

/** Was die Regel aus dem Zustand braucht. */
export interface EignungsDaten {
  weeks: readonly Week[]
  /** Für den Gesprächsführer oder -partner gegenüber (`passtZumPaar`). */
  persons: readonly Person[]
}

/**
 * Passt eine Person auf den Platz `sel`?
 *
 *  - **Treffpunkt**: wer Treffpunkte leitet (Bereich `treffpunkt`).
 *  - **Redner-Platz** des öffentlichen Vortrags (T29): jeder Älteste und
 *    Dienstamtgehilfe (Betreiber, 4.10.2026). Eingeteilt wird er ohnehin von
 *    Hand, nie automatisch — ein eigener Aufgabenbereich wäre Pflege ohne
 *    Nutzen. Am Platz steht weiter `vortrag`; entschieden wird am Redner-Platz
 *    (`sel.guest` = `isSpeakerRole`). Die Plätze des Kreisaufsehers fragt das
 *    Blatt gar nicht erst (`kreisaufseherPlatz` in `kandidaten`).
 *  - **Sonst** der Bereich des Platzes, wo er einen nennt, und das Geschlecht:
 *    Plätze nur für Brüder (Vortrag eines Schülers, Ratgeber), und Führer und
 *    Partner eines Gesprächs passen zueinander — gleiches Geschlecht oder
 *    derselbe Haushalt, gemessen am Führer **desselben Raums**.
 *
 * Gruppen-Plätze (Reinigung) nehmen keine Person; die Frage stellt sich dort
 * nicht.
 */
export function passtAufPlatz(daten: EignungsDaten, sel: SlotSelection): (p: Person) => boolean {
  if (sel.kind === 'fs') return leitetTreffpunkte
  if (sel.groups) return () => false
  const darf =
    sel.kind === 'part' && sel.guest
      ? (p: Person) => p.role === 'aeltester' || p.role === 'dienstamtgehilfe'
      : (p: Person) => !sel.priv || isQualified(p, sel.priv)
  const geschlechtOk = geschlechtsPruefung(daten, sel)
  return (p) => darf(p) && geschlechtOk(p)
}

/**
 * Treffpunkte leitet, wer den Bereich hat — an jedem Treffpunkt gleich, also
 * eine Frage an die Person allein. Ebenso wählt der Plan der Gruppenbesuche
 * den Besucher: Er leitet in seiner Woche die Treffpunkte der Gruppe.
 */
export function leitetTreffpunkte(p: Person): boolean {
  return isQualified(p, 'treffpunkt')
}

/**
 * Geschlechtsregeln der Schülerteile: der Platz selbst kann brüder-only sein
 * (Vortrag, Ratgeber), und ein Gesprächspartner muss zum Gesprächsführer
 * passen — zum Führer **desselben Raums**. Wurde er immer im Hauptsaal
 * gesucht, richtete sich die Zusätzliche Klasse nach dem falschen Platz; die
 * Auto-Zuteilung macht es richtig und begründet es ausdrücklich
 * (planung/waehler.ts).
 *
 * Den Ratgeber fragte die Liste bis zum 16.10.2026 nicht: Eine Schwester mit
 * versehentlich gesetztem Bereich stand zur Wahl, obwohl der Platz `male` trägt.
 */
function geschlechtsPruefung(daten: EignungsDaten, sel: Exclude<SlotSelection, { kind: 'fs' }>): (p: Person) => boolean {
  if (sel.kind === 'ratgeber') {
    const meeting = daten.weeks[sel.wi]?.[sel.tab]
    const nurBrueder = meeting ? ratgeberSlot(meeting).male === true : false
    return (p: Person) => !(nurBrueder && p.female)
  }
  if (sel.kind !== 'part') return () => true
  const item = daten.weeks[sel.wi]?.[sel.tab].sections[sel.si]?.items[sel.ii]
  if (!item || isSong(item)) return () => true
  const plaetze = slotsOf(item, sel.aux === true)
  const platz = plaetze[sel.ni]
  // Führer und Partner passen zueinander, gleich, wer zuerst dasteht.
  const passt = passtZumPaar(plaetze, platz, daten.persons)
  return (p: Person) => !(platz?.male && p.female) && passt(p)
}
