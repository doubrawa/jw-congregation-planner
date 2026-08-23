/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { fsVisible } from '../data/fs'
import { emptyQualifications } from '../data/helpers'
import type { FsInstance, Group, Person } from '../data/types'
import { FsProgram } from './FsProgram'

/**
 * Wer welchen Treffpunkt sieht.
 *
 * Ein Versammlungstreffpunkt gilt allen. Ein **Gruppentreffpunkt** ist die
 * Sache seiner Gruppe: Wer nicht dazugehört, hat dort nichts vor und soll den
 * Termin auch nicht im Programm stehen haben.
 *
 * Geprüft wird beides — die Regel (`fsVisible`) **und ihr Aufrufer** (die
 * Anzeige). Nur die Regel zu prüfen liefe an der häufigsten Fehlerart dieses
 * Projekts vorbei: die Regel steht richtig da, und die Ansicht fragt sie nicht.
 * Der DOM-Teil ist deshalb der eigentliche Wächter; er wird rot, sobald
 * `FsProgram` wieder ungefiltert aus `fsWeeks` liest.
 */

function Buehne({ state, children }: { state: AppState; children: ReactNode }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

afterEach(cleanup)

const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', ov: 'p-ov1', as: null },
  { id: 'g2', name: 'Gruppe 2', ov: 'p-ov2', as: null },
]

const person = (id: string, name: string, grp: string | null): Person => ({
  id, fn: name, ln: '', role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(), grp,
})

const PERSONEN: Person[] = [
  person('p-g1', 'Anna', 'g1'),
  person('p-g2', 'Bernd', 'g2'),
  person('p-ohne', 'Clara', null),
  person('p-ov1', 'Aufseher Eins', null), // leitet g1, ohne selbst darin geführt zu sein
]

/** Ein Treffpunkt je Sorte — Ort als Kennzeichen, danach sucht der DOM-Test. */
const inst = (id: string, grp: string, place: string): FsInstance => ({
  id, ruleId: id, grp, wd: 3, time: '09:30', place, leader: '',
})

const VERS = inst('r0', '', 'Königreichssaal')
const G1 = inst('r1', 'g1', 'Bäckerei Eins')
const G2 = inst('r2', 'g2', 'Marktplatz Zwei')
const WOCHE: FsInstance[] = [VERS, G1, G2]

const orte = (liste: FsInstance[]): string[] => liste.map((i) => i.place)

describe('fsVisible — die Regel', () => {
  it('Versammlungstreffpunkte sieht jeder', () => {
    expect(orte(fsVisible(WOCHE, PERSONEN, GRUPPEN, 'p-ohne', false))).toEqual(['Königreichssaal'])
  })

  it('den Gruppentreffpunkt sieht nur die eigene Gruppe', () => {
    expect(orte(fsVisible(WOCHE, PERSONEN, GRUPPEN, 'p-g1', false))).toEqual([
      'Königreichssaal', 'Bäckerei Eins',
    ])
    expect(orte(fsVisible(WOCHE, PERSONEN, GRUPPEN, 'p-g2', false))).toEqual([
      'Königreichssaal', 'Marktplatz Zwei',
    ])
  })

  it('der Gruppenaufseher sieht seine Gruppe, auch ohne selbst in ihr geführt zu sein', () => {
    /*
     * `Person.grp` und `groups.ov` sind zwei Angaben. In der Regel decken sie
     * sich, aber der Aufseher, der (noch) keiner Gruppe zugeordnet ist, säße
     * sonst vor einem leeren Programm — und darf seine Treffpunkte planen.
     */
    expect(orte(fsVisible(WOCHE, PERSONEN, GRUPPEN, 'p-ov1', false))).toEqual([
      'Königreichssaal', 'Bäckerei Eins',
    ])
  })

  it('der Planer sieht alle Gruppen', () => {
    expect(orte(fsVisible(WOCHE, PERSONEN, GRUPPEN, 'p-g1', true))).toEqual(orte(WOCHE))
  })

  it('ohne eigene Person bleibt es bei den Versammlungstreffpunkten', () => {
    expect(orte(fsVisible(WOCHE, PERSONEN, GRUPPEN, null, false))).toEqual(['Königreichssaal'])
  })
})

describe('FsProgram — der Aufrufer', () => {
  const zeige = (personId: string, planner = false) =>
    render(
      <Buehne
        state={{
          ...initialState(),
          planner,
          personId,
          persons: PERSONEN,
          groups: GRUPPEN,
          week: 0,
          fsWeeks: [WOCHE],
        }}
      >
        <FsProgram />
      </Buehne>,
    )

  it('zeigt einem Verkündiger die fremde Gruppe nicht', () => {
    zeige('p-g1')
    expect(screen.getByText('Königreichssaal')).toBeTruthy()
    expect(screen.getByText('Bäckerei Eins')).toBeTruthy()
    expect(screen.queryByText('Marktplatz Zwei')).toBeNull()
  })

  it('zeigt dem Planer alle', () => {
    zeige('p-g1', true)
    expect(screen.queryByText('Marktplatz Zwei')).toBeTruthy()
  })

  it('meldet „keine Treffpunkte", wenn nach dem Filtern nichts übrig bleibt', () => {
    /*
     * Ohne diesen Fall stünde bei einer reinen Gruppen-Woche eine leere
     * Tages-Karte da — die Anzeige entscheidet über den Leerlauf-Text an der
     * gefilterten Liste, nicht an der rohen.
     */
    render(
      <Buehne
        state={{
          ...initialState(),
          planner: false, personId: 'p-g1', persons: PERSONEN, groups: GRUPPEN,
          week: 0, fsWeeks: [[G2]],
        }}
      >
        <FsProgram />
      </Buehne>,
    )
    expect(screen.queryByText('Marktplatz Zwei')).toBeNull()
    expect(screen.queryByText('Königreichssaal')).toBeNull()
  })
})
