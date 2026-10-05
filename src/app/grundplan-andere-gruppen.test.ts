/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { reducer } from './reducer'
import type { AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { DEMO_FS_RULES } from '../../tests/testdaten/testdaten'
import { buildFsWeeks } from '../data/fs'
import type { FsInstance } from '../data/types'

/**
 * **Eine Regel des Grundplans setzt nur ihre eigenen Treffpunkte neu auf**
 * (5.10.2026).
 *
 * Bis dahin rechnete jede Grundplan-Änderung — eine Regel ändern, anlegen,
 * entfernen — Zeit und Ort **aller** Treffpunkte aller geladenen Wochen auf die
 * Regelwerte zurück. Was der Admin oder ein anderer Gruppenaufseher für eine
 * einzelne Woche angepasst hatte, war danach weg. Und seit die Datenbank den
 * Gruppenaufseher auf seine Gruppe beschränkt (`fs_weeks_pruefen`), wies sie
 * die Wochen ab, die er dabei schrieb: Sie enthielten Änderungen an fremden
 * Gruppen. Die App lud nach, und seine Regel kam in diesen Wochen nie an.
 *
 * Geprüft wird hier, was die Datenbank prüft: die Treffpunkte der übrigen
 * Gruppen ohne Person-Id (`fs_fremde` in schema.sql).
 */

/** Demo-Bestand mit den Treffpunkten aus dem Grundplan (Wochen 7., 14., 21. und 28. September 2026). */
function zustand(over: Partial<AppState> = {}): AppState {
  const basis = demoZustand()
  return {
    ...basis,
    planner: true,
    fsWeeks: buildFsWeeks(basis.weeks.map((w) => w.start), DEMO_FS_RULES),
    confirmations: {},
    terminGewaehlt: true,
    ...over,
  }
}

/** Was `fs_fremde` vergleicht: die Treffpunkte, die nicht zu `eigene` gehören, ohne `lpid`. */
function fremde(woche: readonly FsInstance[], eigene: string): unknown[] {
  return woche
    .filter((inst) => inst.grp !== eigene)
    .map(({ lpid: _ohne, ...rest }) => rest)
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Der Treffpunkt einer Regel in Woche `wi`. */
const treffpunkt = (s: AppState, wi: number, ruleId: string) => s.fsWeeks[wi]?.find((inst) => inst.ruleId === ruleId)

/** Gruppe 2 (Regel r5) trifft sich in Woche 1 ausnahmsweise woanders und später. */
function mitAnpassung(): AppState {
  return reducer(zustand(), { type: 'fsInstUpdate', wi: 1, id: 'r5', patch: { place: 'Bei Familie Sommer', time: '10:30' } })
}

describe('Eine Grundplan-Änderung lässt die Anpassungen der übrigen Treffpunkte stehen', () => {
  it('der Gruppenaufseher von Gruppe 1 ändert seine Regel — Gruppe 2 behält ihre Woche, und die Datenbank nähme sie an', () => {
    const vorher = mitAnpassung()
    const nachher = reducer(vorher, { type: 'fsRuleUpdate', id: 'r4', patch: { time: '10:00', place: 'Bei Familie Lang' } })

    expect(treffpunkt(nachher, 1, 'r5')).toMatchObject({ place: 'Bei Familie Sommer', time: '10:30' })
    for (let wi = 0; wi < nachher.fsWeeks.length; wi++) {
      expect(fremde(nachher.fsWeeks[wi] ?? [], 'g1'), `Woche ${wi}`).toEqual(fremde(vorher.fsWeeks[wi] ?? [], 'g1'))
    }
    // Die eigene Regel kommt in jeder Woche an, in der sie gilt.
    for (let wi = 0; wi < nachher.fsWeeks.length; wi++) {
      const eigener = treffpunkt(nachher, wi, 'r4')
      if (eigener) expect(eigener, `Woche ${wi}`).toMatchObject({ time: '10:00', place: 'Bei Familie Lang' })
    }
  })

  it('auch eine neue Regel und eine entfernte lassen die Anpassung stehen', () => {
    const vorher = mitAnpassung()
    const mitNeuer = reducer(vorher, { type: 'fsRuleAdd', grp: 'g1' })
    expect(treffpunkt(mitNeuer, 1, 'r5')).toMatchObject({ place: 'Bei Familie Sommer', time: '10:30' })

    const ohne = reducer(vorher, { type: 'fsRuleRemove', id: 'r4' })
    expect(treffpunkt(ohne, 1, 'r5')).toMatchObject({ place: 'Bei Familie Sommer', time: '10:30' })
  })

  it('wessen Regel sich ändert, dessen Woche geht auf die Regel zurück — wie bisher', () => {
    const nachher = reducer(mitAnpassung(), { type: 'fsRuleUpdate', id: 'r5', patch: { time: '09:45' } })
    expect(treffpunkt(nachher, 1, 'r5')).toMatchObject({ place: 'Königreichssaal, Nebenraum', time: '09:45' })
  })

  it('die Besetzung bleibt in jedem Fall — auch am Treffpunkt der geänderten Regel', () => {
    const vorher = mitAnpassung()
    const besetzt: AppState = {
      ...vorher,
      fsWeeks: vorher.fsWeeks.map((woche, wi) =>
        wi === 1 ? woche.map((inst) => (inst.ruleId === 'r4' ? { ...inst, leader: 'Manfred Albrecht', lpid: 'p1' } : inst)) : woche,
      ),
    }
    const nachher = reducer(besetzt, { type: 'fsRuleUpdate', id: 'r4', patch: { time: '10:00' } })
    expect(treffpunkt(nachher, 1, 'r4')).toMatchObject({ leader: 'Manfred Albrecht', lpid: 'p1', time: '10:00' })
  })

  it('eine Woche, an der sich nichts ändert, behält ihre Referenz — sie wird nicht geschrieben', () => {
    const vorher = zustand()
    // Ein anderer Ort für den Monatstreffpunkt (r3, jeder 1. Samstag): Woche 0
    // (7. September) hat ihn nicht.
    const nachher = reducer(vorher, { type: 'fsRuleUpdate', id: 'r3', patch: { place: 'Saal B' } })
    const ohneR3 = vorher.fsWeeks.findIndex((woche) => !woche.some((inst) => inst.ruleId === 'r3'))
    expect(ohneR3).toBeGreaterThanOrEqual(0)
    expect(nachher.fsWeeks[ohneR3]).toBe(vorher.fsWeeks[ohneR3])
  })
})
