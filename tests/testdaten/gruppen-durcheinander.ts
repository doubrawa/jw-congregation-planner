import type { Group } from '../../src/data/types'

/**
 * **Gruppen, deren Ids nichts über ihre Reihenfolge sagen** — wie in der
 * Datenbank, die zufällige Kennungen vergibt. Nach der Id geordnet hieße es
 * „Gruppe 10, Gruppe 2, Gruppe 1", nach dem Namen „Gruppe 1, 2, 10".
 *
 * Die übrigen Testdaten heißen `g1`, `g2` …: Mit ihnen sind beide
 * Reihenfolgen dieselbe, und keine Probe sieht den Unterschied.
 */
export const GRUPPEN_DURCHEINANDER: Group[] = [
  { id: 'c3', name: 'Gruppe 1', overseerId: null, assistantId: null },
  { id: 'a1', name: 'Gruppe 10', overseerId: null, assistantId: null },
  { id: 'b2', name: 'Gruppe 2', overseerId: null, assistantId: null },
]

/** Die Ids in der Reihenfolge, in der sie gespeichert werden (`fsSort`). */
export const IDS_GESPEICHERT = ['a1', 'b2', 'c3']

/** Die Namen in der Reihenfolge, in der die App sie zeigt (`fsAnzeigeSort`). */
export const NAMEN_GEZEIGT = ['Gruppe 1', 'Gruppe 2', 'Gruppe 10']
