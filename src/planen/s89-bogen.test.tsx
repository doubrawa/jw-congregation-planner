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
import { initialState } from '../app/init'
import { syncAuxSlots } from '../data/aux-class'
import { alleS89DerWoche } from '../data/planning'
import { buildDemoWeeks } from '../data/testdaten'
import type { PartItem } from '../data/types'
import { S89Bogen } from './S89Bogen'
import { seiten } from './s89-seiten'

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
    const zettel = alleS89DerWoche(weeks, 0)
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

    const zettel = alleS89DerWoche(weeks, 0)
    const inKlasse = zettel.filter((z) => z.aux === true)
    expect(inKlasse.length).toBeGreaterThan(0)
    expect(zettel.some((z) => z.aux !== true), 'der Hauptsaal fehlt nicht').toBe(true)
  })

  it('ohne Woche kein Zettel', () => {
    expect(alleS89DerWoche([], 0)).toEqual([])
    expect(alleS89DerWoche(buildDemoWeeks(), 99)).toEqual([])
  })
})

describe('seiten: die Aufteilung steht im Bauplan', () => {
  /*
   * Wie viele Zettel auf ein Blatt kommen, entscheidet nicht der Browser:
   * Chrome brach sowohl ein CSS-Raster als auch eine durchgehende Tabelle nach
   * zwei Reihen um, obwohl die dritte noch aufs Blatt gepasst hätte — aus
   * „6 je Seite" wurden stillschweigend 4. Deshalb je Blatt eine eigene
   * Tabelle, und die Aufteilung ist hier nachrechenbar.
   */
  const zettel = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `P${i}`, partner: '', date: '', type: '', point: '' }))

  it('sechs je Seite: drei Reihen, der Rest auf die nächste', () => {
    const s = seiten(zettel(8), 6)
    expect(s).toHaveLength(2)
    expect(s[0]).toHaveLength(3)
    expect(s[1]).toHaveLength(1)
  })

  it('vier je Seite: zwei Reihen', () => {
    const s = seiten(zettel(8), 4)
    expect(s.map((seite) => seite.length)).toEqual([2, 2])
  })

  it('die letzte Reihe darf halb leer bleiben', () => {
    const s = seiten(zettel(3), 6)
    expect(s[0]?.[1]).toEqual([expect.objectContaining({ name: 'P2' }), undefined])
  })

  it('ohne Zettel keine Seite', () => {
    expect(seiten([], 6)).toEqual([])
  })
})

describe('S89Bogen (Bedienung)', () => {
  const state = (): AppState => ({ ...initialState(), weeks: buildDemoWeeks(), week: 0 })

  it('legt für jede Aufgabe eine Karte an', () => {
    const { container } = render(<Buehne state={state()} />)
    expect(container.querySelectorAll('.s89-zettel')).toHaveLength(
      alleS89DerWoche(buildDemoWeeks(), 0).length,
    )
  })

  it('der Schalter entscheidet, ob der Partner-Zettel mitkommt', () => {
    const { container } = render(<Buehne state={state()} />)
    const schalter = container.querySelector('[role="switch"]')
    // Eingeschaltet: der übliche Fall, beide bekommen einen in die Hand.
    expect(schalter?.getAttribute('aria-checked')).toBe('true')
    const mit = container.querySelectorAll('.s89-zettel').length

    fireEvent.click(schalter!)
    const ohne = container.querySelectorAll('.s89-zettel').length
    expect(ohne).toBeLessThan(mit)
    // Genau die Gespräche fallen weg — nicht mehr und nicht weniger.
    expect(mit - ohne).toBe(alleS89DerWoche(buildDemoWeeks(), 0, '', false).filter((z) => z.partner).length)
  })

  it('ohne Partner-Zettel bleibt je Aufgabe einer', () => {
    const einfach = alleS89DerWoche(buildDemoWeeks(), 0, '', false)
    const doppelt = alleS89DerWoche(buildDemoWeeks(), 0)
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
    const anzahl = alleS89DerWoche(buildDemoWeeks(), 0).length
    expect(container.querySelectorAll('.s89-seite')).toHaveLength(Math.ceil(anzahl / 6))
  })

  it('der Knopf kennzeichnet den Ausdruck und ruft den Druck', () => {
    // Ohne das Kennzeichen druckte der Bogen mit dem Programm-Ausdruck um die
    // Wette — beide sagen „alles außer mir ausblenden".
    const drucke = vi.fn()
    vi.stubGlobal('print', drucke)
    const { container } = render(<Buehne state={state()} />)
    fireEvent.click(container.querySelector('.s89-druck-btn')!)
    expect(document.documentElement.dataset.print).toBe('s89')
    expect(drucke).toHaveBeenCalled()
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.print
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
    const { container } = render(<Buehne state={{ ...initialState(), weeks, week: 0 }} />)
    expect(container.querySelector('.s89-druck')).toBeNull()
    expect(container.querySelector('.s89-bogen')).toBeNull()
  })
})
