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
  /** Die Konflikte der Zusammenkunft, in der Reihenfolge, die das Banner zeigt. */
  liste: Conflict[]
  /** Steht diese Zuteilung in einem der Konflikte? */
  betrifft: (z: Zugeteilt | undefined) => boolean
}

/**
 * Die Prüfung „gehört diese Zuteilung zu einem Konflikt?" — **eine** Stelle für
 * alle Plätze und beide Datenquellen.
 *
 * Sie muss die Person genauso bestimmen wie die Konfliktprüfung selbst: erst
 * die Id, sonst der Anzeigename, aufgelöst über die Personenliste
 * (`idAufloeser`). Das ist kein Feinschliff — im Demo-Bestand tragen die
 * Hilfsdienst-Plätze gar keine Id. Ein direkter Vergleich von `pid`/Name ließ
 * den abwesenden Ordner im Banner stehen, während sein Chip unmarkiert blieb.
 */
export function machBetrifft(persons: Person[], conflicts: Conflict[]): (z: Zugeteilt | undefined) => boolean {
  const werIst = idAufloeser(persons)
  const betroffen = new Set(conflicts.map((c) => c.kennung))
  return (z) => {
    if (!z?.name) return false
    return betroffen.has(werIst(z as { name: string; pid?: string }) ?? kennungVon(z.name))
  }
}

/**
 * Die Konflikte der angezeigten Zusammenkunft — einmal gerechnet, zweimal
 * gebraucht: das Banner zählt sie auf, und die Zuteilungen darunter werden
 * danach markiert.
 *
 * Bewusst **eine** Quelle für beides. Rechnete der Plan seine Markierung selbst
 * aus, nennte das Banner über kurz oder lang einen Konflikt, den im Programm
 * nichts hervorhebt — und der Planer sucht die Stelle, statt sie zu sehen.
 */
export function useKonflikte(tab: MeetingKey): Konflikte {
  const { state } = useApp()
  const abwesend = useAbwesend()
  const { weeks, week, persons, services } = state
  return useMemo(() => {
    const liste = weekConflicts(weeks, week, persons, services, tab, abwesend)
    return { liste, betrifft: machBetrifft(persons, liste) }
  }, [weeks, week, persons, services, tab, abwesend])
}
