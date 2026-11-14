/**
 * Die Aufgaben einer Person, abgeleitet aus den Zuteilungen der Wochen:
 * „Meine Aufgaben", offene Ersatzgesuche, der Stand der Zusage je Platz und
 * die kanonisch deutsche Bezeichnung einer Aufgabe.
 */

import { istAbwesend, KEINE_ABWESENHEIT, type AbsenceSet } from '../absence'
import { allePlaetze, platzKey, platzMitZusage, type Platz } from '../plaetze'
import { RATGEBER_ROLLE } from '../aux-class'
import {
  displayName,
  gehoertZuKennung,
  istBlockSektion,
  isQualified,
  istAusgefallen,
  MEETING_TABS,
  rolleMitHerkunft,
} from '../helpers'
import { istVorbei, meetingDateMs, meetingDateText } from '../meeting-dates'
import { stehtImDienst, uebernahmeHindernis } from '../../../supabase/functions/_shared/freie-plaetze.ts'
import { assignmentsInMeeting } from './zuteilen'
import { buildS89ForSlot } from './s89'
import { helperKeyParts, wochenIndex } from './schluessel'
import type {
  ConfirmationMap,
  MeetingKey,
  MeetingTimes,
  MyTask,
  Person,
  Service,
  SlotAssignment,
  SlotSelection,
  SubstituteReq,
  TaskStatus,
  Week,
} from '../types'

/* ---- Aufgaben-Ableitung ---------------------------------------------------
 * „Meine Aufgaben" werden aus den Wochen-Zuteilungen berechnet. Der
 * Bestätigungs-Status hängt am stabilen `task_key` (Kennung des Punkts):
 * Einfügen, Löschen und Verschieben von Programmpunkten lassen ihn in Ruhe.
 */

/**
 * Offene Ersatzgesuche für `me`: Hilfsdienst-Slots, deren Bearbeiter „verhindert"
 * gemeldet hat und die `me` übernehmen darf (`uebernahmeHindernis`: Bereich,
 * noch kein Platz des Dienstes, nicht vorbei, nicht abwesend). Nächste zuerst,
 * am selben Tag in der Folge der Dienste.
 *
 * `heute` steht als Parameter da, damit Tests eine Uhr vorgeben können; im
 * Betrieb ist es jetzt.
 */
export function deriveSubstituteReqs(
  weeks: Week[],
  services: readonly Service[],
  confirmations: ConfirmationMap,
  me: Person,
  zeiten: MeetingTimes,
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
  heute = new Date(),
): SubstituteReq[] {
  const out: SubstituteReq[] = []
  const svcByKey = new Map(services.map((s) => [s.key, s]))
  const ich = { id: me.id, name: displayName(me) }
  const hatBereich = (bereich: string): boolean => isQualified(me, bereich)
  for (const [key, status] of Object.entries(confirmations)) {
    if (status !== 'verhindert') continue
    const parts = helperKeyParts(key)
    if (!parts) continue
    const svc = svcByKey.get(parts.svc)
    if (!svc) continue
    const wi = wochenIndex(weeks, parts.woche)
    if (wi < 0) continue // Woche nicht geladen — dazu ist nichts zu sagen
    const week = weeks[wi]
    // Entfällt die Zusammenkunft, gibt es nichts zu vertreten — dieselbe
    // Grenze, die `eachAssignedSlot` für die eigenen Aufgaben zieht und die die
    // Edge Function `substitute` serverseitig durchsetzt ('meeting-cancelled').
    // Ohne sie stünde das Gesuch einer Woche, die nach der Absage gestrichen
    // wird (Kongress, Saal belegt), weiter im Aufgaben-Blatt und legte sich
    // beim Öffnen sogar als Modal vor (`vorzulegen`). Wer darauf zusagte,
    // bekäme vom Server ein 409 und davon nur einen Speicherfehler zu sehen.
    if (istAusgefallen(week, parts.tab)) continue
    const meeting = week?.[parts.tab]
    const slot = meeting?.helpers[parts.svc]?.[parts.pos]
    if (!meeting || !slot?.name) continue // leerer Slot — für ihn sucht niemand
    /*
     * Dieselbe Regel wie beim Server (`uebernahmeHindernis`): Bereich, kein
     * Platz desselben Dienstes — auch nicht der eigene, über die Id, wo der
     * Platz eine trägt —, vorbei, abwesend. Am Namen allein verschwände das
     * Gesuch des gleichnamigen Bruders: Ausgerechnet der, der ihn am ehesten
     * vertreten könnte, bekäme es nie zu sehen.
     */
    const lage = {
      svc,
      hatBereich,
      imDienst: stehtImDienst(meeting.helpers[parts.svc] ?? [], ich),
      vorbei: istVorbei(meetingDateMs(week, parts.tab, zeiten), heute),
      abwesend: istAbwesend(abwesend, me.id, wi, parts.tab),
    }
    if (uebernahmeHindernis(lage)) continue
    out.push({
      key,
      svc: parts.svc,
      title: svc.name,
      date: meetingDateText(week, parts.tab, zeiten),
      at: meetingDateMs(week, parts.tab, zeiten),
      declinedBy: slot.name,
      // Was ich an dem Tag schon habe — vor dem Klick, nicht im Toast danach.
      // Der offene Platz selbst zählt nicht mit (`exclude`).
      schonHeute: assignmentsInMeeting(meeting, me, services, {
        kind: 'helper', wi, tab: parts.tab, svc: parts.svc, pos: parts.pos,
        label: '', priv: null, groups: false,
      }),
    })
  }
  // Am selben Tag in der Folge von `services` — der Reducer gibt sie
  // alphabetisch (`diensteDerSprache`); die Absagen selbst kommen ungeordnet.
  const rang = new Map(services.map((s, i) => [s.key, i]))
  const stelle = (req: SubstituteReq): number => rang.get(req.svc) ?? services.length
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || stelle(a) - stelle(b) || a.key.localeCompare(b.key))
}

/**
 * Besucht alle belegten Slots (Programmpunkte + Hilfsdienste) aller Wochen.
 *
 * `visit` bekommt den Platz selbst (Name, Id, Rolle): Wem er gehört,
 * entscheidet der Aufrufer mit `gehoertZuKennung` — nicht aus Name und Id
 * einzeln nachgebaut. Wer mehr wissen muss — welche Woche, welche
 * Zusammenkunft, welche Platzsorte —, findet es in `wo`.
 */
export function eachAssignedSlot(
  weeks: Week[],
  services: readonly Service[],
  zeiten: MeetingTimes,
  visit: (slot: SlotAssignment, key: string, task: () => MyTask, wo: { wi: number; tab: MeetingKey; platz: Platz }) => void,
): void {
  weeks.forEach((week, wi) => {
    for (const tab of MEETING_TABS) {
      // Entfällt die Zusammenkunft, gibt es dazu nichts zu bestätigen, zu
      // erinnern oder zu vertreten. Die Zuteilungen bleiben in den Daten
      // stehen — sie sind nicht verwaist, sie ruhen nur, solange nichts
      // stattfindet.
      if (istAusgefallen(week, tab)) continue
      const meeting = week[tab]
      // Echtes Datum der Zusammenkunft (nur bei importierten Wochen) → Countdown.
      const at = meetingDateMs(week, tab, zeiten)
      // **Ein Durchlauf für alle vier Platzsorten.** Die Plätze der Zusätzlichen
      // Klasse sind gleichwertige Aufgaben (bestätigen, erinnern, S-89), nur mit
      // eigenem Schlüssel und eigenem Ort; der Ratgeber und die Hilfsdienste
      // ebenso.
      for (const platz of allePlaetze(meeting, services)) {
        // Nur, wer etwas zu bestätigen hat: Gastredner und Kreisaufseher kommen
        // von außen, die Reinigungs-Rotation ist eine Gruppe.
        const slot = platz.slot
        if (!slot || !platzMitZusage(platz)) continue
        const key = platzKey(platz, week.start, tab)
        visit(slot, key, () => {
          const gemeinsam = { id: key, date: meetingDateText(week, tab, zeiten), at, status: 'offen' as const }
          if (platz.art === 'ratgeber') {
            // Die Bezeichnung **ist** die Rolle — App-Sprache, kein Titel.
            return { ...gemeinsam, title: '', rolle: RATGEBER_ROLLE, s89: null }
          }
          if (platz.art === 'helper') {
            // Dienstnamen zeigt die App in der Sprache des Lesers — so hält es
            // auch `SubstituteReq.title` („Anzeige über tu").
            return { ...gemeinsam, title: '', rolle: platz.svc.name, s89: null }
          }
          const { section, si, item, ii, ni, aux } = platz
          const rolle = rolleMitHerkunft(slot) ?? ''
          const sel: SlotSelection = {
            kind: 'part', wi, tab, si, ii, ni, aux: aux || undefined,
            label: '', priv: slot.bereichsKey ?? null, groups: false,
          }
          // Zwei Hälften statt einer: der Titel gehört in die Sprache der
          // Versammlung, die Rolle in die des Lesers (siehe MyTask.rolle).
          // In Eröffnung/Abschluss trägt die Rolle allein — der Titel benennt
          // dort den ganzen Block (`istBlockAbschnitt`).
          return {
            ...gemeinsam,
            title: rolle && istBlockSektion(section) ? '' : item.title,
            ...(rolle ? { rolle } : {}),
            s89: buildS89ForSlot(weeks, sel, zeiten),
          }
        }, { wi, tab, platz })
      }
    }
  })
}

/**
 * Beide Hälften einer Aufgabe zu **einem kanonisch deutschen** Text —
 * für alles, was keinen Übersetzer dazwischen hat: die Mitteilung an den Planer
 * und die Zeitleiste im Personen-Detail. Die Oberfläche nimmt stattdessen
 * `aufgabenLabel` (i18n/useT.ts) und übersetzt jede Hälfte für sich.
 */
export function aufgabenBezeichnung(task: Pick<MyTask, 'title' | 'rolle'>): string {
  return [task.title, task.rolle].filter(Boolean).join(' · ')
}

/**
 * Aufgaben einer Person (Anzeigename) aus den Wochen-Zuteilungen, in
 * Programmreihenfolge; Status aus der ConfirmationMap (fehlt = offen).
 */
export function deriveMyTasks(
  weeks: Week[],
  services: readonly Service[],
  personName: string,
  confirmations: ConfirmationMap,
  zeiten: MeetingTimes,
  personId?: string,
): MyTask[] {
  const tasks: MyTask[] = []
  if (!personName && !personId) return tasks
  eachAssignedSlot(weeks, services, zeiten, (slot, key, task) => {
    if (!gehoertZuKennung(slot, personId, personName)) return
    tasks.push({ ...task(), status: zusageStatus(confirmations, key) })
  })
  return tasks
}

/**
 * Stand der Zusage **eines Platzes** — keine Zeile heißt „offen".
 *
 * Eine Stelle für beide Seiten: „Meine Aufgaben" des Eingeteilten und der
 * Ampel-Punkt am Chip des Planers lesen hier. So sieht der Planer genau das,
 * was der Verkündiger bei sich stehen hat.
 *
 * **Je Platz, nicht je Person.** Eine Personen-Markierung zeigte „…" an
 * *jedem* Platz einer Person, solange sie *irgendwo* noch etwas offen hat —
 * auch in einer anderen oder längst vergangenen Woche. Ein bestätigter
 * Vorsitz stünde dann als unbestätigt da, und eine Absage sähe aus wie eine
 * ausstehende Antwort.
 */
export function zusageStatus(confirmations: ConfirmationMap, key: string): TaskStatus {
  return confirmations[key] ?? 'offen'
}
