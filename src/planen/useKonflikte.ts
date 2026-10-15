import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { idAufloeser } from '../data/helpers'
import { kennungVon, weekConflicts, type Conflict } from '../data/planning'
import type { MeetingKey, Person } from '../data/types'

/** Was von einer Zuteilung gebraucht wird, um sie einer Person zuzuordnen. */
interface Zugeteilt {
  name?: string
  pid?: string
}

export interface Konflikte {
  /** Die Konflikte der Zusammenkunft — „Zu klären" nennt sie (`BesetzungKarte`). */
  liste: Conflict[]
  /** Der Konflikt, in dem diese Zuteilung steht — die Abwesenheit vor einer Doppelbelegung. */
  von: (z: Zugeteilt | undefined) => Conflict | undefined
  /** Steht diese Zuteilung in einem der Konflikte? */
  betrifft: (z: Zugeteilt | undefined) => boolean
}

/**
 * Die Prüfung „in welchem Konflikt steht diese Zuteilung?" — **eine** Stelle
 * für alle Plätze und beide Datenquellen.
 *
 * Sie muss die Person genauso bestimmen wie die Konfliktprüfung selbst: erst
 * die Id, sonst der Anzeigename, aufgelöst über die Personenliste
 * (`idAufloeser`). Das ist kein Feinschliff — im Demo-Bestand tragen die
 * Hilfsdienst-Plätze gar keine Id. Ein direkter Vergleich von `pid`/Name ließ
 * den abwesenden Ordner im Banner stehen, während sein Chip unmarkiert blieb.
 *
 * Steht eine Person in mehreren, gilt die Abwesenheit: Sie sagt, warum der
 * Platz so nicht bleiben kann.
 */
export function machKonfliktVon(persons: Person[], conflicts: Conflict[]): (z: Zugeteilt | undefined) => Conflict | undefined {
  const werIst = idAufloeser(persons)
  const je = new Map<string, Conflict>()
  for (const c of conflicts) {
    const vorher = je.get(c.kennung)
    if (!vorher || (c.kind === 'absent' && vorher.kind !== 'absent')) je.set(c.kennung, c)
  }
  return (z) => (z?.name ? je.get(werIst(z as { name: string; pid?: string }) ?? kennungVon(z.name)) : undefined)
}

/**
 * Die Konflikte der angezeigten Zusammenkunft — einmal gerechnet, zweimal
 * gebraucht: „Zu klären" zählt sie auf, und die Plätze darunter werden danach
 * markiert.
 *
 * Bewusst **eine** Quelle für beides. Rechnete der Plan seine Markierung selbst
 * aus, nennte „Zu klären" über kurz oder lang einen Konflikt, den im Programm
 * nichts hervorhebt — und der Planer sucht die Stelle, statt sie zu sehen.
 */
export function useKonflikte(tab: MeetingKey): Konflikte {
  const { state } = useApp()
  const abwesend = useAbwesend()
  const { weeks, week, persons, services } = state
  return useMemo(() => {
    const liste = weekConflicts(weeks, week, persons, services, tab, abwesend)
    const von = machKonfliktVon(persons, liste)
    return { liste, von, betrifft: (z) => von(z) !== undefined }
  }, [weeks, week, persons, services, tab, abwesend])
}
