/**
 * Die eigenen Abwesenheiten im Profil (T121): die betroffene Person entscheidet,
 * nicht der Ersteller — und nur, was ansteht oder läuft.
 */
import { describe, expect, it } from 'vitest'
import type { Absence } from '../data/types'
import { eigeneAbwesenheiten } from './abwesenheiten'

const abw = (id: string, personId: string | null, userId: string | null, from = '2026-10-20', to = '2026-10-23'): Absence => ({
  id, personId, userId, from, to, reason: '',
})
const ich = { userId: 'u1', personId: 'p-a' }
const HEUTE = '2026-10-15'
const ids = (liste: readonly Absence[]) => liste.map((a) => a.id)

describe('eigeneAbwesenheiten', () => {
  it('zeigt die auf die eigene Person ausgestellten — auch die, die der Planer eingetragen hat', () => {
    expect(ids(eigeneAbwesenheiten([abw('a1', 'p-a', 'u-planer'), abw('a2', 'p-a', null)], ich, HEUTE))).toEqual(['a1', 'a2'])
  })

  it('zeigt NICHT, was der Planer für andere eingetragen hat', () => {
    // Nach dem Ersteller gefragt, stünden ihm alle Abwesenheiten der Versammlung als seine eigenen da.
    const planer = { userId: 'u-planer', personId: 'p-a' }
    expect(eigeneAbwesenheiten([abw('a1', 'p-b', 'u-planer'), abw('a2', 'p-c', 'u-planer')], planer, HEUTE)).toEqual([])
  })

  it('ein Konto ohne eigene Person findet seine Einträge über den Ersteller wieder', () => {
    const ohnePerson = { userId: 'u1', personId: null }
    expect(ids(eigeneAbwesenheiten([abw('a1', null, 'u1'), abw('a2', null, 'u9')], ohnePerson, HEUTE))).toEqual(['a1'])
  })

  it('ohne Konto (Entwicklerseite) bleibt alles stehen — es gibt nichts einzugrenzen', () => {
    const niemand = { userId: null, personId: null }
    expect(eigeneAbwesenheiten([abw('a1', 'p-b', null), abw('a2', 'p-c', null)], niemand, HEUTE)).toHaveLength(2)
  })

  it('was vorbei ist, steht nicht mehr da — was heute endet, schon', () => {
    const liste = [abw('vorbei', 'p-a', 'u1', '2026-10-01', '2026-10-14'), abw('heute', 'p-a', 'u1', '2026-10-10', '2026-10-15')]
    expect(ids(eigeneAbwesenheiten(liste, ich, HEUTE))).toEqual(['heute'])
  })

  it('geordnet nach Beginn — auch ein eben eingetragener Eintrag steht an seinem Datum', () => {
    const liste = [abw('spaet', 'p-a', 'u1', '2026-12-01', '2026-12-02'), abw('frueh', 'p-a', 'u1', '2026-11-01', '2026-11-05')]
    expect(ids(eigeneAbwesenheiten(liste, ich, HEUTE))).toEqual(['frueh', 'spaet'])
  })
})
