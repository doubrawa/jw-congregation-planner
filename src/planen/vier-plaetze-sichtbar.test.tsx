/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { syncAuxSlots } from '../data/aux-class'
import { programmPlaetze } from '../data/helpers'
import {
  buildDemoWeeks,
  CONGREGATION,
  DEMO_GROUPS,
  DEMO_PERSONS,
  DEMO_SERVICES,
} from '../data/testdaten'
import type { Week } from '../data/types'

/**
 * **Der Bildschirm ist der sechste Aufzähler.**
 *
 * `alle-plaetze.test.ts` fragt jede *Funktion*, ob sie alle vier Platzsorten
 * erreicht — Hauptsaal, Zusätzliche Klasse, Ratgeber, Hilfsdienste. Die
 * Bedienoberfläche steht dort nicht, und sie ist der einzige Aufzähler, den der
 * Planer wirklich sieht.
 *
 * Sie zählt nach einer **anderen** Regel als die Daten: `programmPlaetze` gibt
 * die zweite Reihe für jeden Punkt heraus, der eine hat (`raeume`), der
 * Planen-Bildschirm zeigt sie nur bei einem Schülerteil (`istSchuelerteil`).
 * Solange nur Schülerteile eine zweite Reihe bekommen, deckt sich das — genau
 * diese Verabredung wird hier festgehalten.
 *
 * Liefen die beiden auseinander, wäre die Wirkung die vertraute: Die
 * Auto-Zuteilung besetzt den Platz, die Erinnerung geht hinaus, die Aufgabe
 * steht unter „Meine Aufgaben" — und im Plan des Planers ist er nicht zu
 * sehen. Er könnte ihn weder ändern noch leeren.
 */

vi.mock('../app/hydrate', () => ({ loadAndHydrate: () => Promise.resolve() }))
vi.mock('../lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  performLogout: () => {},
}))

const { AppShell } = await import('../app/AppShell')

window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

afterEach(cleanup)

/**
 * Eine Woche, in der **jeder** Platz besetzt ist — mit einem eigenen,
 * unverwechselbaren Namen je Platz.
 *
 * Besetzt wird über `programmPlaetze`, also über den Aufzähler der Daten
 * selbst. Damit prüft der Test nicht gegen eine abgeschriebene Liste: Kommt
 * eine Platzsorte hinzu, taucht sie hier automatisch auf und muss auf dem
 * Bildschirm erscheinen.
 */
function alleBesetzt(): { weeks: Week[]; namen: string[] } {
  const weeks = syncAuxSlots(buildDemoWeeks(), true)
  const woche = weeks[0]!
  const namen: string[] = []
  let n = 0
  const taufe = (): string => `Zzname${(n++).toString().padStart(2, '0')}`

  for (const { slot } of programmPlaetze(woche.mid)) {
    const name = taufe()
    slot.name = name
    delete slot.pid
    delete slot.rolle // kein Gastredner — der zählt bewusst nicht mit
    namen.push(name)
  }
  const ratgeber = woche.mid.auxRatgeber
  if (ratgeber) {
    ratgeber.name = taufe()
    delete ratgeber.pid
    namen.push(ratgeber.name)
  }
  for (const svc of DEMO_SERVICES) {
    if (svc.groups) continue // Gruppen-Rotation ist keine Person
    woche.mid.helpers[svc.key] = Array.from({ length: svc.count }, () => {
      const name = taufe()
      namen.push(name)
      return { name }
    })
  }
  return { weeks, namen }
}

function zeige(weeks: Week[]) {
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: DEMO_PERSONS[0]!.id,
    planner: true,
    screen: 'planen',
    tab: 'mid',
    terminGewaehlt: true,
    congregation: { ...CONGREGATION },
    persons: [...DEMO_PERSONS],
    groups: [...DEMO_GROUPS],
    services: [...DEMO_SERVICES],
    weeks,
    auxClass: true,
    week: 0,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AppShell />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

describe('Der Planen-Bildschirm zeigt jeden besetzten Platz', () => {
  it('alle vier Sorten stehen im Plan — keiner fehlt', () => {
    const { weeks, namen } = alleBesetzt()
    // Gegenprobe: Ohne Plätze prüfte der Test nichts. Die Demo-Woche unter der
    // Woche trägt weit mehr als zwanzig.
    expect(namen.length, 'zu wenige Plätze besetzt').toBeGreaterThan(20)

    /*
      Gelesen werden **die Plätze selbst**, nicht der ganze Bildschirm.
      Darunter steht „Plan senden" und zählt jeden noch nicht gemeldeten Namen
      auf — über `eachAssignedSlot`, also über alle vier Sorten. Gegen den
      vollen Text geprüft wäre der Test grün geblieben, auch wenn das Programm
      die zweite Reihe gar nicht mehr zeichnete; genau das hat die Gegenprobe
      gezeigt. Ein `.slot-chip` ist dagegen der Knopf, über den der Planer den
      Platz öffnet — steht ein Name in keinem, kommt er nicht an ihn heran.
    */
    const chips = [...zeige(weeks).container.querySelectorAll('.slot-chip')]
      .map((el) => el.textContent ?? '')
      .join(' | ')
    const fehlend = namen.filter((name) => !chips.includes(name))
    expect(fehlend, `nicht anklickbar im Plan: ${fehlend.join(', ')}`).toEqual([])
  })

  it('… und die zweite Reihe ist wirklich dabei', () => {
    // Die Klasse ist die Sorte, die bei jeder Erweiterung vergessen wurde.
    // Ohne diese Zeile wäre der Test oben auch dann grün, wenn `syncAuxSlots`
    // gar keine zweite Reihe mehr anlegte.
    const { weeks } = alleBesetzt()
    const zweiteReihe = [...programmPlaetze(weeks[0]!.mid)].filter((p) => p.aux)
    expect(zweiteReihe.length, 'keine Plätze in der Zusätzlichen Klasse').toBeGreaterThan(3)
  })
})
