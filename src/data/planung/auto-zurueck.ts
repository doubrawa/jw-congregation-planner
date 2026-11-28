/**
 * **„Rückgängig" nach dem automatischen Zuteilen** — die Plätze, die die
 * Automatik eben besetzt hat, wieder leeren.
 *
 * Die Automatik füllt nur offene Plätze (`autoAssignMeeting`, `fsAutoAssign`);
 * zurück heißt also: genau diese wieder offen. Aber nur, wo noch steht, was
 * sie gesetzt hat — hat der Planer einen davon in den Sekunden danach von Hand
 * umbesetzt, bleibt seine Wahl.
 *
 * Ein allgemeines „Leeren" (ganze Bereiche einer Woche) gibt es nicht: Neben
 * „Zuteilen" war es eine zweite, zerstörende Handlung im selben Blatt
 * (Betreiber: „muss man beim zuteilen unbedingt gleichzeitig vorher noch leeren
 * können - nein"). Einzelne Plätze leert „Entfernen" im Zuteilen-Blatt.
 */

import { fsSetLeader, fsTaskKey } from '../fs'
import { MEETING_TABS } from '../helpers'
import { allePlaetze, auswahlFuer, platzKey } from '../plaetze'
import type { FsInstance, MeetingKey, Service, Week } from '../types'
import { assignSlot } from './zuteilen'

/** Was die Automatik an einen Platz gesetzt hat — daran erkennt das Zurücknehmen, ob er noch so steht. */
export interface AutoGesetzt {
  /** Der `task_key` des Platzes (`platzKey`, beim Treffpunkt `fsTaskKey`). */
  key: string
  name: string
  pid?: string
}

const eintrag = (key: string, name: string, pid: string | undefined): AutoGesetzt => (pid ? { key, name, pid } : { key, name })

/** Steht an diesem Platz noch, was die Automatik gesetzt hat? */
function stehtNoch(platz: { name?: string; pid?: string } | undefined, g: AutoGesetzt): boolean {
  return Boolean(platz?.name) && platz?.name === g.name && platz?.pid === g.pid
}

/**
 * Die Plätze der Zusammenkünfte `tabs` in Woche `wi`, die zwischen `vorher`
 * und `nachher` besetzt wurden — was vorher leer war und jetzt einen Namen
 * trägt. Verglichen wird über den Schlüssel des Platzes, nicht über seine
 * Stelle im Durchlauf.
 */
export function neuBesetztePlaetze(
  vorher: readonly Week[],
  nachher: readonly Week[],
  wi: number,
  tabs: readonly MeetingKey[],
  services: readonly Service[],
): AutoGesetzt[] {
  const alt = vorher[wi]
  const neu = nachher[wi]
  if (!alt || !neu) return []
  const out: AutoGesetzt[] = []
  for (const tab of tabs) {
    const frueher = new Map<string, string>()
    for (const platz of allePlaetze(alt[tab], services)) frueher.set(platzKey(platz, alt.start, tab), platz.slot?.name ?? '')
    for (const platz of allePlaetze(neu[tab], services)) {
      const slot = platz.slot
      const key = platzKey(platz, neu.start, tab)
      if (slot?.name && !frueher.get(key)) out.push(eintrag(key, slot.name, slot.pid))
    }
  }
  return out
}

/** Die Treffpunkt-Leiter der Woche `wi`, die zwischen `vorher` und `nachher` gesetzt wurden. */
export function neuBesetzteTreffpunkte(
  vorher: readonly FsInstance[][],
  nachher: readonly FsInstance[][],
  wi: number,
  kennung: string,
): AutoGesetzt[] {
  const frueher = new Map((vorher[wi] ?? []).map((inst) => [inst.id, inst.leader]))
  return (nachher[wi] ?? [])
    .filter((inst) => inst.leader && !frueher.get(inst.id))
    .map((inst) => eintrag(fsTaskKey(kennung, inst.id), inst.leader, inst.lpid))
}

/** Was nach dem Zurücknehmen gilt. */
export interface Zurueckgenommen {
  weeks: Week[]
  fsWeeks: FsInstance[][]
  /** Die Schlüssel der Plätze, die wirklich wieder offen sind. */
  frei: string[]
}

/**
 * Leert die Plätze aus `gesetzt`, an denen noch steht, was die Automatik
 * gesetzt hat — Zusammenkünfte und Treffpunkte. Unberührte Wochen behalten
 * ihre Referenz; daran erkennt die Persistenz, was sie schreiben muss.
 */
export function autoZuruecknehmen(
  stand: { weeks: Week[]; fsWeeks: FsInstance[][]; services: readonly Service[] },
  gesetzt: readonly AutoGesetzt[],
): Zurueckgenommen {
  let weeks = stand.weeks
  let fsWeeks = stand.fsWeeks
  const frei: string[] = []
  const erwartet = new Map(gesetzt.map((g) => [g.key, g]))
  if (erwartet.size === 0) return { weeks, fsWeeks, frei }

  stand.weeks.forEach((week, wi) => {
    for (const tab of MEETING_TABS) {
      for (const platz of allePlaetze(week[tab], stand.services)) {
        const key = platzKey(platz, week.start, tab)
        const g = erwartet.get(key)
        if (!g || !stehtNoch(platz.slot, g)) continue
        weeks = assignSlot(weeks, auswahlFuer(platz, wi, tab), '')
        frei.push(key)
      }
    }
  })

  stand.fsWeeks.forEach((insts, wi) => {
    const kennung = stand.weeks[wi]?.start ?? ''
    for (const inst of insts) {
      const key = fsTaskKey(kennung, inst.id)
      const g = erwartet.get(key)
      if (!g || !stehtNoch({ name: inst.leader, pid: inst.lpid }, g)) continue
      fsWeeks = fsSetLeader(fsWeeks, wi, inst.id, '')
      frei.push(key)
    }
  })

  return { weeks, fsWeeks, frei }
}
