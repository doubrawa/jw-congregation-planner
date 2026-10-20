/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { syncAuxSlots } from '../data/aux-class'
import { alleS89DerWoche } from '../data/planning'
import { buildDemoWeeks } from '../../tests/testdaten/testdaten'
import type { PartItem } from '../data/types'
import { S89Bogen } from './S89Bogen'
import { STANDARD_ZEITEN } from '../data/vorgaben'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * T71 — der Druckbogen der S-89-Zettel.
 *
 * Zwei Dinge, die einzeln nichts taugen: Der Bogen muss **alle** Zettel der
 * Woche enthalten (auch die der Zusätzlichen Klasse), und er darf jede Aufgabe
 * nur **einmal** enthalten — ein Gespräch hat zwei Plätze, aber einen Zettel.
 */

function Buehne({ state }: { state: AppState }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>
          <S89Bogen />
        </AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

afterEach(cleanup)

describe('alleS89DerWoche', () => {
  it('nimmt jede Schulungsaufgabe — mit Gesprächspartner zweimal', () => {
    /*
     * Der Zettel geht auch an den Partner, also braucht es zwei davon. Gezählt
     * wird trotzdem die **Aufgabe** und nicht der Platz: Sonst hinge die Zahl
     * daran, wie viele Plätze ein Programmpunkt zufällig hat.
     */
    const weeks = buildDemoWeeks()
    const zettel = alleS89DerWoche(weeks, 0, STANDARD_ZEITEN)
    expect(zettel.length).toBeGreaterThan(0)
    // Jeder Zettel trägt einen Namen — ein leerer Platz gibt keinen.
    expect(zettel.every((z) => z.name !== '')).toBe(true)

    const mitPartner = zettel.filter((z) => z.partner)
    expect(mitPartner.length, 'die Demo-Woche hat Gespräche').toBeGreaterThan(0)
    // Jeder Partner-Zettel kommt genau doppelt vor, jeder andere genau einmal.
    const wieOft = (z: (typeof zettel)[number]) =>
      zettel.filter((a) => a.name === z.name && a.type === z.type && a.aux === z.aux).length
    expect(mitPartner.every((z) => wieOft(z) === 2)).toBe(true)
    expect(zettel.filter((z) => !z.partner).every((z) => wieOft(z) === 1)).toBe(true)
  })

  it('die Zusätzliche Klasse ist mit dabei — mit ihrem Ort', () => {
    /*
     * Der Ort ist auf dem Papier der eigentliche Punkt: Wer den Zettel in die
     * Hand bekommt, muss wissen, in welchem Raum er drankommt. Bis August 2026
     * stand dort ausnahmslos „Hauptsaal".
     */
    const weeks = syncAuxSlots(buildDemoWeeks(), true)
    const punkt = weeks[0]!.mid.sections
      .flatMap((s) => s.items)
      .find((i) => (i as PartItem).aux?.length) as PartItem | undefined
    expect(punkt, 'Demo-Woche hat einen Klassen-Platz').toBeDefined()
    punkt!.aux![0]!.name = 'Klara Klasse'

    const zettel = alleS89DerWoche(weeks, 0, STANDARD_ZEITEN)
    const inKlasse = zettel.filter((z) => z.aux === true)
    expect(inKlasse.length).toBeGreaterThan(0)
    expect(zettel.some((z) => z.aux !== true), 'der Hauptsaal fehlt nicht').toBe(true)
  })

  it('ohne Woche kein Zettel', () => {
    expect(alleS89DerWoche([], 0, STANDARD_ZEITEN)).toEqual([])
    expect(alleS89DerWoche(buildDemoWeeks(), 99, STANDARD_ZEITEN)).toEqual([])
  })
})

describe('S89Bogen (Bedienung)', () => {
  const state = (): AppState => ({ ...demoZustand(), weeks: buildDemoWeeks(), week: 0 })

  /**
   * Was im Moment des Druckens auf dem Bogen steht. Der Bogen entsteht erst
   * beim Klick, direkt unter `body` (`useDruckBogen`), und ist danach wieder
   * fort.
   */
  type ImDruck = { kennzeichen?: string; zettel: number; blaetter: number; felder: number[] }
  function drucke(container: HTMLElement): ImDruck {
    let imDruck: ImDruck = { zettel: 0, blaetter: 0, felder: [] }
    vi.stubGlobal('print', () => {
      imDruck = {
        kennzeichen: document.documentElement.dataset.print,
        zettel: document.querySelectorAll('.druck-bogen .s89-zettel-titel').length,
        blaetter: document.querySelectorAll('.druck-bogen .s89-blatt').length,
        felder: [...document.querySelectorAll('.druck-bogen .s89-gitter')].map((g) => g.querySelectorAll('.s89-zettel').length),
      }
    })
    fireEvent.click(container.querySelector('.s89-druck-btn')!)
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.print
    return imDruck
  }

  it('legt für jede Aufgabe einen Zettel an', () => {
    const { container } = render(<Buehne state={state()} />)
    expect(drucke(container).zettel).toBe(alleS89DerWoche(buildDemoWeeks(), 0, STANDARD_ZEITEN).length)
  })

  it('der Schalter entscheidet, ob der Partner-Zettel mitkommt', () => {
    const { container } = render(<Buehne state={state()} />)
    const schalter = container.querySelector('[role="switch"]')
    // Eingeschaltet: der übliche Fall, beide bekommen einen in die Hand.
    expect(schalter?.getAttribute('aria-checked')).toBe('true')
    const mit = drucke(container).zettel

    fireEvent.click(schalter!)
    const ohne = drucke(container).zettel
    expect(ohne).toBeLessThan(mit)
    // Genau die Gespräche fallen weg — nicht mehr und nicht weniger.
    expect(mit - ohne).toBe(alleS89DerWoche(buildDemoWeeks(), 0, STANDARD_ZEITEN, false).filter((z) => z.partner).length)
  })

  it('ohne Partner-Zettel bleibt je Aufgabe einer', () => {
    const einfach = alleS89DerWoche(buildDemoWeeks(), 0, STANDARD_ZEITEN, false)
    const doppelt = alleS89DerWoche(buildDemoWeeks(), 0, STANDARD_ZEITEN)
    expect(einfach.length).toBeLessThan(doppelt.length)
    const wieOft = (z: (typeof einfach)[number]) =>
      einfach.filter((a) => a.name === z.name && a.type === z.type && a.aux === z.aux).length
    expect(einfach.every((z) => wieOft(z) === 1)).toBe(true)
  })

  it('sechs je Blatt, ohne Auswahl', () => {
    /*
     * Der Betreiber hat beide Aufteilungen am Ausdruck verglichen: Sechs füllen
     * das A4 sauber und bleiben lesbar. Die Wahl ist deshalb wieder weg — eine
     * Einstellung, die man einmal ansieht und nie wieder anfasst, ist eine zu
     * viel.
     */
    const { container } = render(<Buehne state={state()} />)
    expect(container.querySelectorAll('.s89-druck-n')).toHaveLength(0)
    // Blätter = Zettel durch sechs, aufgerundet — nachgerechnet, nicht geraten:
    // Wie viele Zettel die Demo-Woche hat, hängt an ihren Gesprächen.
    const anzahl = alleS89DerWoche(buildDemoWeeks(), 0, STANDARD_ZEITEN).length
    const imDruck = drucke(container)
    expect(imDruck.blaetter).toBe(Math.ceil(anzahl / 6))
    // Auch ein halb leeres letztes Blatt hat sechs Felder: Seine Schnittkanten
    // stehen, wo sie auf jedem Blatt stehen.
    expect(imDruck.felder.every((n) => n === 6)).toBe(true)
  })

  it('der Knopf kennzeichnet den Ausdruck und ruft den Druck', () => {
    // Ohne das Kennzeichen druckte der Bogen mit dem Programm-Ausdruck um die
    // Wette — beide sagen „alles außer mir ausblenden".
    const { container } = render(<Buehne state={state()} />)
    expect(drucke(container).kennzeichen).toBe('bogen')
  })

  it('jedes Blatt trägt seine Kopfzeile — Thema, Tag der Zusammenkunft, Seitenzahl', () => {
    const { container } = render(<Buehne state={state()} />)
    let kopf = ''
    vi.stubGlobal('print', () => {
      kopf = document.querySelector('.druck-bogen .s89-blatt-kopf')?.textContent ?? ''
    })
    fireEvent.click(container.querySelector('.s89-druck-btn')!)
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.print
    expect(kopf).toContain('S-89')
    expect(kopf).toContain(zahlBinden('Dienstag, 8. September'))
    // „1 von" steht gebunden (T128) — `\s` trifft beide Leerzeichen.
    expect(kopf).toMatch(/Seite 1\svon \d/)
  })

  it('ohne Schulungsaufgaben steht gar nichts da', () => {
    const weeks = buildDemoWeeks()
    // Alle Plätze leeren → kein Zettel, keine Leiste.
    for (const section of weeks[0]!.mid.sections) {
      for (const item of section.items) {
        for (const slot of (item as PartItem).names ?? []) slot.name = ''
        for (const slot of (item as PartItem).aux ?? []) slot.name = ''
      }
    }
    const { container } = render(<Buehne state={{ ...demoZustand(), weeks, week: 0 }} />)
    expect(container.querySelector('.s89-druck')).toBeNull()
    expect(container.querySelector('.s89-bogen')).toBeNull()
  })
})
