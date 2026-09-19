/**
 * **Alle Plätze einer Zusammenkunft — ein Durchlauf für alle, die ihn brauchen.**
 *
 * Eine Zuteilung kann an vier Orten stehen:
 *
 *   1. `item.names`          — Hauptsaal
 *   2. `item.aux`            — Zusätzliche Klasse (S-38, Absatz 26)
 *   3. `meeting.auxRatgeber` — Ratgeber der Klasse, einer je Zusammenkunft
 *   4. `meeting.helpers`     — Hilfsdienste
 *
 * Der Hauptsaal war zuerst da; die drei anderen kamen später dazu, und seither
 * ist derselbe Fehler immer wieder passiert: eine Funktion wurde erweitert, die
 * nächste nicht. `partWorkload` zählte die halbe Klasse nicht mit,
 * `mapPersonSlots` benannte sie nicht um (T38), die `used`-Menge der
 * Auto-Zuteilung übersah sie, `pidsNachtragen` gab ihr die Person-Id nie
 * zurück. Jedes Mal war die Wirkung still: Der Platz zählte nirgends, und
 * niemand sah es — die Klasse steht in der Ansicht **neben** dem Hauptsaal,
 * nicht darin.
 *
 * `programmPlaetze` (helpers.ts) hat davon die ersten beiden Sorten
 * zusammengefasst. Die Aufzählung blieb trotzdem an vierzehn Stellen stehen,
 * weil jede den Ratgeber und die Hilfsdienste selbst dazuschrieb —
 * `alle-plaetze.test.ts` war das Gegenmittel, nicht die Lösung: Die Probe
 * **entdeckt** eine vergessene Sorte, sie **verhindert** sie nicht.
 *
 * Hier steht der ganze Durchlauf. Eine fünfte Platzsorte ist damit eine
 * Änderung an einer Funktion statt an vierzehn.
 *
 * **Zwei Fragen, zwei Durchläufe.** `allePlaetze` beantwortet „welche Plätze
 * gibt es laut Einrichtung?" — Hilfsdienste bis `svc.count`. Wer statt dessen
 * wissen will, was in den Daten **steht** (auch über die eingestellte Platzzahl
 * hinaus, etwa weil der Planer sie später verkleinert hat), nimmt
 * `gespeicherteHelfer`. Das ist ein echter Unterschied und kein Versehen:
 * Namen hinter der Grenze bleiben absichtlich stehen.
 */

import { isSong, programmPlaetze, raeume, slotsOf, type ProgrammPlatz } from './helpers'
import {
  helferKey,
  punktKey,
  ratgeberKey,
} from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import type { Meeting, MeetingKey, Service, SlotAssignment } from './types'

export { isSong, programmPlaetze, raeume, slotsOf }
export type { ProgrammPlatz }

/**
 * Ein besetzbarer Platz mit allem, was ihn adressiert.
 *
 * `art` unterscheidet die drei Bauformen; bei `'programm'` sagt `aux`, in
 * welchem der beiden Räume der Platz liegt.
 */
export type Platz =
  | ({ art: 'programm' } & ProgrammPlatz)
  | { art: 'ratgeber'; slot: SlotAssignment }
  | {
      art: 'helper'
      /** Leer, solange niemand eingeteilt ist — der Platz gibt es trotzdem. */
      slot: SlotAssignment | undefined
      svc: Service
      pos: number
    }

/**
 * Die Plätze der **Programmseite** — Hauptsaal, Zusätzliche Klasse, Ratgeber.
 *
 * Was `allePlaetze` ohne `services` herausgibt. Eigener Name, weil der
 * Unterschied fachlich ist und nicht bloß ein weggelassenes Argument: „Aufgaben
 * leeren" meint genau diese Plätze und ausdrücklich nicht die Hilfsdienste,
 * und `partWorkload` zählt genau sie.
 */
export type ProgrammseitigerPlatz = Exclude<Platz, { art: 'helper' }>

/**
 * Jeder Platz dieser Zusammenkunft, in fester Reihenfolge: erst das Programm
 * (Hauptsaal und Klasse, Punkt für Punkt), dann der Ratgeber, dann die
 * Hilfsdienste.
 *
 * Ohne `services` bleiben die Hilfsdienste weg — für Aufrufer, die nur die
 * Programm-Seite meinen (`partWorkload`, „Aufgaben leeren").
 *
 * Den Ratgeber gibt es nur, solange die Zusätzliche Klasse besteht: Beim
 * Abschalten fällt die Marke `auxRatgeber` weg, die Namen der Klasse bleiben
 * aber stehen (damit ein Wiedereinschalten sie wiederfindet). Genau diese
 * Grenze zieht `raeume()` für die zweite Platzreihe.
 */
export function allePlaetze(meeting: Meeting): Generator<ProgrammseitigerPlatz>
export function allePlaetze(meeting: Meeting, services: readonly Service[]): Generator<Platz>
export function* allePlaetze(
  meeting: Meeting,
  services: readonly Service[] = [],
): Generator<Platz> {
  for (const platz of programmPlaetze(meeting)) yield { art: 'programm', ...platz }
  if (meeting.auxRatgeber) yield { art: 'ratgeber', slot: meeting.auxRatgeber }
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      yield { art: 'helper', slot: arr[pos], svc, pos }
    }
  }
}

/**
 * Jeder Hilfsdienst-Platz, der in den Daten **steht** — auch jenseits der
 * eingestellten Platzzahl und auch zu Diensten, die es nicht mehr gibt.
 *
 * Verkleinert der Planer einen Dienst, bleiben die Namen dahinter erhalten.
 * Für „was ist zu besetzen?" zählen sie nicht mehr (dafür ist `allePlaetze`
 * da), für „wer ist hier eingetragen?" sehr wohl: Wer dort steht, soll nicht
 * zusätzlich eine Aufgabe bekommen, und „Hilfsdienste leeren" muss ihn
 * erreichen.
 */
export function* gespeicherteHelfer(
  meeting: Meeting,
): Generator<{ slot: SlotAssignment; svcKey: string; pos: number }> {
  for (const [svcKey, arr] of Object.entries(meeting.helpers)) {
    for (const [pos, slot] of arr.entries()) yield { slot, svcKey, pos }
  }
}

/**
 * Der `task_key` eines Platzes — die Brücke zwischen dem Durchlauf und dem
 * Schlüssel-Modul (`_shared/aufgaben-schluessel.ts`).
 *
 * Ohne sie schrieb jeder Aufrufer dieselbe Dreier-Fallunterscheidung: welcher
 * Erzeuger zu welcher Platzsorte gehört. Der Treffpunkt fehlt hier, weil er
 * keine Zusammenkunft ist — er kommt aus einer eigenen Datenquelle (`fs.ts`).
 */
export function platzKey(platz: Platz, woche: string, tab: MeetingKey): string {
  switch (platz.art) {
    case 'programm':
      return punktKey(woche, tab, platz.item.iid, platz.ni, platz.aux)
    case 'ratgeber':
      return ratgeberKey(woche, tab)
    case 'helper':
      return helferKey(woche, tab, platz.svc.key, platz.pos)
  }
}
