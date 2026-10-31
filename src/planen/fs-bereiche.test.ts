/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'
import type { AppState } from '../app/context'
import type { TrolleyTermin } from '../data/types'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { DEMO_TROLLEY_PERSONEN, DEMO_TROLLEYS } from '../../tests/testdaten/testdaten'
import { aktiverFsBereich, fsBereiche } from './fs-bereiche'

/**
 * **Den Reiter „Trolleys" sieht, wer mit dem Trolley gehen darf** (T130,
 * Betreiber am 18.10.2026: „Nur diejenigen, die das Trolley-Recht haben,
 * sollten den Trolley-Tab sehen" — Admin und Planer immer, entschieden am
 * 19.10.2026).
 *
 * Bis dahin stand der Reiter beim Ansehen für alle, sobald die Versammlung
 * einen Trolley hatte. Die Datenbank lässt weiter jedes Mitglied lesen: Der
 * Kalender ist nicht geheim, er gehört nur nicht in jede Ansicht.
 */

/** Ein Verkündiger der Demo-Versammlung mit ihren Trolleys — mit oder ohne Trolley-Recht. */
function verkuendiger(mitRecht: boolean): AppState {
  const demo = demoZustand()
  const recht = new Set(DEMO_TROLLEY_PERSONEN)
  const persons = demo.persons.map((p) => (recht.has(p.id) ? { ...p, priv: { ...p.priv, zeugnis: true } } : p))
  const person = persons.find((p) => recht.has(p.id) === mitRecht && !demo.groups.some((g) => g.overseerId === p.id || g.assistantId === p.id))
  if (!person) throw new Error('Demo-Bestand ohne passende Person')
  return { ...demo, persons, trolleys: DEMO_TROLLEYS, screen: 'programm', personId: person.id, planner: false, zuteiler: false }
}

describe('Wer den Reiter „Trolleys" sieht', () => {
  it('ein Verkündiger mit Trolley-Recht sieht ihn', () => {
    expect(fsBereiche(verkuendiger(true))).toContain('trolleys')
  })

  it('ein Verkündiger ohne Trolley-Recht nicht — ein gemerkter Reiter fällt auf die Treffpunkte zurück', () => {
    const ohne = verkuendiger(false)
    expect(fsBereiche(ohne)).not.toContain('trolleys')
    expect(aktiverFsBereich({ ...ohne, fsBereich: 'trolleys' })).toBe('treffpunkte')
  })

  it('Admin und Planer sehen ihn immer, auch ohne das Recht', () => {
    const ohne = verkuendiger(false)
    expect(fsBereiche({ ...ohne, planner: true })).toContain('trolleys')
    expect(fsBereiche({ ...ohne, zuteiler: true })).toContain('trolleys')
  })

  it('ohne Trolley in der Versammlung sieht ihn niemand — auch mit Recht nicht', () => {
    expect(fsBereiche({ ...verkuendiger(true), trolleys: [] })).not.toContain('trolleys')
    expect(fsBereiche({ ...verkuendiger(false), planner: true, trolleys: [] })).not.toContain('trolleys')
  })

  it('beim Planen gibt es ihn nicht — es gibt dort nichts zu planen', () => {
    expect(fsBereiche({ ...verkuendiger(true), screen: 'planen', planner: true })).not.toContain('trolleys')
  })

  it('ein Konto ohne Person sieht ihn nicht, solange es nicht plant', () => {
    expect(fsBereiche({ ...verkuendiger(true), personId: null })).not.toContain('trolleys')
  })

  it('ohne Recht, aber mit eigenem Termin sieht er ihn — nach dem Entzug käme er sonst nicht mehr zum Austragen', () => {
    const ohne = verkuendiger(false)
    const termin: TrolleyTermin = {
      id: 'r-entzug', trolleyId: DEMO_TROLLEYS[0]!.id, datum: '2099-01-05', von: '10:00', bis: '11:00',
      pid: ohne.personId!, partner: null, gemeinsam: false,
    }
    expect(fsBereiche({ ...ohne, trolleyTermine: [termin] })).toContain('trolleys')
    // Als Partner genauso — und ein vergangener Termin hält den Reiter nicht.
    expect(fsBereiche({ ...ohne, trolleyTermine: [{ ...termin, pid: 'jemand', partner: ohne.personId! }] })).toContain('trolleys')
    expect(fsBereiche({ ...ohne, trolleyTermine: [{ ...termin, datum: '2020-01-06' }] })).not.toContain('trolleys')
  })
})
