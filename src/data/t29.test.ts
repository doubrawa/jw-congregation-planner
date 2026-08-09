import { describe, expect, it } from 'vitest'
import { emptyQualifications, partWorkload } from './helpers'
import {
  assignmentsInMeeting,
  assignSlot,
  clearAssignments,
  deriveMyTasks,
  isGuestRole,
  isSpeakerRole,
  rolleBasis,
  ROLE_GUEST_SPEAKER,
  ROLE_OWN_SPEAKER,
  slotRolle,
} from './planning'
import type { Meeting, PartItem, PartSlotSelection, Person, Week } from './types'

/**
 * T29 — der öffentliche Vortrag kann von einem eigenen Bruder gehalten werden.
 *
 * Der Import legt den Platz fest mit `rolle: 'Gastredner'` an, und `SKIP_ROLE`
 * filtert ihn überall heraus: keine `pid`, keine Aufgabe, keine Bestätigung,
 * keine Erinnerung, keine Anrechnung auf die Auslastung (F1). Für einen Redner
 * der **eigenen** Versammlung ist das durchweg falsch.
 *
 * Entschieden wurde „umschaltbar, pro Woche". Der Schalter ist die Wahl selbst:
 *
 *   Freitext eintragen → „Gastredner · <Versammlung>", wie bisher
 *   Person antippen    → „Redner" + `pid`
 *
 * `Redner` steht bewusst **nicht** in `SKIP_ROLE`. Damit folgt alles Übrige
 * ohne eine einzige Sonderregel — jeder Mechanismus, der externe Redner
 * überspringt, fragt genau dort nach.
 */

const REDNER: PartSlotSelection = {
  kind: 'part',
  wi: 0,
  tab: 'we',
  si: 1,
  ii: 0,
  ni: 0,
  label: 'Öffentlicher Vortrag',
  priv: 'vortrag',
  groups: false,
  guest: true,
}

/** Wochenende wie aus `parse.ts`: Vortragsplatz auf „Gastredner". */
function makeWeek(): Week {
  const we: Meeting = {
    date: 'Sonntag, 13. September · 10:00',
    end: 'Ende ca. 11:45',
    sections: [
      { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ title: 'Lied · Gebet', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzWe' }] }] },
      { label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol', items: [{ title: '(Vortragsthema eintragen)', meta: '30 Min.', mins: 30, names: [{ name: '', rolle: ROLE_GUEST_SPEAKER, bereichsKey: 'vortrag' }] }] },
    ],
    helpers: {},
  }
  const mid: Meeting = { date: '', end: '', sections: [], helpers: {} }
  return { range: '7.–13. September', book: '', start: '2026-09-07', current: false, mid, we }
}

const person: Person = {
  id: 'p-hartmann',
  fn: 'Martin',
  ln: 'Hartmann',
  dn: 'M. Hartmann',
  role: 'aeltester',
  tel: '',
  mail: '',
  priv: { ...emptyQualifications(), vortrag: true },
}

const vortragsSlot = (w: Week) => (w.we.sections[1].items[0] as PartItem).names[0]

describe('Die Rollen sagen, wer den Vortrag hält', () => {
  it('„Redner" ist nicht extern — genau daran hängt alles Weitere', () => {
    expect(isGuestRole(ROLE_OWN_SPEAKER)).toBe(false)
    expect(isGuestRole(ROLE_GUEST_SPEAKER)).toBe(true)
    expect(isGuestRole('Gastredner · Vers. Nordheim')).toBe(true)
    expect(isGuestRole('Kreisaufseher')).toBe(true)
  })

  it('„Gastredner" enthält nicht versehentlich „Redner"', () => {
    // Groß-/Kleinschreibung trennt die beiden — sonst wäre jeder Gastredner
    // zugleich ein eigener Redner und die Unterscheidung wertlos.
    expect(rolleBasis('Gastredner · Vers. Nordheim')).toBe('Gastredner')
    expect(rolleBasis(ROLE_OWN_SPEAKER)).toBe('Redner')
    expect('Gastredner'.includes(ROLE_OWN_SPEAKER)).toBe(false)
  })

  it('isSpeakerRole umfasst beide Fälle — sonst gäbe es keinen Weg zurück', () => {
    // Dieses Flag öffnet die Freitext-Felder im Sheet. Träfe es beim eigenen
    // Redner nicht zu, bliebe der Platz für immer auf „eigener Redner".
    expect(isSpeakerRole(ROLE_OWN_SPEAKER)).toBe(true)
    expect(isSpeakerRole(ROLE_GUEST_SPEAKER)).toBe(true)
    expect(isSpeakerRole('Gastredner · Vers. Nordheim')).toBe(true)
    expect(isSpeakerRole('Vorsitz')).toBe(false)
    expect(isSpeakerRole(undefined)).toBe(false)
  })
})

describe('Der eigene Redner ist eine vollwertige Zuteilung', () => {
  const mitEigenem = () =>
    assignSlot([makeWeek()], REDNER, 'M. Hartmann', ROLE_OWN_SPEAKER, person.id)

  it('trägt Rolle und pid ein', () => {
    const slot = vortragsSlot(mitEigenem()[0])
    expect(slot.rolle).toBe(ROLE_OWN_SPEAKER)
    expect(slot.pid).toBe(person.id)
  })

  it('zählt auf die Auslastung — der Gastredner nicht', () => {
    expect(partWorkload(mitEigenem(), person)).toBe(1)
    const gast = assignSlot([makeWeek()], REDNER, 'M. Hartmann', 'Gastredner · Vers. Nordheim')
    expect(partWorkload(gast, person)).toBe(0)
  })

  it('erscheint in „Meine Aufgaben" — der Gastredner nicht', () => {
    expect(deriveMyTasks(mitEigenem(), [], 'M. Hartmann', {}, '', person.id)).toHaveLength(1)
    const gast = assignSlot([makeWeek()], REDNER, 'M. Hartmann', 'Gastredner · Vers. Nordheim')
    expect(deriveMyTasks(gast, [], 'M. Hartmann', {}, '', person.id)).toHaveLength(0)
  })

  it('slotRolle liest die geschriebene Rolle zurück', () => {
    // Der Reducer entscheidet daran, ob es einen Bestätigungs-Flow gibt —
    // nicht am Auswahl-Flag, das nur „ist der Redner-Platz" bedeutet.
    expect(slotRolle(mitEigenem(), REDNER)).toBe(ROLE_OWN_SPEAKER)
    expect(slotRolle([makeWeek()], REDNER)).toBe(ROLE_GUEST_SPEAKER)
  })
})

describe('Ein Gastredner heißt zufällig wie ein Bruder von uns', () => {
  /*
    Bei T29 aufgefallen, eigene Ursache: `gehoertZu` fiel ohne `pid` auf den
    Anzeigenamen zurück — auch bei externen Rednern. Ein Gastredner aus einer
    anderen Versammlung, der zufällig wie ein Bruder von uns heißt, erhöhte
    dessen Auslastung und galt für ihn als „heute schon zugeteilt". Die
    Auto-Zuteilung überging ihn daraufhin.

    Die Warnung vor doppelten Anzeigenamen greift hier nicht: der Gast steht in
    keiner Personenliste. Für ihn ist der Name kein schwächerer Anhalt, sondern
    gar keiner.
  */
  const gast = () => assignSlot([makeWeek()], REDNER, 'M. Hartmann', 'Gastredner · Vers. Nordheim')

  it('zählt nicht auf die Auslastung des Namensvetters', () => {
    expect(partWorkload(gast(), person)).toBe(0)
  })

  it('taucht nicht als Doppelbelegung des Namensvetters auf', () => {
    expect(assignmentsInMeeting(gast()[0].we, person, [])).toEqual([])
  })

  it('der Namens-Rückfall bleibt für Altdaten erhalten', () => {
    // Zuteilungen von vor `pid` haben nur den Namen — die dürfen nicht
    // mitgerissen werden. Unterschieden wird an der Rolle, nicht an der pid.
    const alt = assignSlot([makeWeek()], { ...REDNER, si: 0 }, 'M. Hartmann')
    expect(partWorkload(alt, person)).toBe(1)
  })
})

describe('Der Weg zurück zum Gastredner', () => {
  it('„Leeren" setzt den Platz auf „Gastredner" zurück', () => {
    // Bliebe „Redner" stehen, wäre der leere Platz ein offener Slot, den die
    // Auto-Zuteilung besetzt. Den Redner vereinbart man aber.
    const eigen = assignSlot([makeWeek()], REDNER, 'M. Hartmann', ROLE_OWN_SPEAKER, person.id)
    const { weeks, count } = clearAssignments(eigen, 0, 'we', 'parts')
    expect(count).toBe(1)
    expect(vortragsSlot(weeks[0]).name).toBe('')
    expect(vortragsSlot(weeks[0]).rolle).toBe(ROLE_GUEST_SPEAKER)
    expect(vortragsSlot(weeks[0]).pid).toBeUndefined()
  })

  it('„Leeren" lässt einen echten Gastredner unangetastet', () => {
    const gast = assignSlot([makeWeek()], REDNER, 'M. Hartmann', 'Gastredner · Vers. Nordheim')
    const { weeks, count } = clearAssignments(gast, 0, 'we', 'parts')
    expect(count).toBe(0)
    expect(vortragsSlot(weeks[0]).name).toBe('M. Hartmann')
  })

  it('ein Gastredner nach einem eigenen Redner verliert die pid', () => {
    const eigen = assignSlot([makeWeek()], REDNER, 'M. Hartmann', ROLE_OWN_SPEAKER, person.id)
    const zurueck = assignSlot(eigen, REDNER, 'R. Otte', 'Gastredner · Vers. Südfeld')
    expect(vortragsSlot(zurueck[0]).pid).toBeUndefined()
    expect(vortragsSlot(zurueck[0]).rolle).toBe('Gastredner · Vers. Südfeld')
  })
})
