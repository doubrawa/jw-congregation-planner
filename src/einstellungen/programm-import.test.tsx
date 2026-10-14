/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { dict } from '../i18n/ui'
import type { Service, Week } from '../data/types'

/**
 * **Programm-Import — die Einstellung, die den Plan überhaupt erst möglich
 * macht.**
 *
 * Der Import ist der einzige Weg, an ein Wochenprogramm zu kommen. Auf der
 * Entwicklerseite ohne Datenbank sagt derselbe Knopf, dass er nichts holen
 * kann — vorgetäuscht wird dort kein Abruf mehr.
 *
 * Die Hilfsdienste standen bis zur Phase 6c-2 (T121) mit in dieser Datei; sie
 * prüft jetzt `HilfsdiensteInhalt.test.tsx`.
 */

const importNextWeek = vi.fn((_after?: string, _lang?: string, _alt?: string[]) =>
  Promise.resolve<{ ok: boolean; week?: Week; error?: string }>({ ok: true, week: undefined }),
)
const importWeekVariants = vi.fn((_start: string, _lang: string, _codes: string[]) =>
  Promise.resolve<{ ok: boolean; week?: Week }>({ ok: false }),
)

vi.mock('../lib/import', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  importNextWeek: (a?: string, b?: string, c?: string[]) => importNextWeek(a, b, c),
  importWeekVariants: (a: string, b: string, c: string[]) => importWeekVariants(a, b, c),
}))

const { ProgrammKarte } = await import('./ProgrammKarte')

const t = dict('de')

function woche(start: string | undefined, range = '7.–13. September'): Week {
  return {
    range, book: '', start, 
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
  } as Week
}

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/** `was` bleibt als Wort im Aufruf stehen — es sagt beim Lesen, was gezeigt wird. */
function zeige(_was: 'import', over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [], services: DIENSTE, groups: [], weeks: [], fsWeeks: [],
    congLang: 'de', progLangs: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <ProgrammKarte />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}


beforeEach(() => {
  vi.useRealTimers()
  importNextWeek.mockClear().mockResolvedValue({ ok: true, week: woche('2026-09-14') })
  importWeekVariants.mockClear().mockResolvedValue({ ok: false })
})
afterEach(cleanup)

describe('„Geladen bis" beantwortet die häufigste Frage', () => {
  it('nennt das Ende der spätesten Woche und zählt die geladenen', () => {
    const { container } = zeige('import', { weeks: [woche('2026-09-07'), woche('2026-09-14')] })
    const status = container.querySelector('.einst-stand')?.textContent ?? ''
    expect(status).toContain('20') // Sonntag der zweiten Woche, 20. September
    expect(container.querySelector('.einst-stand .klein-text')?.textContent).toBe('Geladene Wochen: 2')
  })

  it('ohne ISO-Datum (Demo, Vorlagen) den Wochenbereich im Klartext', () => {
    const { container } = zeige('import', { weeks: [woche(undefined, '7.–13. September')] })
    expect(container.querySelector('.einst-stand > :first-child')?.textContent).toContain('7.–13. September')
  })

  it('ganz ohne Woche einen eigenen Satz statt einer leeren Angabe', () => {
    const { container } = zeige('import', { weeks: [] })
    expect(container.querySelector('.einst-stand > :first-child')?.textContent).toBe(t.geladenNichts)
    expect(container.querySelector('.einst-stand .klein-text')).toBeNull()
  })
})

describe('Import in der Produktion', () => {
  it('holt die nächste Woche in der Versammlungssprache', async () => {
    const { container } = zeige('import', {
      weeks: [woche('2026-09-07')], congLang: 'en',
    })
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith('2026-09-07', 'en', []))
  })

  it('unbekannte Versammlungssprache fällt auf Deutsch zurück statt leer zu bleiben', async () => {
    const { container } = zeige('import', { congLang: 'xx-erfunden' })
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith(undefined, 'de', []))
  })

  it('weitere Programmsprachen kommen als Varianten mit — ohne die Hauptsprache doppelt', async () => {
    const { container } = zeige('import', {
      congLang: 'de', progLangs: ['en', 'de'],
    })
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith(undefined, 'de', ['en']))
  })

  it('die geholte Woche wird angehängt', async () => {
    const neue = woche('2026-09-14')
    importNextWeek.mockResolvedValue({ ok: true, week: neue })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'addImportedWeek', week: neue }),
    )
  })

  it('ein Fehler beendet den Lauf und sagt, was los ist', async () => {
    importNextWeek.mockResolvedValue({ ok: false, error: 'Keine weitere Woche verfügbar' })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'stopImport' }))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'showToast', text: 'Keine weitere Woche verfügbar',
    })
  })

  it('ohne angebundene Datenbank steht der passende Satz — nicht der vom Anmelden', async () => {
    // So endet der Knopf auch auf der Entwicklerseite: Sie hat keinen Client.
    // Bis zum 2.10.2026 hängte er dort eine erfundene Woche an (`finishImport`).
    importNextWeek.mockResolvedValue({ ok: false, error: 'ohne-datenbank' })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.importOhneDb }),
    )
  })

  it('hat das Heft keine weitere Woche, sagt der Import das — in der Sprache des Nutzers', async () => {
    importNextWeek.mockResolvedValue({ ok: false, error: 'ende' })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastAlleWochen }),
    )
  })

  it('ein unbekannter Fehler bekommt den allgemeinen Satz', async () => {
    importNextWeek.mockResolvedValue({ ok: false, error: 'unbekannt' })
    const { container, dispatch } = zeige('import')
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.importFehler }),
    )
  })

  it('fehlende Sprachvarianten geladener Wochen werden zuerst nachgezogen', async () => {
    // Eine Programmsprache, die nach dem Import hinzukam, fehlt sonst dauerhaft.
    const alt = woche('2026-09-14')
    importWeekVariants.mockResolvedValue({ ok: true, week: { ...alt, alt: { en: alt } } })
    const { container, dispatch } = zeige('import', {
      weeks: [woche('2026-09-07')], congLang: 'de', progLangs: ['en'],
    })
    fireEvent.click(container.querySelector('.einst-import')!)
    await waitFor(() => expect(importWeekVariants).toHaveBeenCalledWith('2026-09-07', 'de', ['en']))
    await waitFor(() =>
      expect(dispatch.mock.calls.some((c) => c[0].type === 'mergeWeekAlt')).toBe(true),
    )
  })

  it('mehrere Lücken werden in Blöcken geholt, nicht eine nach der anderen', async () => {
    /*
     * Wird eine zweite Programmsprache nachträglich eingerichtet, fehlt sie in
     * **jeder** geladenen Woche. Streng nacheinander lägen bei vollem
     * Ladefenster Minuten hinter einem Knopfdruck: jeder Aufruf ist eine Edge
     * Function, die rund zehn Seiten von jw.org holt.
     *
     * Gemessen wird, wie viele Aufrufe gleichzeitig offen sind — nicht die
     * Zeit: Das eine ist die Eigenschaft, das andere wäre eine Wette auf den
     * Testrechner.
     */
    let offen = 0
    let hoechstens = 0
    const warten: Array<() => void> = []
    importWeekVariants.mockImplementation((start: string) => {
      offen++
      hoechstens = Math.max(hoechstens, offen)
      return new Promise((fertig) => {
        warten.push(() => {
          offen--
          const w = woche(start)
          fertig({ ok: true, week: { ...w, alt: { en: w } } })
        })
      })
    })

    const wochen = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].map((s) => woche(s))
    const { container } = zeige('import', { weeks: wochen, congLang: 'de', progLangs: ['en'] })
    fireEvent.click(container.querySelector('.einst-import')!)

    // Erster Block: vier gleichzeitig, die fünfte wartet noch.
    await waitFor(() => expect(importWeekVariants).toHaveBeenCalledTimes(4))
    expect(hoechstens).toBe(4)
    warten.splice(0).forEach((f) => f())
    // Zweiter Block: die übrige Woche.
    await waitFor(() => expect(importWeekVariants).toHaveBeenCalledTimes(5))
    warten.splice(0).forEach((f) => f())
    // Und nie mehr als ein Block auf einmal — sonst löge die Grenze.
    expect(hoechstens).toBe(4)
  })

  it('während eines laufenden Imports löst ein zweiter Tipp nichts aus', () => {
    const { container } = zeige('import', { importing: true })
    fireEvent.click(container.querySelector('.einst-import')!)
    expect(importNextWeek).not.toHaveBeenCalled()
  })

  it('der Knopf sagt, was gerade ist', () => {
    expect(zeige('import').container.querySelector('.einst-import')?.textContent).toBe(t.importBtn)
    cleanup()
    expect(zeige('import', { importing: true }).container.querySelector('.einst-import')?.textContent)
      .toBe(t.importiere)
  })
})
