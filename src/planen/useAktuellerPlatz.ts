import { useApp } from '../app/context'
import { abwesenheitAm } from '../data/absence'
import { fsLeiterZuteilung, fsTag, fsWeekConflicts } from '../data/fs'
import { idAufloeser, type Zuteilung } from '../data/helpers'
import { meetingDate } from '../data/meeting-dates'
import { platzDerAuswahl, platzMitZusage } from '../data/plaetze'
import type { Absence, SlotSelection } from '../data/types'
import { useT } from '../i18n/useT'
import { platzAnzeige, type PlatzAnzeige } from './platz-anzeige'
import { machKonfliktVon, useKonflikte } from './useKonflikte'
import { useZusage } from './useZusage'

/** Was die Karte „aktuell besetzt" oben im Zuteilen-Blatt zeigt. */
export interface AktuellerPlatz {
  /** Wer dort steht, wie gespeichert. */
  name: string
  anzeige: PlatzAnzeige
  /** Fehlt die Person an diesem Termin: die Abwesenheit dazu — das Blatt nennt ihren Zeitraum. */
  abwesenheit?: Absence
}

/**
 * **Wie steht der Platz, der gerade zugeteilt wird?** (T121, Entwurf
 * `GZuteilen`) — dieselbe Lage wie seine Zeile im Plan (`platzAnzeige`):
 * zugesagt, wartet, ein Problem. `undefined`, solange niemand eingeteilt ist.
 *
 * Ein Treffpunkt hat seine eigene Quelle der Konflikte (`fsWeekConflicts`, wie
 * im Plan der Treffpunkte); ein Freitext-Leiter hat nichts zu bestätigen und
 * keine Abwesenheiten.
 */
export function useAktuellerPlatz(sel: SlotSelection): AktuellerPlatz | undefined {
  const { state } = useApp()
  const { t } = useT()
  const zusage = useZusage()
  // Ein Hook steht immer da — beim Treffpunkt bleibt seine Antwort ungefragt.
  const konflikte = useKonflikte(sel.kind === 'fs' ? 'mid' : sel.tab)
  const { weeks, fsWeeks, persons, absences, services, congregation } = state
  const week = weeks[sel.wi]
  if (!week) return undefined
  /** Die Abwesenheit dieser Zuteilung an diesem Tag — nur gefragt, wenn ein Konflikt sie meldet. */
  const abwesenheitVon = (z: Zuteilung | undefined, tag: Date | null) =>
    tag ? abwesenheitAm(absences, idAufloeser(persons)(z), tag) : undefined

  if (sel.kind === 'fs') {
    const inst = fsWeeks[sel.wi]?.find((i) => i.id === sel.instId)
    if (!inst?.leader) return undefined
    const person = fsLeiterZuteilung(inst)
    const konflikt = person
      ? machKonfliktVon(persons, fsWeekConflicts(fsWeeks, sel.wi, persons, absences, week.start))(person)
      : undefined
    return {
      name: inst.leader,
      anzeige: platzAnzeige({ name: inst.leader }, person ? zusage.treffpunkt(inst) : null, konflikt, t),
      abwesenheit: konflikt?.kind === 'fsAbsent' ? abwesenheitVon(person, fsTag(week.start, inst.wd)) : undefined,
    }
  }

  const platz = platzDerAuswahl(week[sel.tab], services, sel)
  const slot = platz?.slot
  if (!platz || !slot?.name) return undefined
  // Wie die Zeilen im Plan: Die Reinigungsgruppe steht in keinem Konflikt, und
  // nach der Absage eines Hilfsdienstes sucht die App selbst Ersatz.
  const konflikt = platz.art === 'helper' && platz.svc.groups ? undefined : konflikte.von(slot)
  const stand = platzMitZusage(platz) && zusage.moeglich(sel.tab) ? zusage.platz(sel.tab, platz) : null
  return {
    name: slot.name,
    anzeige: platzAnzeige(slot, stand, konflikt, t, platz.art === 'helper' ? t.spurErsatzGesucht : undefined),
    abwesenheit:
      konflikt?.kind === 'absent'
        ? abwesenheitVon(slot, meetingDate(week, sel.tab, congregation.times))
        : undefined,
  }
}
