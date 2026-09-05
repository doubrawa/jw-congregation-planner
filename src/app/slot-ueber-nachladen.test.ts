/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { reducer } from './reducer'
import type { AppAction, AppState, HydratePayload } from './context'
import { initialState } from './init'
import {
  buildDemoFsWeeks,
  buildImportWeek,
  CONGREGATION,
  DEMO_GROUPS,
  DEMO_PERSONS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/testdaten'
import { isoDay } from '../data/meeting-dates'
import type { Week } from '../data/types'

/**
 * **Der offene Platz muss dieselbe Woche meinen wie vorher.**
 *
 * `slotSel` trägt die Woche als **Ordnungszahl** (`wi`) — die Position im
 * geladenen Fenster. Das Fenster hält die jüngsten 52 Wochen und rutscht: Kommt
 * eine neue dazu, fällt vorn die älteste heraus, und **jede** Zahl dahinter
 * meint danach eine andere Woche.
 *
 * Das ist normalerweise egal, weil `navigate` das Blatt schließt. Ein Weg führt
 * aber daran vorbei: Schlägt ein Schreibvorgang wegen eines Konflikts fehl
 * (T39), lädt `store.tsx` **still** nach — ohne Navigation, mitten in der
 * Arbeit, also genau dann, wenn ein Zuteilungs-Blatt offen steht. Danach zeigte
 * `slotSel.wi` auf eine andere Woche, und der nächste Klick schrieb den Namen
 * dorthin. Lautlos, in eine Woche, die der Planer gar nicht offen hatte.
 *
 * `hydrate` löst dasselbe Problem für die **angezeigte** Woche längst — über
 * die Kennung statt über die Zahl (`gewaehlteKennung`). Der offene Platz geht
 * jetzt denselben Weg. Ist seine Woche nicht mehr dabei, wird das Blatt
 * geschlossen: Ein Platz ohne Woche ist keiner.
 */

/** Eine Woche mit dem Montag `start` — sonst die Form des Imports. */
function woche(start: string): Week {
  return { ...buildImportWeek(), start }
}

function ladung(weeks: Week[]): HydratePayload {
  return {
    congregationId: 'c1',
    userId: 'u1',
    empty: false,
    congregation: { ...CONGREGATION },
    planner: true,
    personId: DEMO_PERSONS[0]!.id,
    persons: [...DEMO_PERSONS],
    services: [...DEMO_SERVICES],
    groups: [...DEMO_GROUPS],
    weeks,
    fsRules: [],
    fsWeeks: buildDemoFsWeeks(),
    fsBase: isoDay(FS_BASE),
    absences: [],
    notifications: [],
    confirmations: {},
    sentLog: {},
    reminders: { first: 7, last: 1, repeat: false },
    congLang: 'Deutsch',
    progLangs: [],
    auxClass: false,
    members: [],
    invites: [],
  }
}

const MONTAGE = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']

/** Zustand mit den Wochen `starts` und offenem Blatt auf `wi`. */
function mitOffenemBlatt(starts: string[], wi: number): AppState {
  const geladen = reducer(initialState(), {
    type: 'hydrate',
    payload: ladung(starts.map(woche)),
  })
  return reducer(geladen, {
    type: 'openSlot',
    sel: { kind: 'part', wi, tab: 'mid', si: 1, ii: 0, ni: 0, priv: null, groups: false, label: 'x' },
  })
}

/** Nachladen, wie es der Konflikt-Melder auslöst: still, ohne Navigation. */
function nachladen(state: AppState, starts: string[]): AppState {
  const action: AppAction = { type: 'hydrate', payload: ladung(starts.map(woche)) }
  return reducer(state, action)
}

describe('Ein offenes Zuteilungs-Blatt übersteht das stille Nachladen', () => {
  it('rutscht das Fenster, wandert die Zahl mit', () => {
    // Offen auf der dritten Woche (21.9.).
    const vorher = mitOffenemBlatt(MONTAGE.slice(0, 4), 2)
    expect(vorher.weeks[vorher.slotSel!.wi]!.start).toBe('2026-09-21')

    // Nachgeladen: vorn eine weniger, hinten eine mehr — jede Zahl verschiebt sich.
    const nachher = nachladen(vorher, MONTAGE.slice(1))
    expect(nachher.slotSel, 'das Blatt wurde grundlos geschlossen').not.toBeNull()
    expect(
      nachher.weeks[nachher.slotSel!.wi]!.start,
      'der offene Platz zeigt auf eine andere Woche',
    ).toBe('2026-09-21')
  })

  it('ist die Woche nicht mehr dabei, schließt das Blatt', () => {
    const vorher = mitOffenemBlatt(MONTAGE.slice(0, 3), 0) // 7.9.
    const nachher = nachladen(vorher, MONTAGE.slice(3)) // 7.9. ist weg
    expect(nachher.slotSel, 'ein Platz ohne Woche blieb offen').toBeNull()
  })

  it('ohne Verschiebung bleibt alles, wie es war', () => {
    // Gegenprobe: Die Absicherung darf nicht bei jedem Nachladen schließen —
    // der Konflikt-Melder lädt mitten in der Arbeit.
    const vorher = mitOffenemBlatt(MONTAGE.slice(0, 4), 2)
    const nachher = nachladen(vorher, MONTAGE.slice(0, 4))
    expect(nachher.slotSel?.wi).toBe(2)
    expect(nachher.weeks[nachher.slotSel!.wi]!.start).toBe('2026-09-21')
  })
})
