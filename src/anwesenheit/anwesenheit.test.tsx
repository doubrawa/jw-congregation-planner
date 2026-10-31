/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useApp,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { Anwesenheit } from '../data/anwesenheit'
import type { Person, Week } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import { AnwesenheitAnsicht as AnwesenheitInDerAuswertung } from './AnwesenheitAnsicht'
import { AnwesenheitFormular } from './AnwesenheitFormular'
import { AnwesenheitKarte } from './AnwesenheitKarte'
import { AnwesenheitZeile } from './AnwesenheitZeile'
import { useAnwesenheitMonate } from './useAnwesenheitMonate'

/**
 * **Die Anwesenden in der Oberfläche** (T152): Der Saalordner trägt während
 * seiner Zusammenkunft auf dem Start ein, im Programm steht danach die Zahl,
 * und die Auswertung zeigt je Monat den Durchschnitt — mit dem Weg zum
 * Nachtragen, wo eine Zahl fehlt, und zum Ausdruck für den Bericht.
 *
 * Gegenproben gehören dazu: Wer nicht zählt, sieht kein Formular; vor dem
 * Beginn gibt es nichts einzutragen; was keine Zahl ist, geht nicht hinaus.
 */

const t = dict('de')

const ICH: Person = { id: 'p9', fn: 'Simon', ln: 'Krüger', role: 'verkuendiger', female: false, priv: {} as Person['priv'] }
const LENA: Person = { id: 'p4', fn: 'Lena', ln: 'Hoffmann', role: 'verkuendiger', female: true, priv: {} as Person['priv'] }

/** Dienstag 19:00 und Sonntag 10:00; Simon ist unter der Woche Saalordner. */
function woche(start: string): Week {
  return {
    range: '', book: '', start,
    mid: { date: '', end: '', sections: [], helpers: { saal: [{ name: 'Simon Krüger', pid: 'p9' }] } },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...demoZustand(),
    lang: 'de',
    planner: false,
    zuteiler: false,
    personId: 'p9',
    persons: [ICH, LENA],
    weeks: [woche('2026-09-07')],
    anwesenheit: [],
    staleAt: null,
    congregation: { name: 'Nordheim', hall: '', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
}

function zeige(knoten: ReactNode, state: AppState) {
  const dispatch = vi.fn()
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>{knoten}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text)
/** Das Feld zu seiner Marke — über `htmlFor`, wie ein Vorleseprogramm es findet. */
const feld = (c: HTMLElement, marke: string) => {
  const label = [...c.querySelectorAll('label')].find((l) => l.textContent === marke)
  return document.getElementById(label!.htmlFor) as HTMLInputElement
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Das Formular', () => {
  it('Saal und Video ergeben „Zusammen", Speichern trägt beide ein', () => {
    const { container, dispatch } = zeige(<AnwesenheitFormular woche="2026-09-07" tab="mid" eintrag={undefined} />, zustand())
    fireEvent.change(feld(container, t.anwesendSaal), { target: { value: '64' } })
    fireEvent.change(feld(container, t.anwesendVideo), { target: { value: '23' } })
    expect(container.querySelector('.anwesend-zusammen')?.textContent).toBe(fill(t.anwesendZusammenN, { n: 87 }))
    fireEvent.click(knopf(t.anwesendSpeichern)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'anwesenheitSetzen', woche: '2026-09-07', tab: 'mid', saal: 64, video: 23 })
  })

  it('ein leeres Feld heißt „nicht eingetragen" — der Zoom-Ordner kommt später', () => {
    const { container, dispatch } = zeige(<AnwesenheitFormular woche="2026-09-07" tab="mid" eintrag={undefined} />, zustand())
    fireEvent.change(feld(container, t.anwesendSaal), { target: { value: '64' } })
    fireEvent.click(knopf(t.anwesendSpeichern)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'anwesenheitSetzen', woche: '2026-09-07', tab: 'mid', saal: 64, video: null })
  })

  it('was keine ganze Zahl ist, meldet das Feld — und nichts geht hinaus', () => {
    const { container, dispatch } = zeige(<AnwesenheitFormular woche="2026-09-07" tab="mid" eintrag={undefined} />, zustand())
    fireEvent.change(feld(container, t.anwesendSaal), { target: { value: '8,5' } })
    fireEvent.click(knopf(t.anwesendSpeichern)!)
    expect(dispatch).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(fill(t.anwesendUngueltig, { max: '9.999' }))
    expect(feld(container, t.anwesendSaal).getAttribute('aria-invalid')).toBe('true')
  })

  it('eine schon eingetragene Zahl steht im Feld', () => {
    const eintrag: Anwesenheit = { woche: '2026-09-07', tab: 'mid', saal: 70, video: null, pid: 'p9' }
    const { container } = zeige(<AnwesenheitFormular woche="2026-09-07" tab="mid" eintrag={eintrag} />, zustand())
    expect(feld(container, t.anwesendSaal).value).toBe('70')
    expect(feld(container, t.anwesendVideo).value).toBe('')
  })

  /*
   * Review 31.10.2026: Der Saalordner hat die Karte auf dem Start offen, der
   * Zoom-Ordner trägt das Video ein, und die App des Saalordners lädt nach. Bis
   * dahin stand im Formular weiter das leere Video-Feld — Speichern schickte es
   * als `null` und löschte die Zahl des Zoom-Ordners.
   */
  it('kommt die Zahl des anderen erst nach dem Öffnen herein, steht sie im Feld — und Speichern löscht sie nicht', () => {
    const state = zustand()
    const dispatch = vi.fn()
    function Buehne({ eintrag }: { eintrag: Anwesenheit | undefined }) {
      const store = useStaticStore(state)
      return (
        <AppDispatchContext.Provider value={dispatch}>
          <AppStoreContext.Provider value={store}>
            <AppStateContext.Provider value={state}>
              <AnwesenheitFormular woche="2026-09-07" tab="mid" eintrag={eintrag} />
            </AppStateContext.Provider>
          </AppStoreContext.Provider>
        </AppDispatchContext.Provider>
      )
    }
    const { container, rerender } = render(<Buehne eintrag={undefined} />)
    rerender(<Buehne eintrag={{ woche: '2026-09-07', tab: 'mid', saal: null, video: 12, pid: 'p4' }} />)
    expect(feld(container, t.anwesendVideo).value).toBe('12')
    fireEvent.change(feld(container, t.anwesendSaal), { target: { value: '80' } })
    fireEvent.click(knopf(t.anwesendSpeichern)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'anwesenheitSetzen', woche: '2026-09-07', tab: 'mid', saal: 80, video: 12 })
  })
})

describe('Die Karte auf dem Start', () => {
  it('am Dienstag ab 19 Uhr für den Saalordner — mit dem Formular darin', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 19, 5))
    const { container } = zeige(<AnwesenheitKarte />, zustand())
    expect(container.querySelector('.anwesend-karte h2')?.textContent).toBe(t.anwesendTitel)
    expect(container.querySelector('.anwesend-formular')).not.toBeNull()
  })

  it('nicht vor Beginn der Zusammenkunft', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 18, 30))
    expect(zeige(<AnwesenheitKarte />, zustand()).container.querySelector('.anwesend-karte')).toBeNull()
  })

  it('nicht für jemanden, der in dieser Zusammenkunft nicht zählt', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 19, 5))
    expect(zeige(<AnwesenheitKarte />, zustand({ personId: 'p4' })).container.querySelector('.anwesend-karte')).toBeNull()
  })

  it('offline nicht — es ginge nichts hinaus', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 19, 5))
    expect(zeige(<AnwesenheitKarte />, zustand({ staleAt: Date.now() })).container.querySelector('.anwesend-karte')).toBeNull()
  })
})

describe('Die Zeile im Programm', () => {
  const NACH = new Date(2026, 8, 8, 21, 0)
  const MIT_ZAHL: Anwesenheit = { woche: '2026-09-07', tab: 'mid', saal: 64, video: 23, pid: 'p9' }

  it('nach der Zusammenkunft sieht jeder die Zahl — wer nicht zählt, ohne Ändern und ohne Namen', () => {
    vi.setSystemTime(NACH)
    const { container } = zeige(<AnwesenheitZeile week={woche('2026-09-07')} tab="mid" />, zustand({ personId: 'p4', anwesenheit: [MIT_ZAHL] }))
    expect(container.querySelector('.anwesend-gesamt')?.textContent).toBe(zahlBinden(fill(t.anwesendZahl, { n: 87 })))
    expect(container.textContent).toContain(zahlBinden(fill(t.anwesendSaalN, { n: 64 })))
    expect(container.textContent).toContain(zahlBinden(fill(t.anwesendVideoN, { n: 23 })))
    expect(knopf(t.aendern)).toBeUndefined()
    expect(container.textContent).not.toContain(fill(t.anwesendVon, { name: 'Simon Krüger' }))
  })

  it('der Saalordner sieht, wer eingetragen hat, und kann ändern — im Blatt', () => {
    vi.setSystemTime(NACH)
    const { container } = zeige(<AnwesenheitZeile week={woche('2026-09-07')} tab="mid" />, zustand({ anwesenheit: [MIT_ZAHL] }))
    expect(container.textContent).toContain(fill(t.anwesendVon, { name: 'Simon Krüger' }))
    fireEvent.click(knopf(t.aendern)!)
    expect(document.querySelector('[role="dialog"] .anwesend-formular')).not.toBeNull()
  })

  it('fehlt die Zahl, sieht der Saalordner „Anwesende fehlen" mit „Eintragen"', () => {
    vi.setSystemTime(NACH)
    const { container } = zeige(<AnwesenheitZeile week={woche('2026-09-07')} tab="mid" />, zustand())
    expect(container.querySelector('.anwesend-gesamt.is-fehlt')?.textContent).toBe(t.anwesendFehlt)
    expect(knopf(t.anwesendEintragen)).toBeDefined()
  })

  it('… wer nicht zählt, sieht dann nichts — und vor Beginn niemand', () => {
    vi.setSystemTime(NACH)
    expect(zeige(<AnwesenheitZeile week={woche('2026-09-07')} tab="mid" />, zustand({ personId: 'p4' })).container.innerHTML).toBe('')
    cleanup()
    vi.setSystemTime(new Date(2026, 8, 8, 12, 0))
    expect(zeige(<AnwesenheitZeile week={woche('2026-09-07')} tab="mid" />, zustand({ anwesenheit: [MIT_ZAHL] })).container.innerHTML).toBe('')
  })
})

describe('Die Anwesenheit in der Auswertung', () => {
  /**
   * Wie die Auswertung die Ansicht einbindet: die Monate des Zeitraums
   * (`useAnwesenheitMonate`) und die Zahlen in der Schrift der Sprache, wie
   * `k.zahl` sie schreibt.
   */
  function AnwesenheitAnsicht({ zeitraum }: { zeitraum: number }) {
    const { state } = useApp()
    const monate = useAnwesenheitMonate(zeitraum)
    const zahl = new Intl.NumberFormat(LOCALES[state.lang])
    return <AnwesenheitInDerAuswertung monate={monate} zahl={(n) => zahl.format(n)} />
  }
  const HEUTE = new Date(2026, 9, 12, 9, 0)
  const weeks = ['2026-09-07', '2026-09-14'].map(woche)
  const anwesenheit: Anwesenheit[] = [
    { woche: '2026-09-07', tab: 'mid', saal: 60, video: 20, pid: null },
    { woche: '2026-09-07', tab: 'we', saal: 90, video: 10, pid: null },
    { woche: '2026-09-14', tab: 'we', saal: 80, video: 10, pid: null },
  ]

  it('je Monat Zusammenkünfte und Durchschnitt, unter der Woche und am Wochenende', () => {
    vi.setSystemTime(HEUTE)
    const { container } = zeige(<AnwesenheitAnsicht zeitraum={3} />, zustand({ planner: true, weeks, anwesenheit }))
    const sept = [...container.querySelectorAll('.aw-anwesend-karte')].find((k) => k.querySelector('h3')?.textContent === 'September 2026')!
    const reihen = [...sept.querySelectorAll('.aw-anwesend-reihe')].map((r) => r.querySelector('.klein-text')?.textContent)
    expect(reihen).toEqual([
      [fill(t.awZusammenkuenfte, { n: 1 }), fill(t.awAnwesenheitSchnitt, { n: 80 })].map(zahlBinden).join(' · '),
      [fill(t.awZusammenkuenfte, { n: 2 }), fill(t.awAnwesenheitSchnitt, { n: 95 })].map(zahlBinden).join(' · '),
    ])
  })

  it('die Zahlen in der Schrift der Sprache, wie die übrige Auswertung — persisch mit persischen Ziffern (Review 30.10.2026)', () => {
    vi.setSystemTime(HEUTE)
    const { container } = zeige(<AnwesenheitAnsicht zeitraum={3} />, zustand({ planner: true, weeks, anwesenheit, lang: 'fa' }))
    const fa = dict('fa')
    const zahl = new Intl.NumberFormat(LOCALES.fa)
    const text = [...container.querySelectorAll('.aw-anwesend-reihe .klein-text')].map((r) => r.textContent).join('\n')
    expect(text).toContain(zahlBinden(fill(fa.awAnwesenheitSchnitt, { n: zahl.format(95) })))
    expect(text).not.toContain('95')
  })

  it('wo eine Zahl fehlt, steht der Tag — der Planer trägt sie per Tipp nach', () => {
    vi.setSystemTime(HEUTE)
    const { container } = zeige(<AnwesenheitAnsicht zeitraum={3} />, zustand({ planner: true, weeks, anwesenheit }))
    const fehlt = container.querySelector('.aw-anwesend-fehlt')!
    expect(fehlt.textContent).toContain(t.awAnwesenheitOhne)
    fireEvent.click(fehlt.querySelector('button')!)
    expect(document.querySelector('[role="dialog"] .anwesend-formular')).not.toBeNull()
  })

  it('ohne Planer-Recht steht der Tag nur da, ohne Knopf', () => {
    vi.setSystemTime(HEUTE)
    const { container } = zeige(<AnwesenheitAnsicht zeitraum={3} />, zustand({ planner: false, weeks, anwesenheit }))
    expect(container.querySelector('.aw-anwesend-fehlt button')).toBeNull()
  })

  it('„Für den Bericht drucken" legt je Monat eine Zeile auf den Bogen', () => {
    vi.setSystemTime(HEUTE)
    const { container } = zeige(<AnwesenheitAnsicht zeitraum={3} />, zustand({ planner: true, weeks, anwesenheit }))
    let zeilen: string[][] = []
    vi.stubGlobal('print', () => {
      zeilen = [...document.querySelectorAll('.druck-bogen .druck-tabelle-zeile:not(.druck-tabelle-zeile--kopf)')].map((z) =>
        [...z.children].map((c) => c.textContent ?? ''),
      )
    })
    fireEvent.click(knopf(t.awAnwesenheitDrucken)!)
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.print
    expect(zeilen).toEqual([['September 2026', '1', '80', '80', '2', '190', '95']])
    expect(container.querySelector('.aw-anwesend-drucken')).not.toBeNull()
  })

  it('eine Art ohne Zahl und ohne Lücke steht gar nicht da — nicht „Zusammenkünfte: 0"', () => {
    vi.setSystemTime(HEUTE)
    const nurWochenende: Anwesenheit[] = [{ woche: '2026-09-28', tab: 'we', saal: 100, video: 20, pid: null }]
    const { container } = zeige(<AnwesenheitAnsicht zeitraum={1} />, zustand({ planner: true, weeks: [], anwesenheit: nurWochenende }))
    const okt = container.querySelector('.aw-anwesend-karte')!
    expect([...okt.querySelectorAll('.aw-anwesend-name')].map((n) => n.textContent)).toEqual([t.amWochenende])
  })

  it('ohne eine einzige Zahl der Satz, dass noch keine eingetragen sind — und kein Drucken', () => {
    vi.setSystemTime(HEUTE)
    const { container } = zeige(<AnwesenheitAnsicht zeitraum={3} />, zustand({ planner: true, weeks, anwesenheit: [] }))
    expect(container.querySelector('.aw-leer')?.textContent).toBe(t.awAnwesenheitKeine)
    expect(knopf(t.awAnwesenheitDrucken)).toBeUndefined()
  })
})
