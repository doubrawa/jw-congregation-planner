/**
 * **Künftige Plätze einer Person — und sie freigeben** (T182, T181).
 *
 * Betreiber, 13.11.2026: „was passiert, wenn eine person einen bestimmten
 * dienst oder aufgabe nicht mehr macht, wie z.b. mikrodienst. dann sollten die
 * nun ‚falsch' besetzten plätze frei werden und müssen neu verplant werden."
 *
 * Bis dahin blieb, wem der Admin einen Bereich nahm, in den schon geplanten
 * Wochen an diesen Plätzen stehen; wer entfernt wurde, stand dort als Name ohne
 * Person. Beides sah besetzt aus, und der Planer bemerkte es — wenn überhaupt —
 * erst beim Planen.
 *
 * Hier stehen zwei Schritte, und die Oberfläche fragt dazwischen (Betreiber:
 * „Vorher fragen, mit Wahl"): erst **welche** Plätze es träfe
 * (`nichtMehrPassend`), dann **diese** freigeben (`plaetzeFreigeben`).
 *
 * **Künftig** heißt: Die Zusammenkunft oder der Treffpunkt ist nicht vorbei —
 * tagesgenau, am Tag selbst zählt er noch, wie unter „Meine Aufgaben"
 * (`istVorbei`). Vergangenes bleibt, wie es war: Wer letzte Woche am Mikrofon
 * stand, stand dort. Eine ausgefallene Zusammenkunft trägt keine Aufgaben
 * (`eachAssignedSlot`); ihre Plätze ruhen und bleiben ebenso.
 *
 * **Welche Plätze nicht mehr passen**, sagt dieselbe Regel, nach der das
 * Zuteilungsblatt auswählt (`passtAufPlatz`): Bereich, Rolle (Redner-Platz) und
 * Geschlecht (Plätze nur für Brüder, Führer und Partner eines Gesprächs).
 */

import { FS_LEITER } from '../../supabase/functions/_shared/zuteilungen.ts'
import { fsLeiterZuteilung, fsSetLeader, fsTagVorbei, fsTaskKey, treffpunktAufgabe } from './fs'
import { gehoertZu, MEETING_TABS, ROLE_GUEST_SPEAKER } from './helpers'
import { istVorbei, meetingDateMs } from './meeting-dates'
import { allePlaetze, auswahlFuer, platzKey } from './plaetze'
import { eachAssignedSlot, zusageStatus } from './planung/aufgaben'
import { leitetTreffpunkte, passtAufPlatz } from './planung/eignung'
import { assignSlot } from './planung/zuteilen'
import type { ConfirmationMap, FsInstance, MeetingTimes, MyTask, Person, Service, Week } from './types'

/** Was beide Schritte aus dem Zustand lesen. */
export interface PlatzStand {
  weeks: Week[]
  /** Parallel zu `weeks`: die Treffpunkte derselben Woche. */
  fsWeeks: FsInstance[][]
  services: Service[]
  persons: Person[]
  congregation: { times: MeetingTimes }
  confirmations: ConfirmationMap
}

/** Ein künftiger Platz: sein Schlüssel und die Aufgabe, wie „Meine Aufgaben" sie zeigt. */
export interface KuenftigerPlatz {
  key: string
  aufgabe: MyTask
}

/**
 * Die künftigen Plätze von `vorher`, an die die Person **nach der Änderung**
 * nicht mehr passt — Zusammenkünfte und Treffpunkte, nach Termin.
 *
 * `nachher` ist die Person mit der Änderung; `null` heißt, sie wird entfernt,
 * und dann ist es jeder künftige Platz. Gefragt wird mit dem Personenbestand
 * danach: Ob ein Gesprächspartner zu seinem Führer passt, hängt am Geschlecht
 * beider.
 */
export function nichtMehrPassend(
  stand: PlatzStand,
  vorher: Person,
  nachher: Person | null,
  heute = new Date(),
): KuenftigerPlatz[] {
  const zeiten = stand.congregation.times
  const persons = nachher
    ? stand.persons.map((p) => (p.id === vorher.id ? nachher : p))
    : stand.persons.filter((p) => p.id !== vorher.id)
  const daten = { weeks: stand.weeks, persons }
  const out: KuenftigerPlatz[] = []

  eachAssignedSlot(stand.weeks, stand.services, zeiten, (slot, key, task, { wi, tab, platz }) => {
    if (!gehoertZu(slot, vorher)) return
    const week = stand.weeks[wi]
    if (!week || istVorbei(meetingDateMs(week, tab, zeiten), heute)) return
    if (nachher && passtAufPlatz(daten, auswahlFuer(platz, wi, tab))(nachher)) return
    out.push({ key, aufgabe: { ...task(), status: zusageStatus(stand.confirmations, key) } })
  })

  // Treffpunkte: Leiten darf, wer den Bereich hat — an jedem Treffpunkt gleich.
  if (!nachher || !leitetTreffpunkte(nachher)) {
    stand.fsWeeks.forEach((insts, wi) => {
      const kennung = stand.weeks[wi]?.start ?? ''
      for (const inst of insts) {
        if (!gehoertZu(fsLeiterZuteilung(inst), vorher)) continue
        if (fsTagVorbei(kennung, inst.wd, heute)) continue
        const aufgabe = treffpunktAufgabe(kennung, inst, stand.confirmations, FS_LEITER)
        out.push({ key: aufgabe.id, aufgabe })
      }
    })
  }

  return out.sort((a, b) => (a.aufgabe.at ?? Infinity) - (b.aufgabe.at ?? Infinity))
}

/** Was nach dem Freigeben gilt. */
export interface Freigegeben {
  weeks: Week[]
  fsWeeks: FsInstance[][]
  /** Die Schlüssel der Plätze, die wirklich frei geworden sind. */
  frei: string[]
}

/**
 * Gibt die Plätze `keys` frei, **an denen `person` noch steht** — was
 * inzwischen jemand anderem gehört, bleibt. Danach sind sie offen wie jeder
 * Platz, den der Planer im Blatt entfernt.
 *
 * Der Redner-Platz geht dabei zurück auf „Gastredner", ohne Versammlung — so
 * wie „Entfernen" im Zuteilungsblatt ihn hinterlässt: Den Redner vereinbart
 * man, die Automatik verlost ihn nicht.
 *
 * Unberührte Wochen behalten ihre Referenz; daran erkennt die Persistenz, was
 * sie schreiben muss. Wer davon wusste, erfährt es wie bei jedem Entzug
 * (`entzogeneAller`) — außer beim Entfernen der Person (`OHNE_ENTZUG`).
 */
export function plaetzeFreigeben(
  stand: Pick<PlatzStand, 'weeks' | 'fsWeeks' | 'services'>,
  person: Person,
  keys: ReadonlySet<string>,
): Freigegeben {
  let weeks = stand.weeks
  let fsWeeks = stand.fsWeeks
  const frei: string[] = []
  if (keys.size === 0) return { weeks, fsWeeks, frei }

  stand.weeks.forEach((week, wi) => {
    for (const tab of MEETING_TABS) {
      for (const platz of allePlaetze(week[tab], stand.services)) {
        const key = platzKey(platz, week.start, tab)
        if (!keys.has(key) || !gehoertZu(platz.slot, person)) continue
        const sel = auswahlFuer(platz, wi, tab)
        weeks =
          sel.kind === 'part' && sel.guest
            ? assignSlot(weeks, sel, '', ROLE_GUEST_SPEAKER, undefined, '')
            : assignSlot(weeks, sel, '')
        frei.push(key)
      }
    }
  })

  stand.fsWeeks.forEach((insts, wi) => {
    const kennung = stand.weeks[wi]?.start ?? ''
    for (const inst of insts) {
      const key = fsTaskKey(kennung, inst.id)
      if (!keys.has(key) || !gehoertZu(fsLeiterZuteilung(inst), person)) continue
      fsWeeks = fsSetLeader(fsWeeks, wi, inst.id, '')
      frei.push(key)
    }
  })

  return { weeks, fsWeeks, frei }
}
